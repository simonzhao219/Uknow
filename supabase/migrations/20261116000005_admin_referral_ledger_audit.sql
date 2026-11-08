-- ============================================================
-- 後台推薦樹查帳（第 6 波 S3b 階段 10）：點數來源明細與跨表核對（規劃 §2.3，W6-18）
--
-- admin_referral_ledger_findings(p_user)：四條跨表核對，回每一筆違反（info=false）
-- 與資訊列（info=true）。金額與 type 對照現行寫入函式：
--   withdrawal_debit   每張提領單（所有狀態，含 rejected），帳本恰有一列
--                      type='withdrawal'、withdrawal_id=該單、user_id=本人，金額
--                      −(amount＋fee)（request_withdrawal）。扣款列沒有唯一索引，
--                      「恰有一列」可能被違反
--   refund_missing     rejected 的單，帳本恰有一列 type='adjustment'＋withdrawal_id，
--                      金額 +(amount＋fee)（admin_update_withdrawal_status）
--   refund_unexpected  反向：非 rejected 的單不得有退款列
--   orphan_debit       type='withdrawal' 但 withdrawal_id 為 null（提領被刪後 FK
--                      on delete set null 留下的），或指向別人的提領。「指向不存在
--                      的提領」在結構上不會發生，不另查
--   reset_amount       正常路徑的 ledger_reset，金額 = −greatest(該列之前的餘額, 0)。
--                      「之前」只取 created_at 嚴格早於本列的列：同一交易的列時間戳
--                      相同，一律當作尚未發生，免得 uuid 決定先後而偶發誤報
--   reset_delayed      （info）description 含「延遲補沖」的 ledger_reset：
--                      repair_orphaned_forfeitures 依告警快照寫入，不比金額
-- 已知競態（寫在詳情的說明裡）：別筆交易先開始、但在清空的 sum 之後才提交，清空
-- 金額就可能差一筆，會被標 reset_amount。
--
-- 舊資料：§2.3 的「加 fee 之前的提領單」——主 session 代查正式站 0 筆（2026-11-08），
-- 依規劃刪掉該條，不另判別。
--
-- admin_referral_ledger_audit(p_user, limit, offset)：帳本明細（新到舊）＋ findings。
-- 異常 ledger_mismatch（點數跨表核對不符）加進節點與會員詳情：本檔重新定義
-- admin_referral_tree_node 與 admin_referral_member_audit，基準是 20261116000004
-- （唯一差異＝多一個 ledger_mismatch）。全部只授權 service_role。
-- ============================================================

create or replace function public.admin_referral_ledger_findings(p_user uuid)
returns table (kind text, transaction_id uuid, withdrawal_id uuid, info boolean)
language sql
stable
security definer
set search_path = public
as $$
  -- 1. 每張提領單恰有一列正確金額的扣款
  select 'withdrawal_debit', null::uuid, w.id, false
  from public.withdrawals w
  where w.user_id = p_user
    and (select count(*) filter (where rt.amount = -(w.amount + w.fee)) = 1 and count(*) = 1
         from public.reward_transactions rt
         where rt.user_id = p_user and rt.type = 'withdrawal' and rt.withdrawal_id = w.id)
        is not true
  union all
  -- 2. 退件恰有一列正確金額的退款
  select 'refund_missing', null::uuid, w.id, false
  from public.withdrawals w
  where w.user_id = p_user and w.status = 'rejected'
    and (select count(*) filter (where rt.amount = w.amount + w.fee) = 1 and count(*) = 1
         from public.reward_transactions rt
         where rt.user_id = p_user and rt.type = 'adjustment' and rt.withdrawal_id = w.id)
        is not true
  union all
  -- 2'. 反向：非退件不得有退款列
  select 'refund_unexpected', rt.id, w.id, false
  from public.withdrawals w
  join public.reward_transactions rt
    on rt.withdrawal_id = w.id and rt.type = 'adjustment' and rt.user_id = p_user
  where w.user_id = p_user and w.status <> 'rejected'
  union all
  -- 3. 孤兒扣款
  select 'orphan_debit', rt.id, rt.withdrawal_id, false
  from public.reward_transactions rt
  left join public.withdrawals w on w.id = rt.withdrawal_id
  where rt.user_id = p_user and rt.type = 'withdrawal'
    and (rt.withdrawal_id is null or w.user_id <> p_user)
  union all
  -- 4. 新約清空：延遲補沖只標資訊，其餘比金額
  select case when coalesce(r.description, '') like '%延遲補沖%' then 'reset_delayed'
              else 'reset_amount' end,
         r.id, null::uuid,
         coalesce(r.description, '') like '%延遲補沖%'
  from public.reward_transactions r
  where r.user_id = p_user and r.type = 'ledger_reset'
    and (coalesce(r.description, '') like '%延遲補沖%'
      or r.amount <> -greatest(coalesce(
           (select sum(p.amount) from public.reward_transactions p
            where p.user_id = p_user and p.created_at < r.created_at), 0), 0));
$$;

create or replace function public.admin_referral_ledger_mismatch(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_referral_ledger_findings(p_user) f where not f.info);
$$;

create or replace function public.admin_referral_ledger_audit(
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
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_findings jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', f.kind, 'transaction_id', f.transaction_id,
           'withdrawal_id', f.withdrawal_id, 'info', f.info)
         order by f.info, f.kind, f.withdrawal_id, f.transaction_id), '[]'::jsonb)
    into v_findings
  from public.admin_referral_ledger_findings(p_user) f;

  return jsonb_build_object(
    'total', (select count(*) from public.reward_transactions where user_id = p_user),
    'findings', v_findings,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'at', t.created_at,
               'type', t.type,
               'source_category', t.source_category,
               'amount', t.amount,
               'balance_after', t.balance_after,
               'description', t.description,
               'generation', t.generation,
               'referee_id', t.referee_user_id,
               'referee_name', rp.name,
               'event_at', coalesce(po.completed_at, k.claimed_at),
               'withdrawal_id', t.withdrawal_id,
               'withdrawal_status', w.status,
               'subscription_id', t.subscription_id,
               'finding', (select f ->> 'kind' from jsonb_array_elements(v_findings) f
                           where (f ->> 'transaction_id')::uuid = t.id
                              or (t.type = 'withdrawal' and (f ->> 'kind') = 'withdrawal_debit'
                                  and (f ->> 'withdrawal_id')::uuid = t.withdrawal_id)
                           limit 1))
             order by t.created_at desc, t.id desc)
      from (select * from public.reward_transactions_with_balance v
            where v.user_id = p_user
            order by v.created_at desc, v.id desc
            limit v_limit offset v_offset) t
      left join public.profiles rp on rp.id = t.referee_user_id
      left join public.subscriptions s on s.id = t.subscription_id and t.type = 'referral_reward'
      left join public.payment_orders po on po.id = s.source_payment_order_id
      left join public.referral_king_rewards k on k.id = t.source_claim_id
      left join public.withdrawals w on w.id = t.withdrawal_id
    ), '[]'::jsonb));
end;
$$;

-- 節點：基準 20261116000004，唯一差異＝多一個 ledger_mismatch。
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
    || case when (v_pay ->> 'mismatch_count')::int > 0 then array['recipient_mismatch'] else '{}' end
    || case when public.admin_referral_ledger_mismatch(p_user) then array['ledger_mismatch'] else '{}' end;

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

-- 會員詳情：基準 20261116000004 的包裝，唯一差異＝多一個 ledger_mismatch。
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
    || case when (v_pay ->> 'mismatch_count')::int > 0 then '["recipient_mismatch"]'::jsonb else '[]'::jsonb end
    || case when public.admin_referral_ledger_mismatch(p_user) then '["ledger_mismatch"]'::jsonb else '[]'::jsonb end;
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
    'public.admin_referral_ledger_findings(uuid)',
    'public.admin_referral_ledger_mismatch(uuid)',
    'public.admin_referral_ledger_audit(uuid, int, int)',
    'public.admin_referral_tree_node(uuid)',
    'public.admin_referral_member_audit(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
