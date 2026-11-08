-- ============================================================
-- 批次自癒與線上付款互鎖（第 6 波 S1；R5 P2-5、P2-7～9；W5-72、W6-8、W6-10～14；
-- 見 heal-lock-split.test.ts）
-- ============================================================
--
-- 為什麼：complete_paid_pending_orders 是單一交易，迴圈處理多位付款人。子交易正常結束時
--   列鎖併入上層交易、到整批 commit 才放，所以前一筆的 profiles(本人) for update 一路留著。
--   U1 是 X 的推薦人、X 是 U2 的推薦人：heal 持 profiles(U1)、處理 U2 發第 1 代給 X 要
--   KEY SHARE profiles(X)；線上 X 付款持 profiles(X)、發第 1 代給 U1 要 KEY SHARE profiles(U1)
--   → 40P01，被選中的一方該代獎金被 when others 吞掉。
--   plpgsql 函式不能 commit；procedure 可以但 PostgREST rpc() 叫不到，而 heal 必須跑在 Edge 的
--   租約與帳本內 → 改由 Edge 逐筆呼叫單筆函式（paid-pending-heal.ts），一筆一個交易。
--
-- 修法（基準與唯一差異）：
--   1. list_paid_pending_order_ids（新）：基準＝20261113000003 complete_paid_pending_orders 的候選
--      查詢。候選謂詞的唯一出處；不上鎖。
--   2. complete_paid_pending_order（新）：基準＝同上的迴圈體。唯一差異：
--      a. 開頭設 uknow.rewire_try_lock＝on、結尾不清（交易層設定，RPC 交易結束自然失效）；
--      b. 0b 鎖預取：委派前在自己的子交易內以 lock_timeout 3s 取付款人 profiles for update，
--         55P03 → skipped_locked。lock_timeout 只包這一步——整筆設的話也會套到發獎子交易的
--         FK 等待，55P03 會被那裡的 when others 吞成漏發。預取後還原成預取前的值。
--         順序因此變成「訂單列 → profiles(本人) → 換線 advisory」，與 0a′ 註解要求的相反；
--         成立的前提是 heal 路徑的換線鎖一律 try（a），拿不到就 U6R01 回滾、放掉 profiles。
--   3. complete_paid_pending_orders：基準＝20261113000003。改成 list → 逐筆呼叫 2 的 wrapper，
--      回傳形狀不變（skipped_locked＝單筆的 skipped＋skipped_locked，與舊版混計同義）；
--      迴圈結束後清旗標。仍是單一交易、互鎖風險同舊版——只給新 migration 已套、舊 Edge 未換的
--      空窗用。退場：S6 drop（W6-14）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. list_paid_pending_order_ids
-- ------------------------------------------------------------
create or replace function public.list_paid_pending_order_ids(
  p_user_id uuid default null,  -- 限定單一使用者（即時自癒）；null = 全量（排程對帳）
  p_limit   int  default 50
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  -- 固定依 created_at 排序，讓「單人自癒」與「全量對帳」處理順序一致。
  select coalesce(array_agg(id order by created_at), '{}'::uuid[])
  from (
    select id, created_at
    from public.payment_orders
    where status = 'pending'
      and payuni_response->>'Status' = 'SUCCESS'
      and (p_user_id is null or user_id = p_user_id)
    order by created_at
    limit p_limit
  ) c;
$$;

revoke execute on function public.list_paid_pending_order_ids(uuid, int) from anon, authenticated, public;
grant execute on function public.list_paid_pending_order_ids(uuid, int) to service_role;

-- ------------------------------------------------------------
-- 2. complete_paid_pending_order
-- ------------------------------------------------------------
create or replace function public.complete_paid_pending_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       record;
  v_trade_amt numeric;
  v_prev_lt   text;
begin
  -- 本交易內的付款完成改用 try 取換線鎖（見 process_successful_payment 0a′、W5-61）。
  -- 在任何子交易之外設：子交易回滾會還原 GUC。結尾不清（交易層設定，交易結束自然失效）。
  perform set_config('uknow.rewire_try_lock', 'on', true);

  begin
    -- 拿鎖後重讀重驗謂詞（TOCTOU 防禦）：已被 notify／另一次自癒處理完 → 謂詞不成立；
    -- 對方還握著訂單列 → skip locked 拿不到。兩者分不出來，一律記 skipped（同舊版）。
    -- 失敗回應（Status != 'SUCCESS'）永遠過不了這個謂詞，不可能被誤補成 completed。
    select id, user_id, transaction_id, payuni_response
      into v_row
    from public.payment_orders
    where id = p_order_id
      and status = 'pending'
      and payuni_response->>'Status' = 'SUCCESS'
    for update skip locked;

    if v_row.id is null then
      return jsonb_build_object('outcome', 'skipped');
    end if;

    -- 金額重驗（鏡射 resolveOrderFromPayUni：TradeAmt 存在且 != 1200 才算不符；缺欄位寬容）。
    v_trade_amt := null;
    begin
      if coalesce(v_row.payuni_response->>'TradeAmt', '') <> '' then
        v_trade_amt := (v_row.payuni_response->>'TradeAmt')::numeric;
      end if;
    exception when others then
      v_trade_amt := -1;  -- 無法解析一律視同金額不符
    end;

    if v_trade_amt is not null and v_trade_amt <> 1200 then
      -- 錢可能已刷：絕不自動補完、也絕不自動標失敗，維持 pending 交人工。
      -- 告警去重：同一筆訂單已有未解決的告警就不重寫。
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
      return jsonb_build_object('outcome', 'amount_mismatch');
    end if;

    -- 0b 鎖預取：只有這一步帶 lock_timeout（見檔頭 2b）。
    v_prev_lt := current_setting('lock_timeout');
    begin
      perform set_config('lock_timeout', '3s', true);
      perform 1 from public.profiles where id = v_row.user_id for update;
      perform set_config('lock_timeout', v_prev_lt, true);
    exception when lock_not_available then
      perform set_config('lock_timeout', v_prev_lt, true);
      return jsonb_build_object('outcome', 'skipped_locked');
    end;

    -- 委派既有的付款處理函數（profiles 已在手上，0b 重入不等）。
    -- TradeNo 空值時退回 MerTradeNo，與 resolveOrderFromPayUni 一致。
    perform public.process_successful_payment(
      v_row.user_id,
      v_row.transaction_id,
      coalesce(nullif(v_row.payuni_response->>'TradeNo', ''), v_row.transaction_id),
      v_row.payuni_response
    );
    return jsonb_build_object('outcome', 'completed');

  exception
    when sqlstate 'U6R01' then
      -- 換線鎖被線上付款持有 → 跳過，下一輪再補；不是錯誤（W5-61）。
      return jsonb_build_object('outcome', 'skipped_locked');
    when others then
      perform public.log_system_alert('complete_paid_pending_orders', 'error', sqlerrm,
        jsonb_build_object('order_id', p_order_id));
      raise warning 'complete_paid_pending_order：補完訂單 % 失敗: %', p_order_id, sqlerrm;
      return jsonb_build_object('outcome', 'failed', 'error', sqlerrm);
  end;
end;
$$;

revoke execute on function public.complete_paid_pending_order(uuid) from anon, authenticated, public;
grant execute on function public.complete_paid_pending_order(uuid) to service_role;

-- ------------------------------------------------------------
-- 3. complete_paid_pending_orders（舊 Edge 相容 wrapper；S6 drop）
-- ------------------------------------------------------------
create or replace function public.complete_paid_pending_orders(
  p_user_id uuid default null,
  p_limit   int  default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_ids       uuid[];
  v_r         jsonb;
  v_completed uuid[] := '{}';
  v_failed    jsonb  := '[]'::jsonb;
  v_mismatch  int := 0;
  v_skipped   int := 0;
begin
  v_ids := public.list_paid_pending_order_ids(p_user_id, p_limit);
  foreach v_id in array v_ids loop
    v_r := public.complete_paid_pending_order(v_id);
    case v_r->>'outcome'
      when 'completed' then v_completed := array_append(v_completed, v_id);
      when 'amount_mismatch' then v_mismatch := v_mismatch + 1;
      when 'failed' then
        v_failed := v_failed || jsonb_build_object('order_id', v_id, 'error', v_r->>'error');
      else v_skipped := v_skipped + 1;
    end case;
  end loop;

  -- 單筆函式不清旗標；同一交易後續若還有線上付款，不能被誤改成 try。
  perform set_config('uknow.rewire_try_lock', '', true);
  return jsonb_build_object(
    'candidates_found',    coalesce(array_length(v_ids, 1), 0),
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
