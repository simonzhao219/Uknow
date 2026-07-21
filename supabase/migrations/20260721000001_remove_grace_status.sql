-- ============================================================
-- Uknow 後端重構 — 0721 移除「寬限期 (grace)」狀態，會員狀態改兩態
-- ============================================================
--
-- 業務決策：取消 60 天寬限期緩衝。會員狀態只剩兩態：
--   active  ：now() <= end_date（仍在效期內）
--   expired ：now() > end_date，或從未訂閱
-- 「到期即失效」——不再有 end_date 之後的 60 天過渡窗。
--
-- 影響面（皆收斂在本檔）：
--   1. user_account_status view —— case 從三分支收成兩分支，
--      不再依 grace_period_end 判斷狀態。
--   2. has_active_subscription() —— 可見性（RLS policy
--      listings_select_public + public_listings view）改以 end_date
--      為界：到期即隱藏，不再多撐 60 天。
--
-- 保留但停用於狀態判斷：
--   * subscriptions.grace_period_end 欄位不移除——續約 extend 的
--     「過期超過一年」判斷用的是 end_date，不受影響；claim_referral_
--     king_reward / 訂閱建立仍寫入該欄位，維持資料完整。狀態與可見性
--     不再讀它。
-- ============================================================

-- ------------------------------------------------------------
-- 1. user_account_status：兩態（active / expired）。
--    欄位與順序與 0003 完全相同（create or replace view 要求），
--    僅移除 grace 分支。
-- ------------------------------------------------------------
create or replace view public.user_account_status
with (security_invoker = on) as
select
  p.id as user_id,
  case
    when s.end_date is null    then 'expired'
    when now() <= s.end_date   then 'active'
    else 'expired'
  end as status,
  s.end_date,
  s.grace_period_end,
  s.is_canceled
from public.profiles p
left join lateral (
  select sub.end_date, sub.grace_period_end, sub.is_canceled
  from public.subscriptions sub
  where sub.user_id = p.id
  order by sub.end_date desc
  limit 1
) s on true;

-- ------------------------------------------------------------
-- 2. has_active_subscription：可見性以 end_date 為界（到期即隱藏）。
--    仍先擋停權（suspended_at）。一處修改，listings_select_public
--    RLS policy 與 public_listings view 同時生效。
-- ------------------------------------------------------------
create or replace function public.has_active_subscription(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id and now() <= s.end_date
  )
  and not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.suspended_at is not null
  );
$$;
