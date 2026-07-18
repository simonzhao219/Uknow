-- ============================================================
-- Uknow 後端重構 — 0002 (0718) 既有資料回填：付款日 SSOT + 台灣日界
-- ============================================================
--
-- 依 0718 0001 的新規則重算既有資料（使用者拍板：嚴格重算，延遲開通
-- 的意外多得天數一律修正為付款日起算）：
--
--   1. payment_orders.completed_at ← payuni_paid_at(payuni_response,
--      created_at)。過去 completed_at 記的是「開通執行時點」；對
--      webhook 失敗、事後自癒的訂單會晚付款好幾天。
--   2. subscriptions 逐用戶、依時間順序重算 start/end/grace：
--        * extend 訂單 → 錨定前一期最後一天的隔天（修正鏈往後帶）
--        * 有來源訂單 → 錨定付款日（台灣日曆日）
--        * 孤兒列（找不到訂單）→ 以原 start_date 的台灣日就地正規化
--          （同時套用 −1 天的效期修正）
--      再依已領取的推薦王 credit（resulting_subscription_id 對應、
--      status='claimed'）逐次 +1 年（非 ×n，閏年語意跟逐次領取一致）。
--   3. 效期因此縮短的列（= 延遲開通的意外多得，正是本次要修正的對象）
--      逐筆記進 system_alerts 供事後稽核。
--
-- 冪等：所有輸出都是不可變輸入（payuni_response、訂單 created_at、
-- renewal_mode、claim 數、孤兒列自身 start_date 的台灣日——第一次
-- 正規化後即為不動點）的純函數；重跑第二次是 no-op。
-- ============================================================

create or replace function public.backfill_time_domain()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders_updated int := 0;
  v_subs_updated   int := 0;
  v_shrunk_count   int := 0;
  v_shrunk_details jsonb := '[]'::jsonb;
  r_user           record;
  r_sub            record;
  v_prev_last_day  date;
  v_anchor         date;
  v_new_start      timestamptz;
  v_new_end        timestamptz;
  v_new_grace      timestamptz;
  v_last_day       date;
  v_claims         int;
  i                int;
begin
  -- 1. 已完成訂單的 completed_at 回歸付款時點
  update public.payment_orders
  set completed_at = public.payuni_paid_at(payuni_response, created_at)
  where status = 'completed'
    and completed_at is distinct from public.payuni_paid_at(payuni_response, created_at);
  get diagnostics v_orders_updated = row_count;

  -- 2. 逐用戶、依時間順序重算訂閱效期（extend 鏈需要前一期的修正結果）
  for r_user in (
    select distinct user_id from public.subscriptions
  ) loop
    v_prev_last_day := null;

    for r_sub in (
      select
        s.id, s.user_id, s.start_date, s.end_date, s.grace_period_end,
        po.id         as order_id,
        po.created_at as order_created_at,
        po.payuni_response,
        po.renewal_mode
      from public.subscriptions s
      left join public.payment_orders po
        on po.id = s.source_payment_order_id
        or (
          s.source_payment_order_id is null
          and po.user_id = s.user_id
          and po.status = 'completed'
          and (
            po.transaction_id = s.payment_transaction_id
            or po.payuni_response ->> 'TradeNo' = s.payment_transaction_id
          )
        )
      where s.user_id = r_user.user_id
      order by s.start_date asc, s.end_date asc
    ) loop
      -- 錨點
      if r_sub.order_id is not null and r_sub.renewal_mode = 'extend' and v_prev_last_day is not null then
        v_anchor := v_prev_last_day + 1;
      elsif r_sub.order_id is not null then
        v_anchor := public.tw_day(
          public.payuni_paid_at(r_sub.payuni_response, r_sub.order_created_at)
        );
      else
        -- 孤兒列：找不到來源訂單，以原 start_date 的台灣日就地正規化
        v_anchor := public.tw_day(r_sub.start_date);
      end if;

      select * into v_new_start, v_new_end, v_new_grace
      from public.compute_subscription_period(v_anchor);
      v_last_day := public.tw_day(v_new_end);

      -- 已領取的推薦王 credit：逐次 +1 年（與 claim 當下的語意一致）
      select count(*) into v_claims
      from public.referral_king_rewards
      where resulting_subscription_id = r_sub.id
        and status = 'claimed';

      for i in 1 .. coalesce(v_claims, 0) loop
        v_last_day := (v_last_day + interval '1 year')::date;
      end loop;
      if coalesce(v_claims, 0) > 0 then
        v_new_end   := public.tw_end_of_day(v_last_day);
        v_new_grace := public.tw_end_of_day(v_last_day + 60);
      end if;

      if r_sub.start_date is distinct from v_new_start
         or r_sub.end_date is distinct from v_new_end
         or r_sub.grace_period_end is distinct from v_new_grace then

        if v_new_end < r_sub.end_date then
          v_shrunk_count   := v_shrunk_count + 1;
          v_shrunk_details := v_shrunk_details || jsonb_build_object(
            'subscription_id', r_sub.id,
            'user_id',         r_sub.user_id,
            'old_end',         r_sub.end_date,
            'new_end',         v_new_end
          );
        end if;

        update public.subscriptions
        set start_date       = v_new_start,
            end_date         = v_new_end,
            grace_period_end = v_new_grace
        where id = r_sub.id;
        v_subs_updated := v_subs_updated + 1;
      end if;

      v_prev_last_day := v_last_day;
    end loop;
  end loop;

  -- 3. 稽核紀錄（縮短效期的列＝被修正的延遲開通意外多得）
  perform public.log_system_alert(
    'time_domain_backfill',
    'info',
    format('backfill 完成：orders=%s, subscriptions=%s, 效期縮短=%s',
           v_orders_updated, v_subs_updated, v_shrunk_count),
    jsonb_build_object(
      'orders_updated', v_orders_updated,
      'subs_updated',   v_subs_updated,
      'shrunk_count',   v_shrunk_count,
      'shrunk_details', v_shrunk_details
    )
  );

  return jsonb_build_object(
    'success',        true,
    'orders_updated', v_orders_updated,
    'subs_updated',   v_subs_updated,
    'shrunk_count',   v_shrunk_count
  );
end;
$$;

revoke execute on function public.backfill_time_domain() from anon, authenticated, public;

-- 立即執行一次（函數保留下來，staging/production 需要時可重跑驗證冪等）
select public.backfill_time_domain();
