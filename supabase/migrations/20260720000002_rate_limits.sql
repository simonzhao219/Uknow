-- ============================================================
-- 通用固定窗口限流器（見 check-email-rate-limit.test.ts）。
--
-- 背景：/auth/check-email 是無驗證端點，回傳的 { exists } 本身就是
-- 帳號枚舉位元，且每次呼叫以 service role 打一次 auth admin API。
-- Edge Function 沒有內建限流，用一張 DB 計數表做固定窗口限流：
-- bump_rate_limit(key, max, window) 回傳是否放行。
--
-- 設計取捨：固定窗口（非滑動）＋單列 upsert——一個 RPC round-trip
-- 完成計數與判定，足以擋住批量枚舉；限流器自身故障時回傳 true
-- （fail-open）——限流是防濫用的第二道防線，不能反過來擋掉正常註冊。
-- ============================================================

create table public.rate_limits (
  key          text primary key,
  count        int not null default 1,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.bump_rate_limit(
  p_key            text,
  p_max            int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rl.count + 1
    end,
    window_start = case
      when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rl.window_start
    end
  returning count <= p_max into v_allowed;
  return v_allowed;
exception when others then
  -- fail-open：限流器故障不能擋掉正常流量
  return true;
end;
$$;

revoke execute on function public.bump_rate_limit(text, int, int) from anon, authenticated, public;
