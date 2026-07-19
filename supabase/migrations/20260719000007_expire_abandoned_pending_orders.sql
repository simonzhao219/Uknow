-- ============================================================
-- Uknow — 過期清理「開了 PayUni 卻從未付款」的孤兒 pending 訂單
-- ============================================================
--
-- 系統性缺口：
--   /payuni/prepare 一定先把訂單寫成 pending、再把使用者導去 PayUni。若使用者
--   在 PayUni 頁面直接關掉、從未完成付款，這筆訂單就永遠停在 pending：
--     * reconcile 對帳（reconcilePendingOrders → queryPayUniTradeStatus）對
--       「查無交易 / 未付款」一律回 stillProcessing（刻意「不確定不誤標」），
--       所以永遠不會把它收尾；
--     * 這讓該使用者的 effective_registration_step 永久停在 2，且累積髒單。
--
-- 為什麼可以安全地按時間過期：
--   PayUni 的付款連結有效期是建單日 +3 天（見 /payuni/prepare 的 ExpireDate）。
--   一旦超過，該筆 MerTradeNo 再也不可能成功，因此「建立已久、且從未收到任何
--   PayUni 判決」的 pending 訂單可判定為放棄，安全地標記為 cancelled。
--
-- 安全條件（缺一不可）：
--   * status = 'pending'（completed/failed/cancelled 不動）；
--   * created_at 早於門檻（預設 4 天，比 3 天連結效期多留一天緩衝）；
--   * 「未曾收到 SUCCESS 回應」—— payuni_response 為 null，或其 Status 不是
--     SUCCESS。已存有 SUCCESS 的卡單是 complete_paid_pending_orders 的自癒
--     對象（付了錢但 webhook 沒送達），絕不能被誤標為 cancelled。
--
-- 回傳被取消的筆數，供對帳排程記錄。
-- ============================================================

create or replace function public.expire_abandoned_pending_orders(
  p_expiry_days int default 4
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.payment_orders
    set status = 'cancelled',
        -- 保留任何既有回應；只在原本沒有回應時，補一個可稽核的過期標記。
        payuni_response = coalesce(
          payuni_response,
          jsonb_build_object(
            'Status', 'EXPIRED',
            '_reason', 'abandoned pending: opened PayUni but never paid; expired past payment-link lifetime'
          )
        )
    where status = 'pending'
      and created_at < now() - make_interval(days => p_expiry_days)
      and (payuni_response is null or payuni_response->>'Status' is distinct from 'SUCCESS')
    returning 1
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$$;

grant execute on function public.expire_abandoned_pending_orders(int) to service_role;

comment on function public.expire_abandoned_pending_orders(int) is
  '將「建立已久且從未收到 PayUni SUCCESS 回應」的 pending 訂單標記為 cancelled，'
  '收尾使用者開了 PayUni 卻從未付款所留下的孤兒訂單。排除已存 SUCCESS 的自癒卡單。'
  '由對帳排程 /internal/reconcile-pending-payments 呼叫。';
