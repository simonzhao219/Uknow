-- ============================================================
-- 排程帳本與租約：scheduled_job_runs ＋ begin／finish_scheduled_run
-- （見 scheduled-job-runs.test.ts、scheduled-runs.ts）。
--
-- 背景：對帳（每小時）與刊登照片清理（每日）原由 GitHub 排程觸發，GitHub
-- 會大量跳過（24 小時只跑 3 次）。改由 pg_cron 經 pg_net 呼叫 Edge Function
-- 端點觸發；pg_net 是非同步的，cron.job_run_details 只記到「請求排進佇列」，
-- 看不到端點有沒有做完——所以由端點自己寫這張帳本，GitHub 看門狗與準時度
-- 量測都讀它。
--
-- 租約：partial unique (job) where status = 'running'。pg_cron、GitHub 補跑、
-- 人工 dispatch 撞在一起時只有一個真的做事，其餘落 skipped。15 分鐘前的
-- running 視為崩潰殘留（Edge 被 wall clock 砍掉時 finally 不會跑），改
-- abandoned 釋放——15 分鐘大於 Edge 最大執行時間（paid 400 秒）、小於對帳
-- 間隔。
-- ============================================================

create table if not exists public.scheduled_job_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('reconcile', 'purge-photos')),
  trigger text not null check (trigger in ('pg_cron', 'github', 'manual')),
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  summary jsonb
);

comment on table public.scheduled_job_runs is
  '排程端點（對帳、刊登照片清理）的執行帳本兼租約；由 Edge Function 以 service_role 寫入。summary 不放 uid／name。';

create index if not exists scheduled_job_runs_job_started_idx
  on public.scheduled_job_runs (job, started_at desc);

create unique index if not exists scheduled_job_runs_one_running_idx
  on public.scheduled_job_runs (job) where status = 'running';

alter table public.scheduled_job_runs enable row level security;
-- RLS 無 policy 已擋住 API 角色；再 revoke 一次，RLS 不是唯一防線。
revoke all on table public.scheduled_job_runs from anon, authenticated, public;
grant all on table public.scheduled_job_runs to service_role;

-- pay P1-3：PayUni 回了判讀不了的狀態（8＝待確認、碼表外、缺欄位、查不到同號交易）
-- 時，對帳不標 expired、改告警交人工，並記下時間。對帳的掃描視窗以
-- `reconcile_unknown_at nulls first, created_at` 排序：被標過的單排到後段輪流，
-- 不會塞滿每輪 50 張而餓死真卡單。查到可判讀的結果時清回 null。
alter table public.payment_orders add column if not exists reconcile_unknown_at timestamptz;
comment on column public.payment_orders.reconcile_unknown_at is
  '對帳最近一次判讀不了 PayUni 狀態的時間；非 null 時該單永不自動標 expired，掃描排到後段';

-- 取租約。回 {id, acquired}：acquired=false 時 id 指向本次寫下的 skipped 列。
create or replace function public.begin_scheduled_run(p_job text, p_trigger text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trigger text := case when p_trigger in ('pg_cron', 'github') then p_trigger else 'manual' end;
  v_id bigint;
begin
  update public.scheduled_job_runs
     set status = 'abandoned', finished_at = now(), error_code = 'lease_expired'
   where job = p_job and status = 'running' and started_at < now() - interval '15 minutes';

  begin
    insert into public.scheduled_job_runs (job, trigger, status)
    values (p_job, v_trigger, 'running')
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'acquired', true);
  exception when unique_violation then
    insert into public.scheduled_job_runs (job, trigger, status, finished_at, error_code)
    values (p_job, v_trigger, 'skipped', now(), 'concurrent')
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'acquired', false);
  end;
end;
$$;

-- 寫結果。只更新仍為 running 的列：晚到的舊 run 在被改成 abandoned 後不得覆寫。
create or replace function public.finish_scheduled_run(
  p_id bigint,
  p_status text,
  p_summary jsonb,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'finish_scheduled_run: status 只能是 succeeded／failed，收到 %', p_status;
  end if;
  update public.scheduled_job_runs
     set status = p_status, finished_at = now(), summary = p_summary, error_code = p_error_code
   where id = p_id and status = 'running';
  return found;
end;
$$;

revoke execute on function public.begin_scheduled_run(text, text) from anon, authenticated, public;
revoke execute on function public.finish_scheduled_run(bigint, text, jsonb, text) from anon, authenticated, public;
grant execute on function public.begin_scheduled_run(text, text) to service_role;
grant execute on function public.finish_scheduled_run(bigint, text, jsonb, text) to service_role;

-- ============================================================
-- scheduler_health()：GET /internal/scheduler-health 的資料來源（GitHub 看門狗
-- 每小時讀）。回應形狀由 scripts/fixtures/scheduler-health/shape.json 釘住。
--
-- 「完成列」：status 為 succeeded／failed，且 error_code 不是傳輸／設定類
-- （vault_missing、exception）。業務失敗（query_all_failed、circuit_open）也算
-- 完成——pg_cron 與 Edge 都正常、是下游有問題，看門狗不該補跑或推「停擺」。
-- lastPgCronCompletedAt 只看 pg_cron 列：GitHub 補跑寫的完成列不得刷新它，
-- 否則停擺期間看門狗會以為恢復了。
--
-- pgNet6h：net._http_response 只保留約 6 小時，只當診斷用；pg_net 尚未安裝時為
-- null（動態查詢，免得函式在 pg_net 之前建立就失效）。不回帳本明細（summary）。
-- ============================================================
create or replace function public.scheduler_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs jsonb := '{}'::jsonb;
  v_job text;
  v_cron_name text;
  v_present boolean;
  v_active boolean;
  v_completed record;
  v_pg_completed timestamptz;
  v_pg_row record;
  v_counts jsonb;
  v_dry_run boolean;
  v_net jsonb := null;
begin
  foreach v_job in array array['reconcile', 'purge-photos'] loop
    v_cron_name := case v_job
      when 'reconcile' then 'reconcile-pending-payments'
      else 'purge-orphan-listing-photos'
    end;

    select true, j.active into v_present, v_active from cron.job j where j.jobname = v_cron_name;
    v_present := coalesce(v_present, false);
    v_active := coalesce(v_active, false);

    select r.finished_at, r.status, r.trigger into v_completed
      from public.scheduled_job_runs r
     where r.job = v_job and r.status in ('succeeded', 'failed')
       and coalesce(r.error_code, '') not in ('vault_missing', 'exception')
     order by r.finished_at desc nulls last, r.id desc limit 1;

    select max(r.finished_at) into v_pg_completed
      from public.scheduled_job_runs r
     where r.job = v_job and r.trigger = 'pg_cron' and r.status in ('succeeded', 'failed')
       and coalesce(r.error_code, '') not in ('vault_missing', 'exception');

    select r.started_at, r.error_code into v_pg_row
      from public.scheduled_job_runs r
     where r.job = v_job and r.trigger = 'pg_cron'
     order by r.started_at desc, r.id desc limit 1;

    select jsonb_build_object(
             'succeeded', count(*) filter (where r.status = 'succeeded'),
             'failed', count(*) filter (where r.status = 'failed'),
             'skipped', count(*) filter (where r.status = 'skipped'),
             'abandoned', count(*) filter (where r.status = 'abandoned'))
      into v_counts
      from public.scheduled_job_runs r
     where r.job = v_job and r.started_at > now() - interval '24 hours';

    v_dry_run := null;
    if v_job = 'purge-photos' then
      select (r.summary ->> 'dryRun')::boolean into v_dry_run
        from public.scheduled_job_runs r
       where r.job = v_job and r.trigger = 'pg_cron' and r.summary ? 'dryRun'
       order by r.started_at desc, r.id desc limit 1;
    end if;

    v_jobs := v_jobs || jsonb_build_object(v_job, jsonb_build_object(
      'cronJobPresent', v_present,
      'cronJobActive', v_active,
      'lastCompletedAt', v_completed.finished_at,
      'lastCompletedStatus', v_completed.status,
      'lastCompletedTrigger', v_completed.trigger,
      'lastPgCronCompletedAt', v_pg_completed,
      'lastPgCronRowAt', v_pg_row.started_at,
      'lastPgCronErrorCode', v_pg_row.error_code,
      'counts24h', v_counts,
      'lastPurgeDryRun', v_dry_run
    ));
    v_completed := null;
    v_pg_row := null;
    v_present := null;
    v_active := null;
  end loop;

  if to_regclass('net._http_response') is not null then
    execute $q$
      select jsonb_build_object(
        'non2xx', count(*) filter (where status_code is null or status_code not between 200 and 299),
        'timedOut', count(*) filter (where timed_out),
        'lastStatusCodes', coalesce(
          (select jsonb_agg(coalesce(x.status_code, 0) order by x.id desc)
             from (select id, status_code from net._http_response
                    where created > now() - interval '6 hours'
                    order by id desc limit 5) x),
          '[]'::jsonb))
      from net._http_response where created > now() - interval '6 hours'
    $q$ into v_net;
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'jobs', v_jobs,
    'pgNet6h', coalesce(v_net, jsonb_build_object('non2xx', 0, 'timedOut', 0, 'lastStatusCodes', '[]'::jsonb))
  );
end;
$$;

revoke execute on function public.scheduler_health() from anon, authenticated, public;
grant execute on function public.scheduler_health() to service_role;

-- ============================================================
-- pg_cron 觸發：invoke_internal_endpoint ＋ 三個排程（放最後：端點都備妥才掛排程）。
--
-- 憑證（W5-15①）：URL 與 x-internal-secret 放 Vault，由人在各環境 SQL Editor 建，
-- 不進 migration（SOP 見 docs/supabase-setup-checklist.md）：
--   uknow_api_base_url     https://<ref>.supabase.co/functions/v1/api
--   uknow_internal_secret  ＝ 該環境 Edge 的 RECONCILE_SECRET
-- 缺任一 → 寫一列 skipped／vault_missing、不送請求。拋棄式 journey 分支就是這樣
-- 空轉；正式站漏設時看門狗看得到（沒有完成列 → 補跑並推 LINE）。
--
-- pg_net 權限（W5-31，業主 2026-11-05 接受平台預設）：裝好後 anon／authenticated
-- 在 SQL 層有 net schema 的權限，postgres 角色收不回（擁有者是 supabase_admin）。
-- PostgREST 不暴露 net，經 REST 碰不到；本案函式另行 revoke，vault 不可讀。
-- ============================================================
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_internal_endpoint(p_job text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
  v_url text;
  v_secret text;
  v_id bigint;
begin
  -- 白名單：只打這兩支端點，不接受任意 URL。
  v_path := case p_job
    when 'reconcile' then '/internal/reconcile-pending-payments'
    when 'purge-photos' then '/internal/purge-orphan-listing-photos'
  end;
  if v_path is null then
    raise exception 'invoke_internal_endpoint: 未知的 job %', p_job;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'uknow_api_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'uknow_internal_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    insert into public.scheduled_job_runs (job, trigger, status, finished_at, error_code)
    values (p_job, 'pg_cron', 'skipped', now(), 'vault_missing');
    return null;
  end if;

  -- pg_net 非同步、不重試；逾時只代表 pg_net 不等了，結果以端點寫的帳本為準。
  select net.http_post(
    url := rtrim(v_url, '/') || v_path,
    body := jsonb_build_object('trigger', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    timeout_milliseconds := 150000
  ) into v_id;
  return v_id;
end;
$$;

-- 帳本 90 天前的列由每日排程清掉（量約每日 25 列）。
create or replace function public.prune_scheduled_job_runs(p_older_than_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.scheduled_job_runs
   where started_at < now() - make_interval(days => p_older_than_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- 一鍵停／恢復：只切 cron.job.active，排程列保留——看門狗以 cronJobActive=false
-- 判讀「人為停用」，不會誤報「排程不存在」；恢復時也不必再寫一份排程字串。
create or replace function public.pause_scheduled_jobs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_count int := 0;
begin
  for v_job in
    select jobid from cron.job where jobname in ('reconcile-pending-payments', 'purge-orphan-listing-photos')
  loop
    perform cron.alter_job(job_id := v_job.jobid, active := false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.resume_scheduled_jobs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_count int := 0;
begin
  for v_job in
    select jobid from cron.job where jobname in ('reconcile-pending-payments', 'purge-orphan-listing-photos')
  loop
    perform cron.alter_job(job_id := v_job.jobid, active := true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.invoke_internal_endpoint(text) from anon, authenticated, public;
revoke execute on function public.prune_scheduled_job_runs(int) from anon, authenticated, public;
revoke execute on function public.pause_scheduled_jobs() from anon, authenticated, public;
revoke execute on function public.resume_scheduled_jobs() from anon, authenticated, public;
grant execute on function public.prune_scheduled_job_runs(int) to service_role;

-- 以 job 名稱 upsert：重跑 migration 不會產生第二個排程。
-- 對帳第 7 分：避開整點尖峰，也和 prune-rate-limits（第 17 分）錯開。
-- 照片清理 UTC 19:17＝台北 03:17（沿用原 GitHub 排程的時間）。
select cron.schedule(
  'reconcile-pending-payments',
  '7 * * * *',
  $$select public.invoke_internal_endpoint('reconcile')$$
);
select cron.schedule(
  'purge-orphan-listing-photos',
  '17 19 * * *',
  $$select public.invoke_internal_endpoint('purge-photos')$$
);
select cron.schedule(
  'prune-scheduled-job-runs',
  '41 4 * * *',
  $$select public.prune_scheduled_job_runs()$$
);
