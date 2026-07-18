-- ============================================================
-- Uknow 後端重構 — 0003 (0718) 獎勵明細逐列餘額 view
-- ============================================================
--
-- GET /rewards/history 要在每一列顯示「該筆之後的餘額」。Supabase JS
-- 無法表達 window function，所以用 view 把 SQL 留在資料庫端當 SSOT
-- （與 reward_balances 同一模式）。
--
-- balance_after = 帳本淨額（sum(amount) 至該列為止）。刻意不扣除
-- 處理中的提領以外的東西——與 reward_balances.available 的口徑一致。
-- ============================================================

create view public.reward_transactions_with_balance
with (security_invoker = on) as
select
  t.*,
  sum(t.amount) over (
    partition by t.user_id
    order by t.created_at, t.id
  ) as balance_after
from public.reward_transactions t;

-- edge function 走 service_role（default privileges 已涵蓋）；
-- 不開放 anon/authenticated 直查。
revoke all on public.reward_transactions_with_balance from anon, authenticated;
