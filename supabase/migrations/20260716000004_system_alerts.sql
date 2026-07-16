-- ============================================================
-- Uknow 後端重構 — 0004 (0716) system_alerts：最小可行的靜默失敗告警
-- ============================================================
--
-- 背景：process_successful_payment 的周邊業務邏輯（推薦碼/推薦樹/獎金/
-- 任務進度）失敗時只 `raise warning`，只有主動 tail Postgres log 才會
-- 看到。改成同時寫一筆可查詢的紀錄，讓「這次付款有沒有留下孤兒資料」
-- 這件事變成一個 SQL 查詢就能回答，而不是要翻 log。
--
-- 這張表本身絕不能反過來影響任何呼叫端——寫入失敗只能吞掉，不能拋出，
-- 呼叫端（process_successful_payment / edge function）會自己包好
-- try/catch，這裡只負責定義表跟權限。
-- ============================================================

create table public.system_alerts (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,        -- 'process_successful_payment' / 'reconcile-pending-payments' / ...
  severity    text not null default 'warning' check (severity in ('info', 'warning', 'error')),
  message     text not null,
  context     jsonb not null default '{}'::jsonb,   -- trade_no、user_id、sqlerrm 等除錯用資訊
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_system_alerts_unresolved on public.system_alerts(created_at desc) where resolved_at is null;
create index idx_system_alerts_source on public.system_alerts(source, created_at desc);

alter table public.system_alerts enable row level security;

-- 只有管理員能讀；一般使用者完全看不到（這是內部維運資料，不是使用者資料）。
create policy system_alerts_select_admin on public.system_alerts
  for select using (public.is_admin());

-- 寫入只透過 SECURITY DEFINER 函數（process_successful_payment 等）或
-- edge function 的 service_role client，兩者都會繞過 RLS，不需要
-- insert/update policy。
revoke all on public.system_alerts from anon, authenticated;

-- ------------------------------------------------------------
-- log_system_alert：給其他 SECURITY DEFINER 函數在自己的 exception
-- 分支裡呼叫的小工具。自己吞掉所有例外——告警本身絕不能反過來讓
-- 呼叫端（例如 process_successful_payment 的付款關鍵路徑）失敗。
-- ------------------------------------------------------------
create or replace function public.log_system_alert(
  p_source   text,
  p_severity text,
  p_message  text,
  p_context  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_alerts (source, severity, message, context)
  values (p_source, p_severity, p_message, p_context);
exception when others then
  null;
end;
$$;

revoke execute on function public.log_system_alert(text, text, text, jsonb) from anon, authenticated, public;
