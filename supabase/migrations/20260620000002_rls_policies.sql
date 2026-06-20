-- ============================================================
-- Uknow 後端重構 — 0002 RLS 權限控制
-- ============================================================
--
-- 原則：
--  * 一般使用者只能讀寫「自己的」資料
--  * 管理員可讀寫全部
--  * 複雜寫入（付款、發獎勵、cron）由 Edge Functions 用 service_role
--    執行，service_role 會自動繞過 RLS
--  * 訪客瀏覽刊登走 public_listings View（見 0003），不直接開放 listings
-- ============================================================

-- is_admin()：用 SECURITY DEFINER 讀 profiles.is_admin，
-- 避免在 profiles 的 RLS policy 內遞迴
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 啟用所有表的 RLS
alter table public.profiles            enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.referral_codes      enable row level security;
alter table public.listings            enable row level security;
alter table public.payment_orders      enable row level security;
alter table public.referral_edges      enable row level security;
alter table public.reward_schedules    enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.withdrawals         enable row level security;
alter table public.task_progress       enable row level security;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- 註：insert 由 auth.users 的 trigger（0003）以 definer 建立；
-- 防止一般用戶把自己改成 admin 的 guard 也在 0003。

-- ------------------------------------------------------------
-- subscriptions（讀自己；寫入由 Edge Functions service_role 處理）
-- ------------------------------------------------------------
create policy subscriptions_select_own on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- referral_codes（讀自己；推薦碼驗證走 0003 的 validate_referral_code）
-- ------------------------------------------------------------
create policy referral_codes_select_own on public.referral_codes
  for select using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- listings（自己可完整 CRUD；公開瀏覽走 public_listings View）
-- ------------------------------------------------------------
create policy listings_select_own on public.listings
  for select using (user_id = auth.uid() or public.is_admin());

create policy listings_insert_own on public.listings
  for insert with check (user_id = auth.uid());

create policy listings_update_own on public.listings
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy listings_delete_own on public.listings
  for delete using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- payment_orders（讀自己；寫入由 service_role）
-- ------------------------------------------------------------
create policy payment_orders_select_own on public.payment_orders
  for select using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- referral_edges（看得到與自己相關的關係）
-- ------------------------------------------------------------
create policy referral_edges_select_related on public.referral_edges
  for select using (
    referrer_user_id = auth.uid()
    or referee_user_id = auth.uid()
    or public.is_admin()
  );

-- ------------------------------------------------------------
-- reward_schedules（讀自己作為受益人的排程）
-- ------------------------------------------------------------
create policy reward_schedules_select_own on public.reward_schedules
  for select using (beneficiary_user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- reward_transactions（讀自己的流水帳）
-- ------------------------------------------------------------
create policy reward_transactions_select_own on public.reward_transactions
  for select using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- withdrawals（讀自己；可自行申請；審核由 admin / service_role）
-- ------------------------------------------------------------
create policy withdrawals_select_own on public.withdrawals
  for select using (user_id = auth.uid() or public.is_admin());

create policy withdrawals_insert_own on public.withdrawals
  for insert with check (user_id = auth.uid() and status = 'pending');

create policy withdrawals_update_admin on public.withdrawals
  for update using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- task_progress（讀自己）
-- ------------------------------------------------------------
create policy task_progress_select_own on public.task_progress
  for select using (user_id = auth.uid() or public.is_admin());
