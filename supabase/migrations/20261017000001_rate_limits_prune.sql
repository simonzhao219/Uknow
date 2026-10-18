-- ============================================================
-- rate_limits 清理：prune_rate_limits() ＋ pg_cron 每小時排程
-- （見 check-email-rate-limit.test.ts）。
--
-- 背景：rate_limits（20260720000002）是固定窗口計數表，一個 key 一列、
-- 只增不減。check-email 以 IP 為鍵，推薦碼驗證以使用者為鍵，列數會隨
-- 來訪者無上限成長。窗口過期的列刪掉與「下次 bump 時重置」語意相同，
-- 所以清理只要保留期長於最長窗口就不會改變任何限流判定。
--
-- 保留期 2 天＝目前最長窗口（推薦碼驗證日窗 1 天，index.ts 的限流常數
-- 區）的兩倍。新增更長的窗口前必須先調高這裡的預設值。
--
-- 為什麼是 pg_cron：Supabase 官方的排程模組（Supabase Cron），在 DB 內
-- 執行、時機固定、執行紀錄在 cron.job_run_details 可查；不把清理成本
-- 攤到使用者請求上，也不和金流對帳的 workflow 綁在一起。
-- 啟用方式依官方文件（supabase.com/docs/guides/cron/install）。
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 清理以 window_start 範圍掃描，避免每小時全表掃。
create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

create or replace function public.prune_rate_limits(
  p_older_than_seconds int default 172800
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.rate_limits
  where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_rate_limits(int) from anon, authenticated, public;

-- 以 job 名稱 upsert：重跑 migration 不會產生第二個排程。
-- 分鐘取 17 只是避開整點的排程尖峰。
select cron.schedule(
  'prune-rate-limits',
  '17 * * * *',
  $$select public.prune_rate_limits()$$
);
