-- ============================================================
-- Uknow 後端重構 — 0003 觸發器、函數、衍生 View
-- ============================================================
--
-- 這裡是「能算就算、絕不另存」的實作核心：
--  * user_account_status：會員狀態由訂閱日期即時算
--  * public_listings    ：訪客瀏覽用，只回傳有效會員的刊登
--  * reward_balances     ：點數餘額由流水帳 + 排程即時加總
--  * referral_tree       ：三代推薦樹由 referral_edges 往上爬
-- ============================================================

-- ------------------------------------------------------------
-- 共用：自動維護 updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated     before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger trg_listings_updated     before update on public.listings
  for each row execute function public.set_updated_at();
create trigger trg_task_progress_updated before update on public.task_progress
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- auth.users 新增時，自動建立 profiles 列
-- name / phone 從註冊時帶的 metadata 取得
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 防止一般用戶把自己升級成 admin（只有 admin 能改 is_admin）
-- ------------------------------------------------------------
create or replace function public.prevent_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'permission denied: cannot change is_admin';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_no_escalation
  before update on public.profiles
  for each row execute function public.prevent_admin_escalation();

-- ------------------------------------------------------------
-- 產生唯一推薦碼：3 小寫英文 + 6 數字（abc123456）
-- ------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
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

-- ------------------------------------------------------------
-- 推薦碼驗證（給註冊頁的訪客用，透過 RPC 呼叫）
-- 只回傳必要的公開資訊
-- ------------------------------------------------------------
create or replace function public.validate_referral_code(p_code text)
returns table (
  referrer_user_id uuid,
  referrer_name    text,
  listing_name     text
)
language sql
security definer
set search_path = public
stable
as $$
  select rc.user_id, p.name, l.name
  from public.referral_codes rc
  join public.profiles p on p.id = rc.user_id
  left join public.listings l on l.user_id = rc.user_id
  where rc.code = p_code and rc.status = 'active'
  limit 1;
$$;

grant execute on function public.validate_referral_code(text) to anon, authenticated;

-- ============================================================
-- 衍生 View（即時計算，不另存）
-- ============================================================

-- ------------------------------------------------------------
-- user_account_status：會員「現在」的狀態 — 由最新一筆訂閱 + 現在時間算出
--   active   ：尚在 end_date 之內
--   grace    ：超過 end_date 但仍在 grace_period_end 之內
--   expired  ：超過寬限期，或從未訂閱
-- ------------------------------------------------------------
create or replace view public.user_account_status
with (security_invoker = on) as
select
  p.id as user_id,
  case
    when s.end_date is null                       then 'expired'
    when now() <= s.end_date                      then 'active'
    when now() <= s.grace_period_end              then 'grace'
    else 'expired'
  end as status,
  s.end_date,
  s.grace_period_end,
  s.is_canceled
from public.profiles p
left join lateral (
  select sub.end_date, sub.grace_period_end, sub.is_canceled
  from public.subscriptions sub
  where sub.user_id = p.id
  order by sub.end_date desc
  limit 1
) s on true;

-- ------------------------------------------------------------
-- public_listings：訪客瀏覽用 — 只回傳「擁有者目前為有效會員」的刊登
-- 此 View 預設以擁有者(postgres)權限執行，安全地對外暴露刊登，
-- 不需在 listings 表存 is_active，也不需開放整張 listings 給訪客
-- ------------------------------------------------------------
create or replace view public.public_listings as
select
  l.id,
  l.user_id,
  l.name,
  l.category,
  l.city,
  l.districts,
  l.gender,
  l.photos,
  l.contacts,
  l.description,
  l.created_at,
  l.updated_at
from public.listings l
join public.subscriptions sub on sub.user_id = l.user_id
where now() <= sub.grace_period_end   -- active 或 grace 皆可見
group by l.id;  -- 同一刊登可能對到多筆訂閱，去重

grant select on public.public_listings to anon, authenticated;

-- ------------------------------------------------------------
-- reward_balances：點數餘額 — 由流水帳 + 待發排程即時加總
--   total_earned ：歷史總入帳
--   available    ：可提領（流水帳淨額，已扣提領）
--   pending      ：處理中（尚未發放的排程）
--   withdrawn    ：已提領
-- ------------------------------------------------------------
create or replace view public.reward_balances
with (security_invoker = on) as
select
  p.id as user_id,
  coalesce(t.total_earned, 0) as total_earned,
  coalesce(t.available, 0)    as available,
  coalesce(s.pending, 0)      as pending,
  coalesce(t.withdrawn, 0)    as withdrawn
from public.profiles p
left join (
  select
    user_id,
    sum(amount) filter (where amount > 0)             as total_earned,
    sum(amount)                                        as available,
    -coalesce(sum(amount) filter (where type = 'withdrawal'), 0) as withdrawn
  from public.reward_transactions
  group by user_id
) t on t.user_id = p.id
left join (
  select beneficiary_user_id as user_id, sum(amount) as pending
  from public.reward_schedules
  where status = 'pending'
  group by beneficiary_user_id
) s on s.user_id = p.id;

-- ------------------------------------------------------------
-- referral_tree(p_user_id)：三代推薦樹 — 由 referral_edges 往「下」爬三層
-- 回傳該用戶招募到的 1/2/3 代成員
-- ------------------------------------------------------------
create or replace function public.referral_tree(p_user_id uuid)
returns table (
  user_id    uuid,
  user_name  text,
  generation int,
  status     text,
  referred_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    -- 第 1 代：直接被 p_user_id 推薦的人
    select e.referee_user_id as user_id, 1 as generation, e.referred_at
    from public.referral_edges e
    where e.referrer_user_id = p_user_id
    union all
    -- 往下展開到第 3 代
    select e.referee_user_id, t.generation + 1, e.referred_at
    from public.referral_edges e
    join tree t on e.referrer_user_id = t.user_id
    where t.generation < 3
  )
  select
    t.user_id,
    p.name as user_name,
    t.generation,
    a.status,
    t.referred_at
  from tree t
  join public.profiles p on p.id = t.user_id
  left join public.user_account_status a on a.user_id = t.user_id
  order by t.generation, t.referred_at;
$$;

grant execute on function public.referral_tree(uuid) to authenticated;
