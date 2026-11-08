-- ============================================================
-- 後台推薦樹查帳（第 6 波 S3a 階段 3）：會員查帳詳情
--
-- admin_referral_member_audit(p_user)：節點欄位、往上推薦人鏈、獎金與點數、
-- 推薦王進度、提領金額、換線紀錄、推薦人資料兩處不一致、異常。
-- 查無此人回 null（Edge 轉 404）。
--
-- 換線紀錄（W6-16 (a')，規劃 §2.2）：
--   * past_referrers：referral_pair_history 中 referee=本人 的 referrer，聯集目前 edge
--     的 referrer，無順序（pair-history 在「任務 +1」時寫入、回填列 created_at
--     都相同，不能當接線時點）
--   * fresh_events：completed 的新約單，fresh_referrer_source in ('code','default')
--     且有 fresh_referrer_user_id（keep 不算換線），新到舊；只有最新一筆在
--     「referred_by_changed_at = completed_at 且目前推薦人＝該單推薦人」時標
--     confirmed，其餘 unknown（現有資料無法確認）
-- 推薦人資料兩處不一致（資訊提示，不是異常）：曾訂閱，且
--   profiles.referred_by_user_id IS DISTINCT FROM 本人 edge 的 referrer。
-- 異常（本階段）：cycle（往上 50 步內重複）、self_referral（profiles 指向自己）。
-- 不回身分證、電話、生日、銀行帳號、email。只授權 service_role。
--
-- ⚠️ 本檔定義的 admin_referral_member_audit 在 20261116000004 被改名為
-- admin_referral_member_audit_base，並由同名包裝函式加上 payment_summary 與付款異常。
-- 之後要改 admin_referral_member_audit，基準是 0004 的包裝（與 _base），不是本檔。
-- ============================================================

-- 修正階段 2：搜尋必須與樹收同一群人（規劃 §2.2）。樹上的子節點來自 referral_edges，
-- 不論本人有無訂閱都會出現在樹上；20261116000002 的 in_scope 漏了「有 edge 指向自己」，
-- 只是推薦對象、自己沒訂閱的子節點因此搜不到（CI 5c09b834：階段 2 搜尋兩支測試紅）。
-- 頂層仍要求沒有 edge 指向自己，所以頂層的收人範圍不變。
create or replace function public.admin_referral_in_scope(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.subscriptions s where s.user_id = p_user)
      or exists (select 1 from public.referral_edges e where e.referrer_user_id = p_user)
      or exists (select 1 from public.referral_edges e where e.referee_user_id = p_user);
$$;

-- 節點的異常種類（本階段：成環、自己推薦自己；付款相關在階段 4 加）。
create or replace function public.admin_referral_structure_anomalies(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when (public.admin_referral_upline(p_user)).status = 'cycle' then 'cycle' end,
    case when exists (select 1 from public.profiles p
                      where p.id = p_user and p.referred_by_user_id = p.id)
         then 'self_referral' end
  ], null);
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
begin
  select * into v_up from public.admin_referral_upline(p_user);
  v_layer := case when v_up.status = 'root' then coalesce(cardinality(v_up.ids), 0) + 1 end;

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
      'anomaly_kinds', to_jsonb(public.admin_referral_structure_anomalies(p.id)),
      'anomaly_scan_truncated', false
    )
    from public.profiles p
    left join public.user_account_status a on a.user_id = p.id
    where p.id = p_user
  );
end;
$$;

create or replace function public.admin_referral_member_audit(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_up         record;
  v_month      text := to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM');
  v_edge_ref   uuid;
  v_prof_ref   uuid;
  v_changed_at timestamptz;
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;

  select * into v_up from public.admin_referral_upline(p_user);
  select e.referrer_user_id into v_edge_ref
  from public.referral_edges e where e.referee_user_id = p_user;
  select p.referred_by_user_id, p.referred_by_changed_at into v_prof_ref, v_changed_at
  from public.profiles p where p.id = p_user;

  return jsonb_build_object(
    'node', public.admin_referral_tree_node(p_user),
    'upline', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', u.x,
                'name', pr.name,
                'referral_code', (select rc.code from public.referral_codes rc
                                   where rc.user_id = u.x and rc.status = 'active'))
              order by u.o)
       from unnest(v_up.ids) with ordinality as u(x, o)
       join public.profiles pr on pr.id = u.x),
      '[]'::jsonb),
    'upline_status', v_up.status,
    'rewards', jsonb_build_object(
      'by_generation', jsonb_build_object(
        '1', (select coalesce(sum(amount), 0) from public.reward_transactions
              where user_id = p_user and type = 'referral_reward' and generation = 1),
        '2', (select coalesce(sum(amount), 0) from public.reward_transactions
              where user_id = p_user and type = 'referral_reward' and generation = 2),
        '3', (select coalesce(sum(amount), 0) from public.reward_transactions
              where user_id = p_user and type = 'referral_reward' and generation = 3)),
      'available', coalesce((select b.available from public.reward_balances b
                             where b.user_id = p_user), 0),
      'total_earned', coalesce((select b.total_earned from public.reward_balances b
                                where b.user_id = p_user), 0)),
    'tasks', jsonb_build_object(
      'month_key', v_month,
      'monthly_count', coalesce(
        (select jsonb_array_length(tp.monthly_referrals -> v_month)
         from public.task_progress tp where tp.user_id = p_user), 0),
      'threshold', (select rc.referral_king_monthly_threshold from public.reward_config rc limit 1),
      'credits_unclaimed', (select count(*) from public.referral_king_rewards k
                            where k.user_id = p_user and k.status = 'unclaimed'),
      'credits_claimed', (select count(*) from public.referral_king_rewards k
                          where k.user_id = p_user and k.status = 'claimed')),
    'withdrawals', jsonb_build_object(
      'pending_amount', (select coalesce(sum(amount), 0) from public.withdrawals
                         where user_id = p_user and status = 'pending'),
      'awaiting_collection_amount', (select coalesce(sum(amount), 0) from public.withdrawals
                                     where user_id = p_user and status = 'awaiting_collection'),
      'completed_amount', (select coalesce(sum(amount), 0) from public.withdrawals
                           where user_id = p_user and status = 'completed')),
    'referrer_history', jsonb_build_object(
      'past_referrers', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', r.id,
                  'name', pr.name,
                  'referral_code', (select rc.code from public.referral_codes rc
                                     where rc.user_id = r.id and rc.status = 'active'))
                order by pr.name, r.id)
         from (select h.referrer_user_id as id from public.referral_pair_history h
               where h.referee_user_id = p_user
               union
               select v_edge_ref where v_edge_ref is not null) r
         join public.profiles pr on pr.id = r.id),
        '[]'::jsonb),
      'fresh_events', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'completed_at', f.completed_at,
                  'new_referrer_id', f.fresh_referrer_user_id,
                  'new_referrer_name', pr.name,
                  'effective', case
                    when f.rn = 1 and v_changed_at = f.completed_at
                         and v_prof_ref = f.fresh_referrer_user_id then 'confirmed'
                    else 'unknown' end)
                order by f.completed_at desc, f.id desc)
         from (select po.*, row_number() over (order by po.completed_at desc, po.id desc) as rn
               from public.payment_orders po
               where po.user_id = p_user
                 and po.status = 'completed'
                 and po.renewal_mode = 'fresh'
                 and po.fresh_referrer_source in ('code', 'default')
                 and po.fresh_referrer_user_id is not null) f
         left join public.profiles pr on pr.id = f.fresh_referrer_user_id),
        '[]'::jsonb)),
    'referrer_mismatch',
      exists (select 1 from public.subscriptions s where s.user_id = p_user)
      and v_prof_ref is distinct from v_edge_ref,
    'anomalies', to_jsonb(public.admin_referral_structure_anomalies(p_user))
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_referral_in_scope(uuid)',
    'public.admin_referral_structure_anomalies(uuid)',
    'public.admin_referral_tree_node(uuid)',
    'public.admin_referral_member_audit(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
