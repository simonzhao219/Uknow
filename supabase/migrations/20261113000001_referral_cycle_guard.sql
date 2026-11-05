-- ============================================================
-- 推薦成環防線（第 5 波 S6 階段 1；稽核 ref P0-2；見 referral-cycle.test.ts）
-- ============================================================
-- 紅燈 stub：referral_would_cycle 先恆回 false，綠燈階段補實作。
-- ============================================================

create or replace function public.referral_would_cycle(
  p_referee      uuid,
  p_new_referrer uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return false;
end;
$$;

revoke execute on function public.referral_would_cycle(uuid, uuid)
  from anon, authenticated, public;
grant execute on function public.referral_would_cycle(uuid, uuid)
  to service_role;
