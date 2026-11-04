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
