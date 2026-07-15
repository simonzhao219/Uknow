-- payment_orders.transaction_id 目前沒有唯一性約束，但 webhook / return 端點
-- 都用 `.eq('transaction_id', ...).single()` 查詢，重複列會導致查詢直接出錯。
-- 部署前請先確認沒有既存重複值：
--   select transaction_id, count(*) from payment_orders
--   where transaction_id is not null group by transaction_id having count(*) > 1;
create unique index if not exists payment_orders_transaction_id_unique
  on public.payment_orders (transaction_id)
  where transaction_id is not null;
