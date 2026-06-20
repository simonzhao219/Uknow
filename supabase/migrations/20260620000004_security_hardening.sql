-- ============================================================
-- Uknow 後端重構 — 0004 安全強化（修正 advisor 警告）
-- ============================================================
--
--  1. public_listings 改為 security_invoker，不再繞過 RLS
--  2. 新增 has_active_subscription() 判斷會員是否有效（不洩漏訂閱明細）
--  3. listings 新增公開瀏覽 policy（只看得到有效會員的刊登）
--  4. 為所有函數鎖定 search_path
--  5. 撤銷 trigger 函數的對外執行權限
-- ============================================================

-- 判斷某用戶目前是否為有效會員（active 或 grace）
-- security definer：內部讀 subscriptions，但只回傳 boolean，不外洩資料
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
  );
$$;
revoke execute on function public.has_active_subscription(uuid) from public;
grant execute on function public.has_active_subscription(uuid) to anon, authenticated;

-- listings 公開瀏覽：任何人都能看到「有效會員」的刊登
create policy listings_select_public on public.listings
  for select using (public.has_active_subscription(user_id));

-- public_listings 改為 security_invoker，並用函數判斷可見性（不再 join subscriptions）
drop view if exists public.public_listings;
create view public.public_listings
with (security_invoker = on) as
select
  l.id, l.user_id, l.name, l.category, l.city, l.districts,
  l.gender, l.photos, l.contacts, l.description, l.created_at, l.updated_at
from public.listings l
where public.has_active_subscription(l.user_id);
grant select on public.public_listings to anon, authenticated;

-- 為缺少 search_path 的函數補上
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.generate_referral_code()
returns text language plpgsql set search_path = public as $$
declare
  letters text := 'abcdefghijklmnopqrstuvwxyz';
  digits  text := '0123456789';
  code    text;
  i       int;
begin
  loop
    code := '';
    for i in 1..3 loop
      code := code || substr(letters, floor(random() * 26 + 1)::int, 1);
    end loop;
    for i in 1..6 loop
      code := code || substr(digits, floor(random() * 10 + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.referral_codes rc where rc.code = code);
  end loop;
  return code;
end;
$$;

-- 撤銷 trigger / 內部函數的對外執行權限（trigger 執行不需 caller 權限）
revoke execute on function public.handle_new_user()          from anon, authenticated, public;
revoke execute on function public.prevent_admin_escalation() from anon, authenticated, public;
revoke execute on function public.set_updated_at()           from anon, authenticated, public;
revoke execute on function public.is_admin()                 from anon, public;
