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
