-- 紅燈 stub：只求簽章存在，行為留空（見 refund-rate-limit.test.ts）。

create or replace function public.refund_rate_limit(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  null;
end;
$$;
