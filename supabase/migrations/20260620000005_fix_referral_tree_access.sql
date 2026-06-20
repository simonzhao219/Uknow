-- ============================================================
-- Uknow 後端重構 — 0005 修正 referral_tree 存取控制
-- ============================================================
--
-- 問題：原 referral_tree(p_user_id) 接受任意 user_id，登入者可傳
--       他人 ID 偷看別人的推薦樹。
-- 修正：只允許查自己的樹（p_user_id 省略時預設自己），admin 可查任何人。
-- ============================================================

drop function if exists public.referral_tree(uuid);

create or replace function public.referral_tree(p_user_id uuid default null)
returns table (user_id uuid, user_name text, generation int, status text, referred_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
begin
  -- 只能查自己的推薦樹；admin 例外
  if v_target <> auth.uid() and not public.is_admin() then
    raise exception 'permission denied: can only query own referral tree';
  end if;

  return query
  with recursive tree as (
    select e.referee_user_id as uid, 1 as gen, e.referred_at as rat
    from public.referral_edges e
    where e.referrer_user_id = v_target
    union all
    select e.referee_user_id, t.gen + 1, e.referred_at
    from public.referral_edges e
    join tree t on e.referrer_user_id = t.uid
    where t.gen < 3
  )
  select t.uid, p.name, t.gen, a.status, t.rat
  from tree t
  join public.profiles p on p.id = t.uid
  left join public.user_account_status a on a.user_id = t.uid
  order by t.gen, t.rat;
end;
$$;

revoke execute on function public.referral_tree(uuid) from anon, public;
grant execute on function public.referral_tree(uuid) to authenticated;
