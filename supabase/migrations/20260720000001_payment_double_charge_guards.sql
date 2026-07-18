-- ============================================================
-- Uknow — 0719 0002 金流防重複扣款強化（H1、L4）
-- ============================================================
--
-- H1（防禦縱深）：一筆 payment_orders 最多只能收斂成一筆 subscriptions。
--   目前僅靠 process_successful_payment 的訂單列鎖 + subscriptions
--   .payment_transaction_id 的 unique index 防重；再補一道結構性唯一鍵
--   （source_payment_order_id）作為縱深防禦，任何路徑都不可能對同一筆
--   付款事件建出兩筆訂閱。
--   ⚠️ 部署前請先確認沒有既存重複值：
--     select source_payment_order_id, count(*)
--     from public.subscriptions
--     where source_payment_order_id is not null
--     group by source_payment_order_id having count(*) > 1;
--
-- L4（金額驗證改強制）：complete_paid_pending_orders 原本「TradeAmt 缺席
--   時寬容放行」，與 edge function 端 resolveOrderFromPayUni 一起改為
--   「缺席或非 1200 一律 park 待人工」，不再自動補完金額不明的訂單。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 一筆訂單一筆訂閱（partial unique）
-- ------------------------------------------------------------
create unique index if not exists subscriptions_source_payment_order_id_unique
  on public.subscriptions (source_payment_order_id)
  where source_payment_order_id is not null;

-- ------------------------------------------------------------
-- 2. complete_paid_pending_orders：金額缺席也視為不符（park）。
--    唯一實質差異是 3 的金額判斷 `is not null and <> 1200`
--    → `is null or <> 1200`；其餘（鎖、TOCTOU、委派、告警去重）原封不動。
-- ------------------------------------------------------------
create or replace function public.complete_paid_pending_orders(
  p_user_id uuid default null,  -- 限定單一使用者（即時自癒）；null = 全量（排程對帳）
  p_limit   int  default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_id uuid;
  v_row          record;
  v_trade_amt    numeric;
  v_completed    uuid[] := '{}';
  v_failed       jsonb  := '[]'::jsonb;
  v_found        int := 0;
  v_mismatch     int := 0;
  v_skipped      int := 0;
begin
  for v_candidate_id in
    select id
    from public.payment_orders
    where status = 'pending'
      and payuni_response->>'Status' = 'SUCCESS'
      and (p_user_id is null or user_id = p_user_id)
    order by created_at
    limit p_limit
  loop
    v_found := v_found + 1;
    begin
      select id, user_id, transaction_id, payuni_response
        into v_row
      from public.payment_orders
      where id = v_candidate_id
        and status = 'pending'
        and payuni_response->>'Status' = 'SUCCESS'
      for update skip locked;

      if v_row.id is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- 金額重驗（L4：鏡射 resolveOrderFromPayUni 的強制語意——TradeAmt
      -- 缺席、無法解析、或 != 1200 一律視同不符）。
      v_trade_amt := null;
      begin
        if coalesce(v_row.payuni_response->>'TradeAmt', '') <> '' then
          v_trade_amt := (v_row.payuni_response->>'TradeAmt')::numeric;
        end if;
      exception when others then
        v_trade_amt := -1;  -- 無法解析一律視同金額不符
      end;

      if v_trade_amt is null or v_trade_amt <> 1200 then
        -- 金額缺漏/不符：錢可能已刷，絕不自動補完、也絕不自動標失敗——
        -- 維持 pending 交人工裁決。告警去重：同一筆訂單已有未解決的
        -- 告警就不重寫，避免使用者每次載入 profile 都洗一筆。
        v_mismatch := v_mismatch + 1;
        if not exists (
          select 1 from public.system_alerts
          where source = 'complete_paid_pending_orders'
            and resolved_at is null
            and context->>'order_id' = v_row.id::text
        ) then
          perform public.log_system_alert(
            'complete_paid_pending_orders', 'error',
            'PayUni 回應金額缺漏或與方案價不符，訂單維持 pending 待人工裁決',
            jsonb_build_object(
              'order_id',  v_row.id,
              'trade_no',  v_row.transaction_id,
              'user_id',   v_row.user_id,
              'trade_amt', v_row.payuni_response->>'TradeAmt'
            )
          );
        end if;
        continue;
      end if;

      perform public.process_successful_payment(
        v_row.user_id,
        v_row.transaction_id,
        coalesce(nullif(v_row.payuni_response->>'TradeNo', ''), v_row.transaction_id),
        v_row.payuni_response
      );

      v_completed := array_append(v_completed, v_row.id);

    exception when others then
      v_failed := v_failed || jsonb_build_object('order_id', v_candidate_id, 'error', sqlerrm);
      perform public.log_system_alert('complete_paid_pending_orders', 'error', sqlerrm,
        jsonb_build_object('order_id', v_candidate_id));
      raise warning 'complete_paid_pending_orders：補完訂單 % 失敗: %', v_candidate_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'candidates_found',    v_found,
    'completed_count',     coalesce(array_length(v_completed, 1), 0),
    'completed_order_ids', to_jsonb(v_completed),
    'amount_mismatch',     v_mismatch,
    'skipped_locked',      v_skipped,
    'failed',              v_failed
  );
end;
$$;

revoke execute on function public.complete_paid_pending_orders(uuid, int) from anon, authenticated, public;
grant execute on function public.complete_paid_pending_orders(uuid, int) to service_role;
