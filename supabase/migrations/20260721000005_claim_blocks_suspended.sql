-- ============================================================
-- Uknow — 0721 (5) 領取「免費續約 1 年」credit：停權者比照到期者一律不得領取
-- ============================================================
-- 業務決策（2026-07-21）：停權（suspended）與到期（expired）一樣，
-- 都不得領取推薦王的「免費續約 1 年」credit。
--
-- 背景：suspended 是 admin 手動停權（profiles.suspended_at，見 0718 0102），
-- 與會籍狀態（active/expired，由訂閱日期即時算）是正交的兩軸。0721 0004
-- 只對齊了「到期」這一軸；本 migration 補上「停權」這一軸，讓「領免費續約」
-- 與「提領（request_withdrawal）」「刊登可見（has_active_subscription）」
-- 用同一把尺——三者皆同時擋 expired 與 suspended。
--
-- 守衛順序、error_code、訊息刻意與 request_withdrawal（0720 0001）逐字對齊：
--   1. 停權優先擋 → error_code 'suspended'
--   2. 再擋到期   → error_code 'subscription_invalid'
-- 兩者都不改動 credit 狀態（維持 unclaimed，解除停權/續訂後仍可領）。
--
-- 冪等性維持：已 claimed 的 credit 仍在停權/到期檢查「之前」回傳 idempotent
-- success——當初在正常 active 狀態領過就算數，不因日後停權或到期而翻案。
-- 其餘行為（鎖定、擁有權、延展計算、vestigial 的 grace_period_end 寫入）
-- 與 0721 0004 版本逐字相同。
-- ============================================================

create or replace function public.claim_referral_king_reward(
  p_user_id   uuid,
  p_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_user_id uuid;
  v_reward_status  text;
  v_suspended      timestamptz;
  v_sub_id         uuid;
  v_old_end        timestamptz;
  v_new_last_day   date;
  v_new_end        timestamptz;
  v_new_grace      timestamptz;
begin
  -- 鎖定這筆 reward，防止雙擊/併發請求同時處理同一筆。
  select user_id, status into v_reward_user_id, v_reward_status
  from public.referral_king_rewards
  where id = p_reward_id
  for update;

  if v_reward_user_id is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆獎勵紀錄');
  end if;

  if v_reward_user_id <> p_user_id then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '這筆獎勵不屬於你');
  end if;

  if v_reward_status = 'claimed' then
    -- 已領取：冪等回傳成功，不重複延展。刻意放在停權/到期檢查之前——
    -- 當初於正常 active 狀態領取就算數，不因會員日後停權或到期而翻案。
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'claimed');
  end if;

  -- 鎖定該用戶「目前」訂閱：跟 user_account_status 一樣的判斷邏輯
  -- （依 end_date 排序取最新一筆，不管該筆現在是否仍在效期內）。
  select id, end_date into v_sub_id, v_old_end
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object('success', false, 'error_code', 'no_subscription', 'message', '找不到可延展的訂閱紀錄，請聯繫客服');
  end if;

  -- ★ 停權與到期都不得領取（與 request_withdrawal 同一把尺）。
  -- 停權優先擋（與提領一致）：admin 停權的意義是凍結該帳號，
  -- 免費續約等同延長會籍，停權期間不得動用。
  select suspended_at into v_suspended from public.profiles where id = p_user_id;
  if v_suspended is not null then
    return jsonb_build_object(
      'success', false,
      'error_code', 'suspended',
      'message', '帳號已停權，無法領取免費續約，請聯繫客服'
    );
  end if;

  -- 到期不得領取：不允許到期會員用 credit 免費復活。判準與
  -- user_account_status view 一致（end_date 為 null 或已過 → expired）。
  if v_old_end is null or now() > v_old_end then
    return jsonb_build_object(
      'success', false,
      'error_code', 'subscription_invalid',
      'message', '會員資格已失效，請先續訂會員後再領取免費續約'
    );
  end if;

  v_new_last_day := (public.tw_day(v_old_end) + interval '1 year')::date;
  v_new_end      := public.tw_end_of_day(v_new_last_day);
  v_new_grace    := public.tw_end_of_day(v_new_last_day + 60);

  update public.subscriptions
  set end_date = v_new_end, grace_period_end = v_new_grace
  where id = v_sub_id;

  update public.referral_king_rewards
  set status = 'claimed', claimed_at = now(), resulting_subscription_id = v_sub_id
  where id = p_reward_id;

  return jsonb_build_object(
    'success',        true,
    'subscriptionId', v_sub_id,
    'activeUntil',    v_new_end,
    'gracePeriodEnd', v_new_grace
  );

exception when others then
  raise exception 'claim_referral_king_reward 失敗: %', sqlerrm;
end;
$$;

-- 權限維持既有慣例：業務函數只給 service_role，對 anon/authenticated revoke。
revoke execute on function public.claim_referral_king_reward(uuid, uuid) from anon, authenticated, public;
