-- ============================================================
-- Uknow 後端重構 — 0101 (0718) 提領（withdrawal）子系統重建
-- ============================================================
--
-- 背景：前端的提領流程（WithdrawalProcess / WithdrawalSection）是照
-- 舊版 KV 後端寫的，新後端從未實作對應端點——整條提領功能是斷的。
-- 本 migration 建立資料層：
--
--   1. 狀態生命週期統一為 pending → awaiting_collection →
--      completed / rejected（原 CHECK 是 pending/approved/rejected/paid，
--      與前端字彙對不上；映射 approved→awaiting_collection、
--      paid→completed）。
--   2. 補欄位：withdrawals.fee / completed_at；
--      reward_transactions.withdrawal_id（退款可追溯）；
--      profiles.id_card_front_path / id_card_back_path（證件照跨提領
--      重用，與 referral_signature_url 同模式）。
--   3. 私有 bucket id-cards（無 storage policies = 只有 service_role
--      可存取，與 referral-signatures 同模式）。
--   4. RLS 收緊：提領的寫入只能走 SECURITY DEFINER 函數。
--   5. 帳本語意（reward_balances 重建）：
--        * ledger（reward_transactions 總和）管「可花的錢」——申請
--          當下即扣 amount+fee（天然防雙花），退件時插入補償 adjustment
--          退回。
--        * withdrawals 表管「顯示桶位」——pending（處理中，含
--          awaiting_collection）與 withdrawn（已完成）都含手續費。
--        * total_earned 排除退件退款（withdrawal_id is not null 的
--          adjustment），避免灌水歷史累積。
--   6. SQL 函數：request_withdrawal / confirm_withdrawal_collection /
--      admin_update_withdrawal_status / get_reward_summary。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 狀態枚舉統一
-- ------------------------------------------------------------
alter table public.withdrawals drop constraint withdrawals_status_check;
update public.withdrawals set status = 'awaiting_collection' where status = 'approved';
update public.withdrawals set status = 'completed'           where status = 'paid';
alter table public.withdrawals add constraint withdrawals_status_check
  check (status in ('pending', 'awaiting_collection', 'completed', 'rejected'));

-- ------------------------------------------------------------
-- 2. 欄位補齊
-- ------------------------------------------------------------
alter table public.withdrawals
  add column fee          integer not null default 15 check (fee >= 0),
  add column completed_at timestamptz;

alter table public.reward_transactions
  add column withdrawal_id uuid references public.withdrawals(id) on delete set null;

alter table public.profiles
  add column id_card_front_path text,
  add column id_card_back_path  text;

-- ------------------------------------------------------------
-- 3. 證件照私有 bucket（5MB，同前端限制）
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('id-cards', 'id-cards', false, 5242880)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. RLS 收緊：insert/update 只能走 SECURITY DEFINER 函數
--    （保留 select own —— 使用者查自己的提領記錄）
-- ------------------------------------------------------------
drop policy if exists withdrawals_insert_own  on public.withdrawals;
drop policy if exists withdrawals_update_admin on public.withdrawals;
revoke insert, update, delete on public.withdrawals from anon, authenticated;

-- ------------------------------------------------------------
-- 5. reward_balances 重建（加回 pending 桶位；欄位順序改變需 drop+create）
-- ------------------------------------------------------------
drop view if exists public.reward_balances;

create view public.reward_balances
with (security_invoker = on) as
select
  p.id as user_id,
  coalesce(t.total_earned, 0) as total_earned,
  coalesce(t.available, 0)    as available,
  coalesce(w.pending, 0)      as pending,
  coalesce(w.withdrawn, 0)    as withdrawn
from public.profiles p
left join (
  select
    user_id,
    -- 排除退件退款（withdrawal_id 非空的補償入帳），真實獲得才計入
    sum(amount) filter (where amount > 0 and withdrawal_id is null) as total_earned,
    sum(amount)                                                     as available
  from public.reward_transactions
  group by user_id
) t on t.user_id = p.id
left join (
  select
    user_id,
    sum(amount + fee) filter (where status in ('pending', 'awaiting_collection')) as pending,
    sum(amount + fee) filter (where status = 'completed')                          as withdrawn
  from public.withdrawals
  group by user_id
) w on w.user_id = p.id;

grant select on public.reward_balances to authenticated;

-- ------------------------------------------------------------
-- 6a. get_reward_summary：/rewards 與 /rewards/points-preview 共用的
--     SSOT 讀取，兩個端點永遠不會不同調。
-- ------------------------------------------------------------
create or replace function public.get_reward_summary(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_earned',        coalesce(b.total_earned, 0),
    'available',           coalesce(b.available, 0),
    'pending',             coalesce(b.pending, 0),
    'withdrawn',           coalesce(b.withdrawn, 0),
    'has_withdrawn_today', exists (
      select 1 from public.withdrawals w
      where w.user_id = p_user_id
        and public.tw_day(w.requested_at) = public.tw_day(now())
    )
  )
  from (select 1) dummy
  left join public.reward_balances b on b.user_id = p_user_id;
$$;

-- ------------------------------------------------------------
-- 6b. request_withdrawal：申請提領。
--     鎖 profiles 列（與 apply_referral_side_effects 同一把鎖——提領
--     與併發獎勵發放對同一人序列化，餘額檢查不會發生 TOCTOU 雙花）。
-- ------------------------------------------------------------
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
  v_fee        constant int := 15;
  v_min        constant int := 1000;
  v_daily_cap  constant int := 8000;
  v_joined     boolean;
  v_front      text;
  v_back       text;
  v_end_date   timestamptz;
  v_available  int;
  v_id         uuid;
  v_requested  timestamptz;
begin
  select referral_program_joined, id_card_front_path, id_card_back_path
    into v_joined, v_front, v_back
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到使用者');
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

-- ------------------------------------------------------------
-- 6c. confirm_withdrawal_collection：使用者「查收」確認。
--     不寫帳本——扣款在申請時已完成，這裡只是顯示桶位
--     pending → withdrawn 的移動。
-- ------------------------------------------------------------
create or replace function public.confirm_withdrawal_collection(
  p_user_id       uuid,
  p_withdrawal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner        uuid;
  v_status       text;
  v_completed_at timestamptz;
begin
  select user_id, status into v_owner, v_status
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_owner is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆提領記錄');
  end if;
  if v_owner <> p_user_id then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '這筆提領不屬於你');
  end if;
  if v_status = 'completed' then
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'completed');
  end if;
  if v_status <> 'awaiting_collection' then
    return jsonb_build_object('success', false, 'error_code', 'invalid_status',
      'message', '這筆提領尚未匯款，無法確認查收');
  end if;

  update public.withdrawals
  set status = 'completed', completed_at = now()
  where id = p_withdrawal_id
  returning completed_at into v_completed_at;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'completed',
    'completed_at', v_completed_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 6d. admin_update_withdrawal_status：管理端狀態轉換。
--     只允許 pending → awaiting_collection（已匯款）或
--     pending → rejected（退件，插入補償退款）。
--     awaiting_collection → rejected 禁止——錢已匯出，特殊情況走
--     人工 adjustment。
-- ------------------------------------------------------------
create or replace function public.admin_update_withdrawal_status(
  p_admin_id      uuid,
  p_withdrawal_id uuid,
  p_status        text,
  p_note          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin     boolean;
  v_user_id      uuid;
  v_status       text;
  v_amount       int;
  v_fee          int;
  v_processed_at timestamptz;
begin
  select is_admin into v_is_admin from public.profiles where id = p_admin_id;
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '僅限管理員');
  end if;

  if p_status not in ('awaiting_collection', 'rejected') then
    return jsonb_build_object('success', false, 'error_code', 'invalid_status',
      'message', '狀態只能轉為 awaiting_collection 或 rejected');
  end if;

  select user_id, status, amount, fee into v_user_id, v_status, v_amount, v_fee
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆提領記錄');
  end if;
  if v_status = p_status then
    return jsonb_build_object('success', true, 'idempotent', true, 'status', v_status);
  end if;
  if v_status <> 'pending' then
    return jsonb_build_object('success', false, 'error_code', 'invalid_transition',
      'message', format('狀態 %s 不能轉為 %s', v_status, p_status));
  end if;

  update public.withdrawals
  set status       = p_status,
      processed_at = now(),
      note         = coalesce(p_note, note)
  where id = p_withdrawal_id
  returning processed_at into v_processed_at;

  if p_status = 'rejected' then
    -- 補償退款（structural 防雙退：同一筆提領只會有一筆 adjustment）
    if not exists (
      select 1 from public.reward_transactions
      where withdrawal_id = p_withdrawal_id and type = 'adjustment'
    ) then
      insert into public.reward_transactions (user_id, type, amount, withdrawal_id, description)
      values (v_user_id, 'adjustment', v_amount + v_fee, p_withdrawal_id, '提領遭退件，點數退回');
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', p_status,
    'processed_at', v_processed_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 7. 權限：業務函數只給 service_role（default privileges，
--    見 20260717000001）
-- ------------------------------------------------------------
revoke execute on function public.get_reward_summary(uuid) from anon, authenticated, public;
revoke execute on function public.request_withdrawal(uuid, int, text, text) from anon, authenticated, public;
revoke execute on function public.confirm_withdrawal_collection(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.admin_update_withdrawal_status(uuid, uuid, text, text) from anon, authenticated, public;
