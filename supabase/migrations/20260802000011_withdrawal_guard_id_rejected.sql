-- ============================================================
-- 提領守衛 #5a：證件被退回者不得提領
-- ============================================================
--
-- 需求方裁決（規劃書 §2.1 / 審查 P0-3）:證件審核結果**只在 rejected 時**
-- 阻擋提領。
--
-- 為什麼不擋 pending:真正的關卡是**匯款**不是申請——admin 本來就不會在
-- 沒核對證件的情況下把錢轉出去。在申請端擋「還沒輪到審核」的人不增加
-- 實質保護,只讓每個新會員的首次提領多等三個工作天。
--
-- 為什麼 #5a 排在 #5b（照片存在檢查）之前:rejected 帶得出「為什麼」,
-- 而 missing_id_photos 只會叫人重傳。對一個已經被 admin 看過並退回的人,
-- 後者是誤導——他會重送一模一樣的照片,然後再被退一次。
--
-- none / pending / approved 一律落到 #5b 的現行檢查,因此**既有會員
-- （狀態 none、照片齊全）行為完全不變**,不需要 backfill 才能通過。
--
-- 基準 = 20260720000001_wave4_guards.sql 的 request_withdrawal（該版加了
-- 停權守衛）。唯一差異:首查多取 id_verification_status / id_reject_reason,
-- 並在照片檢查前插入 #5a。**回滾時從該檔取回原版。**
-- ============================================================

create or replace function public.request_withdrawal(
  p_user_id      uuid,
  p_amount       int,
  p_bank_code    text,
  p_bank_account text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee         constant int := 15;
  v_min         constant int := 1000;
  v_daily_cap   constant int := 8000;
  v_joined      boolean;
  v_suspended   timestamptz;
  v_front       text;
  v_back        text;
  v_id_status   text;
  v_id_reason   text;
  v_end_date    timestamptz;
  v_available   int;
  v_id          uuid;
  v_requested   timestamptz;
begin
  select referral_program_joined, suspended_at, id_card_front_path, id_card_back_path,
         id_verification_status, id_reject_reason
    into v_joined, v_suspended, v_front, v_back, v_id_status, v_id_reason
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到使用者');
  end if;

  -- 停權會員不得提領：停權的意義是凍結濫用者，提領是資金流出的
  -- 最後一道門，必須第一個擋。
  if v_suspended is not null then
    return jsonb_build_object('success', false, 'error_code', 'suspended',
      'message', '帳號已停權，無法申請提領，請聯繫客服');
  end if;

  if not coalesce(v_joined, false) then
    return jsonb_build_object('success', false, 'error_code', 'not_joined', 'message', '尚未加入推薦計畫，無法提領');
  end if;

  if p_amount < v_min or p_amount % v_min <> 0 or p_amount > v_daily_cap then
    return jsonb_build_object('success', false, 'error_code', 'invalid_amount',
      'message', format('提領金額需為 %s 的倍數，且單日不超過 %s', v_min, v_daily_cap));
  end if;

  -- 會籍需在效期內（寬限期/失效都不能提領）
  select end_date into v_end_date
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1;

  if v_end_date is null or now() > v_end_date then
    return jsonb_build_object('success', false, 'error_code', 'subscription_invalid',
      'message', '會籍已到期，續訂後才能提領');
  end if;

  -- #5a（新）：證件已被 admin 退回。理由必須帶到會員面前——只說「被退回」
  -- 會讓人重送一模一樣的照片再被退一次。
  if v_id_status = 'rejected' then
    return jsonb_build_object('success', false, 'error_code', 'id_rejected',
      'message', format('證件審核未通過：%s。請重新上傳證件後再申請提領',
        coalesce(nullif(v_id_reason, ''), '請聯繫客服了解原因')));
  end if;

  -- #5b：現行檢查不動。none / pending / approved 都走到這裡。
  if v_front is null or v_back is null then
    return jsonb_build_object('success', false, 'error_code', 'missing_id_photos',
      'message', '請先上傳身分證正反面照片');
  end if;

  -- 一天一次（台灣日曆日；含被退件的申請——隔天才能重新申請）
  if exists (
    select 1 from public.withdrawals
    where user_id = p_user_id
      and public.tw_day(requested_at) = public.tw_day(now())
  ) then
    return jsonb_build_object('success', false, 'error_code', 'already_withdrawn_today',
      'message', '今日已申請過提領，請明天再試');
  end if;

  select coalesce(sum(amount), 0) into v_available
  from public.reward_transactions
  where user_id = p_user_id;

  if v_available < p_amount + v_fee then
    return jsonb_build_object('success', false, 'error_code', 'insufficient_balance',
      'message', format('可提領點數不足（需 %s P，含手續費 %s P）', p_amount + v_fee, v_fee));
  end if;

  -- 原子寫入：提領單（快照銀行資訊）+ 帳本即扣 amount+fee
  insert into public.withdrawals (user_id, amount, fee, status, bank_code, bank_account)
  values (p_user_id, p_amount, v_fee, 'pending', p_bank_code, p_bank_account)
  returning id, requested_at into v_id, v_requested;

  insert into public.reward_transactions (user_id, type, amount, withdrawal_id, description)
  values (p_user_id, 'withdrawal', -(p_amount + v_fee), v_id,
          format('提領申請（%s P + 手續費 %s P）', p_amount, v_fee));

  -- 順手把最新銀行資訊留在 profiles（下次提領自動帶入）
  update public.profiles
  set bank_code = p_bank_code, bank_account = p_bank_account
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', v_id,
    'status', 'pending',
    'amount', p_amount,
    'fee', v_fee,
    'requested_at', v_requested
  );
end;
$$;

-- create or replace 會沿用原權限，但仍明寫一次：Postgres 對函數 EXECUTE
-- 預設授予 PUBLIC，而 PostgREST 的 rpc 端點不經過 Edge Function 的守門。
-- 日後有人複製這段 migration 時不會漏掉（規劃書 §2.5）。
revoke execute on function public.request_withdrawal(uuid, int, text, text)
  from anon, authenticated, public;
