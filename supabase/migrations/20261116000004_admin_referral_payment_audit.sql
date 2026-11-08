-- ============================================================
-- 後台推薦樹查帳（第 6 波 S3a 階段 4）：付款與三代獎金
--
-- 事件＝付款人的「已完成付款單」（經 subscriptions.source_payment_order_id 取
-- subscription_id 當冪等鍵，付款時點＝payment_orders.completed_at）與「已領取的
-- 推薦王 credit」（冪等鍵＝source_claim_id，時點＝claimed_at）。與
-- repair_orphaned_payments／repair_orphaned_claim_rewards 用的時點相同。
--
-- 每一代的結果（規劃 §2.1，判定順序：先過可判定閘門）：
--   undeterminable  找不到對應訂閱（no_subscription），或付款人、第 1 代、第 2 代
--                   任一人的 referred_by_changed_at 晚於付款時點（changed_after）
--                   ——比自癒更保守；有實發列照樣列出
--   cycle_stopped   referral_award_chain 的 stop_reason='cycle'
--   not_applicable  stop_reason='no_referrer'
--   missing         該代有收獎者，但找不到 (referee, generation, 冪等鍵) 的
--                   referral_reward 列（異常）
--   recipient_mismatch  列存在但 user_id 不是 chain 的收獎者（異常）
--   paid            列存在且 user_id 相符
-- 「該拿」一律來自 referral_award_chain（與 pay_referral_generations 同口徑）。
-- 金額只回實拿，不比對應得（reward_config 會隨時間調整，歷史應得值無法重建）。
--
-- 節點的付款異常只掃最近 50 筆事件（anomaly_scan_truncated 標出超過的人）；
-- 會員詳情的 payment_summary 掃全部。全部只授權 service_role。
-- ============================================================

create or replace function public.admin_referral_payment_events(p_user uuid)
returns table (kind text, event_id uuid, at timestamptz, subscription_id uuid, claim_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select 'payment', po.id, po.completed_at, s.id, null::uuid
  from public.payment_orders po
  left join lateral (
    select s.id from public.subscriptions s
    where s.source_payment_order_id = po.id
    order by s.created_at, s.id
    limit 1
  ) s on true
  where po.user_id = p_user and po.status = 'completed'
  union all
  select 'claim', k.id, k.claimed_at, null::uuid, k.id
  from public.referral_king_rewards k
  where k.user_id = p_user and k.status = 'claimed';
$$;

-- 評估單一事件的三代結果。p_recipients／p_reasons 是 referral_award_chain 的結果
-- （呼叫端每個付款人只算一次）。
create or replace function public.admin_referral_evaluate_event(
  p_user       uuid,
  p_kind       text,
  p_at         timestamptz,
  p_sub        uuid,
  p_claim      uuid,
  p_recipients uuid[],
  p_reasons    text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gate_ok  boolean;
  v_reason   text;
  v_out      jsonb := '[]'::jsonb;
  v_actual   record;
  v_result   text;
  v_expected uuid;
begin
  if p_kind = 'payment' and p_sub is null then
    v_gate_ok := false;
    v_reason := 'no_subscription';
  else
    v_gate_ok := p_at is not null and not exists (
      select 1 from public.profiles pr
      where pr.id = any(array_remove(array[p_user, p_recipients[1], p_recipients[2]], null))
        and pr.referred_by_changed_at > p_at);
    v_reason := case when v_gate_ok then null else 'changed_after' end;
  end if;

  for g in 1..3 loop
    v_expected := p_recipients[g];
    select rt.user_id, rt.amount, pr.name as name into v_actual
    from public.reward_transactions rt
    left join public.profiles pr on pr.id = rt.user_id
    where rt.type = 'referral_reward'
      and rt.referee_user_id = p_user
      and rt.generation = g
      and ((p_kind = 'payment' and p_sub is not null and rt.subscription_id = p_sub)
        or (p_kind = 'claim' and rt.source_claim_id = p_claim))
    order by rt.created_at, rt.id
    limit 1;

    v_result := case
      when not v_gate_ok then 'undeterminable'
      when p_reasons[g] = 'cycle' then 'cycle_stopped'
      when p_reasons[g] = 'no_referrer' then 'not_applicable'
      when v_actual.user_id is null then 'missing'
      when v_actual.user_id <> v_expected then 'recipient_mismatch'
      else 'paid'
    end;

    v_out := v_out || jsonb_build_object(
      'generation', g,
      'result', v_result,
      'reason', case when v_result = 'undeterminable' then v_reason end,
      'expected_id', v_expected,
      'expected_name', (select name from public.profiles where id = v_expected),
      'actual_id', v_actual.user_id,
      'actual_name', v_actual.name,
      'actual_amount', v_actual.amount);
  end loop;
  return v_out;
end;
$$;

-- 依時間新到舊評估付款人的事件；p_limit 為 null 時評估全部。
create or replace function public.admin_referral_payment_items(
  p_user   uuid,
  p_limit  int,
  p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_recipients uuid[];
  v_reasons    text[];
begin
  select array_agg(c.recipient_id order by c.generation),
         array_agg(c.stop_reason order by c.generation)
    into v_recipients, v_reasons
  from public.referral_award_chain(p_user) c;

  return coalesce(
    (select jsonb_agg(jsonb_build_object(
              'kind', e.kind,
              'event_id', e.event_id,
              'at', e.at,
              'subscription_id', e.subscription_id,
              'claim_id', e.claim_id,
              'generations', public.admin_referral_evaluate_event(
                p_user, e.kind, e.at, e.subscription_id, e.claim_id, v_recipients, v_reasons))
            order by e.at desc nulls last, e.event_id desc)
     from (select * from public.admin_referral_payment_events(p_user) ev
           order by ev.at desc nulls last, ev.event_id desc
           limit p_limit offset greatest(coalesce(p_offset, 0), 0)) e),
    '[]'::jsonb);
end;
$$;

create or replace function public.admin_referral_payment_audit(
  p_user   uuid,
  p_limit  int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.admin_referral_payment_events(p_user)),
    'items', public.admin_referral_payment_items(
      p_user, least(greatest(coalesce(p_limit, 50), 1), 200), p_offset));
end;
$$;

-- 付款異常摘要：p_scan 為 null 時掃全部。
create or replace function public.admin_referral_payment_anomalies(p_user uuid, p_scan int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select public.admin_referral_payment_items(p_user, p_scan, 0) as j
  ),
  gens as (
    select g ->> 'result' as result
    from items, jsonb_array_elements(items.j) as i, jsonb_array_elements(i -> 'generations') as g
  )
  select jsonb_build_object(
    'missing_count', (select count(*) from gens where result = 'missing'),
    'mismatch_count', (select count(*) from gens where result = 'recipient_mismatch'),
    'truncated', p_scan is not null
      and (select count(*) from public.admin_referral_payment_events(p_user)) > p_scan);
$$;

create or replace function public.admin_referral_tree_node(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_up    record;
  v_layer int;
  v_pay   jsonb;
  v_kinds text[];
begin
  select * into v_up from public.admin_referral_upline(p_user);
  v_layer := case when v_up.status = 'root' then coalesce(cardinality(v_up.ids), 0) + 1 end;
  v_pay := public.admin_referral_payment_anomalies(p_user, 50);
  v_kinds := public.admin_referral_structure_anomalies(p_user)
    || case when (v_pay ->> 'missing_count')::int > 0 then array['missing_reward'] else '{}' end
    || case when (v_pay ->> 'mismatch_count')::int > 0 then array['recipient_mismatch'] else '{}' end;

  return (
    select jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'referral_code', (select rc.code from public.referral_codes rc
                         where rc.user_id = p.id and rc.status = 'active'),
      'layer', v_layer,
      'direct_count', (select count(*) from public.referral_edges e
                        where e.referrer_user_id = p.id),
      'account_status', a.status,
      'end_date', a.end_date,
      'suspended_at', p.suspended_at,
      'referral_program_joined', p.referral_program_joined,
      'referral_program_joined_at', p.referral_program_joined_at,
      'anomaly_kinds', to_jsonb(v_kinds),
      'anomaly_scan_truncated', (v_pay ->> 'truncated')::boolean
    )
    from public.profiles p
    left join public.user_account_status a on a.user_id = p.id
    where p.id = p_user
  );
end;
$$;

-- 會員詳情：階段 3 的函式改名為 _base，外層加 payment_summary 與付款異常（掃全部事件）。
alter function public.admin_referral_member_audit(uuid) rename to admin_referral_member_audit_base;

create or replace function public.admin_referral_member_audit(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_pay  jsonb;
  v_kinds jsonb;
begin
  v_base := public.admin_referral_member_audit_base(p_user);
  if v_base is null then
    return null;
  end if;
  v_pay := public.admin_referral_payment_anomalies(p_user, null);
  v_kinds := (v_base -> 'anomalies')
    || case when (v_pay ->> 'missing_count')::int > 0 then '["missing_reward"]'::jsonb else '[]'::jsonb end
    || case when (v_pay ->> 'mismatch_count')::int > 0 then '["recipient_mismatch"]'::jsonb else '[]'::jsonb end;
  return v_base || jsonb_build_object(
    'payment_summary', jsonb_build_object(
      'missing_count', (v_pay ->> 'missing_count')::int,
      'mismatch_count', (v_pay ->> 'mismatch_count')::int),
    'anomalies', v_kinds);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_referral_payment_events(uuid)',
    'public.admin_referral_evaluate_event(uuid, text, timestamptz, uuid, uuid, uuid[], text[])',
    'public.admin_referral_payment_items(uuid, int, int)',
    'public.admin_referral_payment_audit(uuid, int, int)',
    'public.admin_referral_payment_anomalies(uuid, int)',
    'public.admin_referral_tree_node(uuid)',
    'public.admin_referral_member_audit_base(uuid)',
    'public.admin_referral_member_audit(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- 付款單要經這一欄取 subscription_id（每頁最多 200 × 50 筆查找），現況沒有索引。
create index if not exists idx_subscriptions_source_payment_order
  on public.subscriptions (source_payment_order_id);
