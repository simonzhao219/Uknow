-- ============================================================
-- 後台推薦樹查帳（第 6 波 S3a 階段 2）：樹節點與搜尋 RPC
--
-- 樹的單一來源是 referral_edges（單親：PK＝referee）。
-- 收人口徑（W6-19）：曾有過訂閱，或至少有一條 edge 指向他（有推薦對象）。
--   * 頂層＝收人範圍內、沒有 edge 指向自己的人（profiles.created_at, id 排序）
--   * 子層＝referral_edges.referrer = 父（referred_at, referee_user_id 排序）
--   * 「無法接上推薦樹的會員」群組（W6-21）＝收人範圍內、有 edge 指向自己、
--     往上 50 步內重複遇到節點（在環上或往上接進環）；超過 50 層不收
-- 每支 RPC 回單一 jsonb：分頁與 total 都在 SQL 內算，不受 PostgREST
-- max_rows=1000 截斷（第 4 波 ref P1-3）。limit 預設 50、上限 200。
-- 節點只帶查帳需要的欄位，不碰身分證、電話、生日、銀行帳號、email。
-- 會籍四態由 Edge 的 deriveNodeStatus 推導（這裡只回原始欄位）。
-- 全部只授權 service_role。
-- ============================================================

-- 往上走推薦鏈：ids＝父、祖父……（由近到遠），status＝root／cycle／truncated。
create or replace function public.admin_referral_upline(
  p_user uuid,
  out ids uuid[],
  out status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur  uuid := p_user;
  v_next uuid;
begin
  ids := '{}';
  for i in 1..51 loop
    v_next := null;
    select e.referrer_user_id into v_next
    from public.referral_edges e where e.referee_user_id = v_cur;
    if v_next is null then
      status := 'root';
      return;
    end if;
    if v_next = p_user or v_next = any(ids) then
      status := 'cycle';
      return;
    end if;
    if i > 50 then
      -- 已走滿 50 位推薦人，還有第 51 位 → 太長，不再往上。
      status := 'truncated';
      return;
    end if;
    ids := ids || v_next;
    v_cur := v_next;
  end loop;
end;
$$;

create or replace function public.admin_referral_in_scope(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.subscriptions s where s.user_id = p_user)
      or exists (select 1 from public.referral_edges e where e.referrer_user_id = p_user);
$$;

-- 單一節點的摘要。anomaly_kinds 由階段 3／4 補上。
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
      'anomaly_kinds', '[]'::jsonb,
      'anomaly_scan_truncated', false
    )
    from public.profiles p
    left join public.user_account_status a on a.user_id = p.id
    where p.id = p_user
  );
end;
$$;

create or replace function public.admin_referral_unplaceable_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.id order by p.created_at, p.id), '{}')
  from public.profiles p
  where public.admin_referral_in_scope(p.id)
    and exists (select 1 from public.referral_edges e where e.referee_user_id = p.id)
    and (public.admin_referral_upline(p.id)).status = 'cycle';
$$;

create or replace function public.admin_referral_page(
  p_ids    uuid[],
  p_ensure uuid,
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
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_page   uuid[];
begin
  v_page := coalesce(p_ids[v_offset + 1 : v_offset + v_limit], '{}');
  return jsonb_build_object(
    'total', coalesce(cardinality(p_ids), 0),
    'nodes', coalesce(
      (select jsonb_agg(public.admin_referral_tree_node(x) order by o)
       from unnest(v_page) with ordinality as t(x, o)),
      '[]'::jsonb),
    'pinned', case
      when p_ensure is not null and p_ensure = any(p_ids) and not (p_ensure = any(v_page))
        then public.admin_referral_tree_node(p_ensure)
    end
  );
end;
$$;

create or replace function public.admin_referral_tree_nodes(
  p_parent    uuid default null,
  p_group     text default null,
  p_ensure_id uuid default null,
  p_limit     int  default 50,
  p_offset    int  default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_res jsonb;
begin
  if p_group is not null and p_group <> 'unplaceable' then
    raise exception 'invalid group: %', p_group using errcode = '22023';
  end if;

  if p_group = 'unplaceable' then
    v_ids := public.admin_referral_unplaceable_ids();
  elsif p_parent is not null then
    select coalesce(array_agg(e.referee_user_id order by e.referred_at, e.referee_user_id), '{}')
      into v_ids
    from public.referral_edges e
    where e.referrer_user_id = p_parent;
  else
    select coalesce(array_agg(p.id order by p.created_at, p.id), '{}')
      into v_ids
    from public.profiles p
    where public.admin_referral_in_scope(p.id)
      and not exists (select 1 from public.referral_edges e where e.referee_user_id = p.id);
  end if;

  v_res := public.admin_referral_page(v_ids, p_ensure_id, p_limit, p_offset);
  if p_parent is null and p_group is null then
    v_res := v_res || jsonb_build_object(
      'unplaceable_count', coalesce(cardinality(public.admin_referral_unplaceable_ids()), 0));
  end if;
  return v_res;
end;
$$;

create or replace function public.admin_referral_tree_search(
  p_name   text default null,
  p_code   text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- 姓名比對兩邊都做 NFKC（全形英數與半形視為相同），與推薦碼的正規化一致（W6-26）。
  v_name   text := nullif(btrim(normalize(coalesce(p_name, ''), NFKC)), '');
  v_code   text := nullif(btrim(coalesce(p_code, '')), '');
  v_like   text;
  v_ids    uuid[];
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_page   uuid[];
begin
  if v_name is not null then
    v_like := '%' || replace(replace(replace(v_name, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(array_agg(p.id order by p.created_at, p.id), '{}')
    into v_ids
  from public.profiles p
  where public.admin_referral_in_scope(p.id)
    and (
      (v_like is not null and normalize(p.name, NFKC) ilike v_like escape '\')
      or (v_code is not null and exists (
            select 1 from public.referral_codes rc
            where rc.user_id = p.id and rc.code = v_code))
    );

  v_page := coalesce(v_ids[v_offset + 1 : v_offset + v_limit], '{}');
  return jsonb_build_object(
    'total', coalesce(cardinality(v_ids), 0),
    'matches', coalesce(
      (select jsonb_agg(
                public.admin_referral_tree_node(x) || jsonb_build_object(
                  'ancestor_ids', case when u.status = 'root' then
                    to_jsonb(array(select a from unnest(u.ids) with ordinality as r(a, k)
                                   order by k desc)) end,
                  'unplaceable_reason', case when u.status <> 'root' then u.status end)
                order by o)
       from unnest(v_page) with ordinality as t(x, o)
       cross join lateral public.admin_referral_upline(x) as u),
      '[]'::jsonb)
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_referral_upline(uuid)',
    'public.admin_referral_in_scope(uuid)',
    'public.admin_referral_tree_node(uuid)',
    'public.admin_referral_unplaceable_ids()',
    'public.admin_referral_page(uuid[], uuid, int, int)',
    'public.admin_referral_tree_nodes(uuid, text, uuid, int, int)',
    'public.admin_referral_tree_search(text, text, int, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- 「本人有過哪些推薦人」（階段 3 換線紀錄）要以 referee 查 pair-history；現況只有 PK (referrer, referee)。
create index if not exists idx_referral_pair_history_referee
  on public.referral_pair_history (referee_user_id);
