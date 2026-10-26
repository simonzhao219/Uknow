-- 紅燈 stub：只求簽章存在，行為留空（見 referral-invite-purge.test.ts）。

create or replace function public.delete_auth_audit_for_users(p_user_ids uuid[])
returns int
language sql
security definer
set search_path = public
as $$
  select 0
$$;

create or replace function public.purge_stale_referral_invites(
  p_older_than_days int default 7,
  p_email text default null
)
returns int
language sql
security definer
set search_path = public
as $$
  select 0
$$;
