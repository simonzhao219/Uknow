-- ============================================================
-- Uknow 後端重構 — 0102 (0718) 會員停權 + 全站公告 + AdminSetup
-- ============================================================
--
-- Admin 後台接真資料（會員管理／公告管理）所需的資料層：
--
--   1. profiles.suspended_at：停權時點。停權效果走
--      has_active_subscription()——它同時是 listings_select_public
--      RLS policy 與 public_listings view 的守門，一處修改，停權
--      用戶的刊登在兩個面向同時消失。
--   2. announcements：全站公告（原本前台的「系統維護預告」橫幅寫死
--      在 src/utils/constants.ts）。有效區間 = is_active 且 now() 落在
--      starts_at ~ ends_at（ends_at null = 無期限）。讀取走 API
--      （service_role），不開放直查。
--   3. admin_setup_claim()：首位管理員自助宣告——只在系統尚無任何
--      管理員時允許，advisory lock 防兩人同時搶。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 會員停權
-- ------------------------------------------------------------
alter table public.profiles
  add column suspended_at timestamptz;

-- 停權用戶的刊登下架：兩個對外可見性守門（RLS policy 與
-- public_listings view）都走這個函數，改這裡就同時生效。
create or replace function public.has_active_subscription(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id and now() <= s.grace_period_end
  )
  and not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.suspended_at is not null
  );
$$;

-- ------------------------------------------------------------
-- 2. 全站公告
-- ------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  message    text not null,
  type       text not null default 'info' check (type in ('info', 'warning', 'error')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

create index idx_announcements_active on public.announcements (is_active, starts_at, ends_at);

-- ------------------------------------------------------------
-- 2b. 會員列表（admin 用）：join auth.users 拿 email——auth schema
--     沒有暴露給 PostgREST，security definer SQL 函數是唯一乾淨的路。
-- ------------------------------------------------------------
create or replace function public.admin_list_members(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      p.id,
      p.name,
      p.phone,
      p.is_admin,
      p.suspended_at,
      p.created_at,
      u.email,
      coalesce(a.status, 'expired') as account_status,
      (select count(*) from public.listings l where l.user_id = p.id) as listing_count
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_account_status a on a.user_id = p.id
    where p_search is null or p_search = ''
       or p.name  ilike '%' || p_search || '%'
       or u.email ilike '%' || p_search || '%'
       or p.phone ilike '%' || p_search || '%'
  )
  select jsonb_build_object(
    'total',   (select count(*) from filtered),
    'members', coalesce(
      (select jsonb_agg(to_jsonb(m))
       from (
         select * from filtered
         order by created_at desc
         limit least(coalesce(p_limit, 50), 200)
         offset greatest(coalesce(p_offset, 0), 0)
       ) m),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function public.admin_list_members(text, int, int) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 2c. prevent_admin_escalation 放行受信任的後端角色。
--     原版只看 public.is_admin()（讀 auth.uid()）——service_role
--     （edge function）與 postgres（security definer 函數，例如下面的
--     admin_setup_claim）呼叫時 auth.uid() 是 null，連受信任的後端
--     都改不了 is_admin。前端使用者仍然無法自我提權（RLS 之外的
--     第二道防線不變）。
-- ------------------------------------------------------------
create or replace function public.prevent_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and not public.is_admin()
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'permission denied: cannot change is_admin';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. 首位管理員自助宣告
-- ------------------------------------------------------------
create or replace function public.admin_setup_claim(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 兩人同時按「設為管理員」：advisory lock 序列化，第二人看到
  -- already_initialized。
  perform pg_advisory_xact_lock(hashtext('admin_setup_claim'));

  if exists (select 1 from public.profiles where is_admin) then
    return jsonb_build_object('success', false, 'error_code', 'already_initialized',
      'message', '系統已有管理員，請聯繫現有管理員授權');
  end if;

  update public.profiles set is_admin = true where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到使用者');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.admin_setup_claim(uuid) from anon, authenticated, public;
