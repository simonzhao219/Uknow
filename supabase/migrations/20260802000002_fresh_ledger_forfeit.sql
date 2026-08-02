-- ============================================================
-- Uknow — 0802 (2) A13 fresh 清空帳本（renewal-backfill 階段 2）
-- ============================================================
--
-- 規則（plan renewal-backfill A13-A16 / rules.md M5、M8）：
--   * 選 fresh（新約）且非首購的付款「成功當下」，把帳本清空：
--     - 點數：插入一筆負額沖銷列（type = ledger_reset，顯示名「新約重置」），
--       金額 = 當下可提領餘額（流水帳淨額）。帳本只增不刪，明細全數封存。
--     - 任務：total_referrals 歸 0、刪除「當月」桶（月份 key 沿用
--       apply_referral_side_effects 的同一運算式）；其餘月份桶原樣保留
--       ——歷史桶就是 pair-history，防「換新約重刷推薦王」。
--   * 絕不在建單時清空（建單後可能棄單）；extend / 首購完全不觸發。
--   * 冪等鍵 = 本次 subscription_id（webhook 重放、自癒重放不重複沖銷）。
--   * 周邊隔離：清空失敗只留 system_alerts（source = fresh_ledger_forfeit，
--     context 含失敗當下的金額快照 forfeit_amount），絕不回滾已收錢的付款。
--   * 配套自癒 repair_orphaned_forfeitures：補沖金額 = 快照值（不是補沖
--     當下餘額——失敗後下線新繳的合法點數不能被追溯沒收）；快照遺失
--     fallback 0 + 升級 error 告警，寧可少沖交人工。呼叫點掛在
--     /auth/profile 的 repairOrphanedPaymentsBestEffort（index.ts）。
--
-- process_successful_payment 基準 = 20260802000001_payment_user_lock.sql
-- （現行權威版，含 user 層級鎖與 apply_referral_side_effects 第三參數），
-- 唯一差異 = 新增「3-0. fresh 清空帳本」周邊區塊。
-- ============================================================

-- ------------------------------------------------------------
-- 1. reward_transactions 類型加 ledger_reset
--    （現行約束版本 = 20260620000007，四個值）
-- ------------------------------------------------------------
alter table public.reward_transactions
  drop constraint if exists reward_transactions_type_check;
alter table public.reward_transactions
  add constraint reward_transactions_type_check
  check (type in ('referral_reward', 'task_monthly_king', 'withdrawal',
                  'adjustment', 'ledger_reset'));

-- ------------------------------------------------------------
-- 2. reward_transactions_with_balance 重建：source_category 加
--    ledger_reset 分支（基準 = 20260725000002）。
--    else t.type 其實也會透傳，但顯式列出才不會被誤讀為「漏接」；
--    重建照老規矩 drop + recreate（select t.* 在建立當下凍結欄位清單）。
-- ------------------------------------------------------------
drop view if exists public.reward_transactions_with_balance;

create view public.reward_transactions_with_balance
with (security_invoker = on) as
select
  t.*,
  case
    when t.type = 'referral_reward' and t.source_claim_id is not null then 'referral_renewal'
    when t.type = 'referral_reward'
      and row_number() over (
        partition by t.user_id, t.referee_user_id, t.type
        order by t.created_at, t.id
      ) = 1                                                          then 'referral_signup'
    when t.type = 'referral_reward'                                  then 'referral_renewal'
    when t.type = 'withdrawal'                                       then 'withdrawal'
    when t.type = 'adjustment' and t.withdrawal_id is not null       then 'withdrawal_refund'
    when t.type = 'adjustment'                                       then 'adjustment_manual'
    when t.type = 'ledger_reset'                                     then 'ledger_reset'
    else t.type
  end as source_category,
  sum(t.amount) over (
    partition by t.user_id
    order by t.created_at, t.id
  ) as balance_after
from public.reward_transactions t;

revoke all on public.reward_transactions_with_balance from anon, authenticated;

-- ------------------------------------------------------------
-- 3. process_successful_payment：加「3-0. fresh 清空帳本」周邊區塊
-- ------------------------------------------------------------
create or replace function public.process_successful_payment(
  p_user_id         uuid,
  p_trade_no        text,
  p_transaction_id  text,
  p_payuni_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id         uuid;
  v_order_status     text;
  v_renewal_mode     text;
  v_order_created_at timestamptz;
  v_paid_at          timestamptz;
  v_anchor_day       date;
  v_prev_end         timestamptz;
  v_start            timestamptz;
  v_end              timestamptz;
  v_grace            timestamptz;
  v_sub_id           uuid;
  v_is_renewal       boolean;
  v_side_effects     jsonb;
  v_forfeit_amount   integer;
  v_reset_month_key  text;
begin
  -- 0. 鎖住這筆訂單，序列化同一筆 p_trade_no 的並行呼叫（notify webhook
  --    與 return 導回幾乎同時到達、或 PayUni 對 notify 重試時）。
  select id, status, renewal_mode, created_at
    into v_order_id, v_order_status, v_renewal_mode, v_order_created_at
  from public.payment_orders
  where transaction_id = p_trade_no
    and user_id = p_user_id
  for update;

  if v_order_id is null then
    raise exception '找不到對應的 payment_orders（trade_no=%, user_id=%）', p_trade_no, p_user_id;
  end if;

  if v_order_status = 'completed' then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  -- 0b. user 層級鎖：序列化「同一使用者」的所有付款完成流程。上面的訂單
  --     鎖只擋同一筆 trade_no 的重複呼叫，擋不住同一人「兩筆不同訂單」
  --     併發完成——那會讓下面的 max(end_date) 被讀到同一個值、算出相同
  --     效期。鎖序：先 payment_orders（各筆不同）→ 後 profiles（同一列），
  --     與 apply_referral_side_effects 內的 profiles 鎖同列可重入。
  perform 1 from public.profiles where id = p_user_id for update;

  v_is_renewal := exists (select 1 from public.subscriptions where user_id = p_user_id);

  -- 效期錨點：付款成功時點是 SSOT。extend（續約）接續前一筆訂閱最後
  -- 一天的隔天；fresh / null（新約、首次付款）從付款日（台灣日曆日）
  -- 起算。
  v_paid_at    := public.payuni_paid_at(p_payuni_response, coalesce(v_order_created_at, now()));
  v_anchor_day := public.tw_day(v_paid_at);
  if v_renewal_mode = 'extend' then
    select max(end_date) into v_prev_end
    from public.subscriptions
    where user_id = p_user_id;
    if v_prev_end is not null then
      v_anchor_day := public.tw_day(v_prev_end) + 1;
    end if;
  end if;

  select * into v_start, v_end, v_grace
  from public.compute_subscription_period(v_anchor_day);

  -- 1. 建立訂閱
  insert into public.subscriptions (
    user_id, start_date, end_date, grace_period_end,
    amount, payment_method, payment_transaction_id, is_renewal,
    source_payment_order_id
  )
  values (
    p_user_id,
    v_start,
    v_end,
    v_grace,
    1200,
    'payuni',
    p_transaction_id,
    v_is_renewal,
    v_order_id
  )
  returning id into v_sub_id;

  -- 2. 關鍵路徑：立刻標記付款完成，不等周邊業務邏輯跑完。
  update public.payment_orders
  set status          = 'completed',
      payment_method  = 'payuni',
      payuni_response = p_payuni_response,
      completed_at    = v_paid_at
  where id = v_order_id;

  update public.profiles
  set registration_step = 3
  where id = p_user_id;

  -- 3-0. fresh 清空帳本（A13）：選新約且非首購 → 付款成功當下清空。
  --      周邊隔離：這裡失敗只留 warning + system_alerts（context 帶失敗
  --      當下的金額快照，是 repair_orphaned_forfeitures 唯一的補沖依據），
  --      絕不回滾上面已寫入的付款完成事實。
  if v_renewal_mode = 'fresh' and v_is_renewal then
    begin
      select greatest(coalesce(sum(amount), 0), 0) into v_forfeit_amount
      from public.reward_transactions
      where user_id = p_user_id;

      -- 冪等：本次 subscription_id 已有沖銷列就不再插（重放保險；正常
      -- 路徑靠訂單 completed 短路就進不來）。
      if not exists (
        select 1 from public.reward_transactions
        where user_id = p_user_id and type = 'ledger_reset' and subscription_id = v_sub_id
      ) then
        insert into public.reward_transactions
          (user_id, type, amount, subscription_id, description)
        values
          (p_user_id, 'ledger_reset', -v_forfeit_amount, v_sub_id, '新約重置：帳本清空');
      end if;

      -- 任務：total 歸 0、刪「當月」桶（key 沿用 apply_referral_side_effects
      -- 的同一運算式）；其餘月份桶原樣保留（歷史桶 = pair-history）。
      v_reset_month_key := to_char(v_paid_at at time zone 'Asia/Taipei', 'YYYY-MM');
      update public.task_progress
      set total_referrals   = 0,
          monthly_referrals = monthly_referrals - v_reset_month_key,
          updated_at        = now()
      where user_id = p_user_id;
    exception when others then
      perform public.log_system_alert('fresh_ledger_forfeit', 'warning', sqlerrm,
        jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                           'subscription_id', v_sub_id,
                           'forfeit_amount', v_forfeit_amount));
      raise warning 'process_successful_payment：fresh 清空帳本失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
    end;
  end if;

  -- 3. 周邊業務邏輯：這裡出錯只留 warning + system_alerts，不會讓上面
  --    已經寫入的付款完成事實被回滾。月份 key 錨定付款時點。
  begin
    select public.apply_referral_side_effects(p_user_id, v_sub_id, v_paid_at) into v_side_effects;
  exception when others then
    perform public.log_system_alert('process_successful_payment', 'warning', sqlerrm,
      jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id, 'subscription_id', v_sub_id));
    raise warning 'process_successful_payment：推薦碼/獎勵處理失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
  end;

  return jsonb_build_object(
    'success',          true,
    'subscription_id',  v_sub_id,
    'referral_code_id', v_side_effects ->> 'referral_code_id'
  );

exception when others then
  raise exception 'process_successful_payment 失敗: %', sqlerrm;
end;
$$;

revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4. repair_orphaned_forfeitures：掃「fresh 非首購訂閱但無對應沖銷列」
--    的孤兒，補沖 = 告警快照額。簽名與回傳形狀比照 repair_orphaned_payments。
--    僅補點數沖銷：任務殘留由原 fresh_ledger_forfeit 告警交人工——延遲
--    歸零會把失敗後合法累積的新任務一併洗掉，與點數用快照同一個道理，
--    但任務桶無法用單一數字快照安全回放。
-- ------------------------------------------------------------
create or replace function public.repair_orphaned_forfeitures(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate       record;
  v_snapshot        integer;
  v_repaired_ids    uuid[] := '{}';
  v_failed          jsonb  := '[]'::jsonb;
  v_candidate_count int    := 0;
begin
  for v_candidate in
    select s.id as subscription_id, s.user_id, po.transaction_id as trade_no
    from public.subscriptions s
    join public.payment_orders po on po.id = s.source_payment_order_id
    where po.renewal_mode = 'fresh'
      and (p_user_id is null or s.user_id = p_user_id)
      -- 非首購：同一人有更早建立的訂閱（首購 fresh 本來就無沖銷列）
      and exists (
        select 1 from public.subscriptions s2
        where s2.user_id = s.user_id and s2.id <> s.id and s2.created_at < s.created_at
      )
      and not exists (
        select 1 from public.reward_transactions rt
        where rt.user_id = s.user_id and rt.type = 'ledger_reset'
          and rt.subscription_id = s.id
      )
  loop
    v_candidate_count := v_candidate_count + 1;
    begin
      -- 與付款完成流程同一把 user 鎖，鎖內重查冪等條件——兩個並行的
      -- repair（或 repair 撞上付款）不會對同一筆訂閱各插一列。
      perform 1 from public.profiles where id = v_candidate.user_id for update;
      if exists (
        select 1 from public.reward_transactions rt
        where rt.user_id = v_candidate.user_id and rt.type = 'ledger_reset'
          and rt.subscription_id = v_candidate.subscription_id
      ) then
        continue;
      end if;

      -- 補沖依據 = 失敗當下的金額快照（fresh_ledger_forfeit 告警 payload）。
      -- 絕不用補沖當下的餘額——失敗後下線新繳的合法點數不能被追溯沒收。
      select (sa.context ->> 'forfeit_amount')::integer into v_snapshot
      from public.system_alerts sa
      where sa.source = 'fresh_ledger_forfeit'
        and sa.context ->> 'subscription_id' = v_candidate.subscription_id::text
        and sa.context ? 'forfeit_amount'
        and (sa.context ->> 'forfeit_amount') is not null
      order by sa.created_at desc
      limit 1;

      if v_snapshot is null then
        -- 快照遺失：寧可少沖交人工——沖 0（留冪等標記列）+ 升級 error 告警。
        perform public.log_system_alert('repair_orphaned_forfeitures', 'error',
          '找不到 fresh_ledger_forfeit 金額快照，補沖 0，需人工核對',
          jsonb_build_object('user_id', v_candidate.user_id,
                             'subscription_id', v_candidate.subscription_id,
                             'trade_no', v_candidate.trade_no));
        v_snapshot := 0;
      end if;

      insert into public.reward_transactions
        (user_id, type, amount, subscription_id, description)
      values
        (v_candidate.user_id, 'ledger_reset', -greatest(v_snapshot, 0),
         v_candidate.subscription_id, '新約重置：帳本清空（延遲補沖）');

      v_repaired_ids := array_append(v_repaired_ids, v_candidate.user_id);
    exception when others then
      v_failed := v_failed || jsonb_build_object('user_id', v_candidate.user_id, 'error', sqlerrm);
      perform public.log_system_alert('repair_orphaned_forfeitures', 'error', sqlerrm,
        jsonb_build_object('user_id', v_candidate.user_id,
                           'subscription_id', v_candidate.subscription_id));
      raise warning 'repair_orphaned_forfeitures：補沖 user_id=% 失敗: %', v_candidate.user_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'candidates_found',  v_candidate_count,
    'repaired_count',    coalesce(array_length(v_repaired_ids, 1), 0),
    'repaired_user_ids', to_jsonb(v_repaired_ids),
    'failed',            v_failed
  );
end;
$$;

revoke execute on function public.repair_orphaned_forfeitures(uuid) from anon, authenticated, public;
