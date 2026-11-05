-- ============================================================
-- 推薦王與新約：配對名單另存、門檻重算（第 5 波 S6 階段 5；ref P2-2、P2-3；W5-8；
-- 見 referral-pair-history.test.ts）
-- ============================================================
-- 紅燈 stub：表、欄、回填函式先到位（回填不做事），綠燈階段補實作。
-- ============================================================

create table if not exists public.referral_pair_history (
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referee_user_id  uuid not null references public.profiles(id) on delete cascade,
  first_month_key  text not null,
  created_at       timestamptz not null default now(),
  primary key (referrer_user_id, referee_user_id)
);
alter table public.referral_pair_history enable row level security;
revoke all on public.referral_pair_history from anon, authenticated;

alter table public.task_progress
  add column if not exists king_round_base jsonb not null default '{}'::jsonb;

create or replace function public.backfill_referral_pair_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return 0;
end;
$$;

revoke execute on function public.backfill_referral_pair_history()
  from anon, authenticated, public;
grant execute on function public.backfill_referral_pair_history() to service_role;
