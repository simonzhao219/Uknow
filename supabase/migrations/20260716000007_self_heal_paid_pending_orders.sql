-- ============================================================
-- Uknow 後端重構 — 0007 (0716) 自癒卡單訂單：pending + PayUni SUCCESS 收斂
-- ============================================================
--
-- 背景（生產事故，訂單 202607160740314QE7）：
-- 舊版 process_successful_payment 拋例外 → 整筆交易回滾（訂單留在
-- pending），edge function 隨後用 persistRawResponseBestEffort 把 PayUni
-- 的 SUCCESS 原始回應單獨補寫回訂單 —— 形成「status=pending 但
-- payuni_response.Status=SUCCESS」的矛盾狀態。此時：
--   * repair_orphaned_payments 只掃 completed 訂單，救不到；
--   * reconcile 需要 PayUni 查詢交易 API（合約未知、尚未實作），也救不到；
--   * 使用者被 effective_registration_step=2 永久困在付款結果頁。
--
-- 這個函數把「訂單上已存的 payuni_response」從純診斷資料升級為復原資料
-- 來源：那是解密驗簽過的 PayUni 原始回應，PayUni 已經說過 SUCCESS，我們
-- 就有義務讓它決定性地收斂成訂閱。所有業務邏輯（鎖、冪等、續約判斷、
-- 推薦周邊）一律委派給既有的 process_successful_payment，不重複實作。
--
-- 呼叫時機（edge function 端，皆為 best-effort）：
--   1. buildProfileResponse：step=2 且有 SUCCESS 存檔時（使用者一登入就自癒）
--   2. GET /payuni/result/:tradeNo：訂單 pending 但存檔說 SUCCESS
--   3. /internal/reconcile-pending-payments：排程全量掃描
-- ============================================================

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
  -- 先掃出候選（不上鎖）。固定依 created_at 排序，讓「單人自癒」與
  -- 「全量對帳」的鎖取得順序一致，避免互相死鎖。
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
      -- 拿鎖後重讀重驗謂詞（TOCTOU 防禦）：
      --   * 幾乎同時到達的 notify webhook / 另一次自癒已把它處理完
      --     → 重讀時謂詞不成立，跳過；
      --   * 對方還握著鎖在處理 → skip locked 直接跳過（工作已有人做）。
      -- 失敗回應（Status != 'SUCCESS'）永遠過不了這個謂詞，
      -- 不可能被誤補成 completed。
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

      -- 金額重驗（鏡射 resolveOrderFromPayUni 的 TS 語意：TradeAmt 存在
      -- 且 != 1200 才算不符；缺欄位時寬容）。必須重驗：edge function 在
      -- 金額不符時也會把原始回應存進 payuni_response，不能因此補完訂單。
      v_trade_amt := null;
      begin
        if coalesce(v_row.payuni_response->>'TradeAmt', '') <> '' then
          v_trade_amt := (v_row.payuni_response->>'TradeAmt')::numeric;
        end if;
      exception when others then
        v_trade_amt := -1;  -- 無法解析一律視同金額不符
      end;

      if v_trade_amt is not null and v_trade_amt <> 1200 then
        -- 金額不符：錢可能已刷，絕不自動補完、也絕不自動標失敗——
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
            'PayUni 回應金額與方案價不符，訂單維持 pending 待人工裁決',
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

      -- 委派給既有的付款處理函數（同一交易內重複上鎖是 no-op）。
      -- TradeNo 空值時退回 MerTradeNo，與 resolveOrderFromPayUni 一致。
      perform public.process_successful_payment(
        v_row.user_id,
        v_row.transaction_id,
        coalesce(nullif(v_row.payuni_response->>'TradeNo', ''), v_row.transaction_id),
        v_row.payuni_response
      );

      v_completed := array_append(v_completed, v_row.id);

    exception when others then
      -- 單筆失敗不影響其他候選（與 repair_orphaned_payments 相同策略）。
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

-- 只有 service_role / postgres 可呼叫（不對前端暴露）
revoke execute on function public.complete_paid_pending_orders(uuid, int) from anon, authenticated, public;
grant execute on function public.complete_paid_pending_orders(uuid, int) to service_role;
