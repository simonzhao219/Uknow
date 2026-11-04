// ============================================================
// scheduled_job_runs 帳本與租約（migration 20261111000001）：
// begin_scheduled_run／finish_scheduled_run 的交易語意與權限。
//
// 這張帳本是排程觀測的單一來源：pg_cron 經 pg_net 呼叫端點是非同步的，
// cron.job_run_details 只看得到「請求排進佇列」，看不到端點有沒有做完。
// 租約是 partial unique (job) where status='running'：同一個 job 同時只有
// 一個在跑，pg_cron、GitHub 補跑、人工 dispatch 撞在一起時，其餘的落
// skipped。
//
// 隔離：本機 supabase start 之後會有 pg_cron 每小時寫 vault_missing 列（階段
// 8 起），所以每支測試開頭清表，只斷言自己造的列。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient } from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Lease = { id: number; acquired: boolean };

async function resetLedger() {
  const { error } = await adminClient().from('scheduled_job_runs').delete().gte('id', 0);
  if (error) throw new Error(`清帳本失敗：${error.message}`);
}

async function begin(job: string, trigger: string): Promise<Lease> {
  const { data, error } = await adminClient().rpc('begin_scheduled_run', {
    p_job: job,
    p_trigger: trigger,
  });
  if (error) throw new Error(`begin_scheduled_run 失敗：${error.message}`);
  return data as Lease;
}

async function rowById(id: number) {
  const { data, error } = await adminClient().from('scheduled_job_runs')
    .select('job, trigger, status, error_code, summary, finished_at').eq('id', id).single();
  if (error) throw new Error(`讀帳本失敗：${error.message}`);
  return data;
}

Deno.test('begin_scheduled_run：第一次拿到租約、第二次落 skipped／concurrent', async () => {
  await resetLedger();
  const first = await begin('reconcile', 'pg_cron');
  assertEquals(first.acquired, true);
  assertEquals((await rowById(first.id)).status, 'running');

  const second = await begin('reconcile', 'github');
  assertEquals(second.acquired, false);
  const row = await rowById(second.id);
  assertEquals(row.status, 'skipped');
  assertEquals(row.error_code, 'concurrent');
  assertEquals(row.trigger, 'github');
  assert(row.finished_at, 'skipped 列要有 finished_at');

  // 不同 job 互不影響
  assertEquals((await begin('purge-photos', 'pg_cron')).acquired, true);
  await resetLedger();
});

Deno.test('begin_scheduled_run：兩條獨立連線並行 → 只有一個拿到租約', async () => {
  await resetLedger();
  const a = postgres(DB_URL, { max: 1 });
  const b = postgres(DB_URL, { max: 1 });
  try {
    let bResult: Promise<Lease> | null = null;
    const aLease = await a.begin(async (tx) => {
      const [{ r }] = await tx`select public.begin_scheduled_run('reconcile', 'pg_cron') as r`;
      // A 的交易還沒 commit：B 會卡在 partial unique 上，A commit 後撞 unique_violation
      bResult = b`select public.begin_scheduled_run('reconcile', 'github') as r`
        .then((rows) => rows[0].r as Lease);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return r as Lease;
    });
    const bLease = await bResult!;
    assertEquals(aLease.acquired, true);
    assertEquals(bLease.acquired, false);
  } finally {
    await a.end();
    await b.end();
    await resetLedger();
  }
});

Deno.test('begin_scheduled_run：15 分鐘前的 running 改成 abandoned，新的一輪拿得到租約', async () => {
  await resetLedger();
  const { data: stale, error } = await adminClient().from('scheduled_job_runs').insert({
    job: 'reconcile',
    trigger: 'pg_cron',
    status: 'running',
    started_at: new Date(Date.now() - 16 * 60_000).toISOString(),
  }).select('id').single();
  if (error) throw new Error(error.message);

  const lease = await begin('reconcile', 'pg_cron');
  assertEquals(lease.acquired, true);
  const old = await rowById(stale.id);
  assertEquals(old.status, 'abandoned');
  assert(old.finished_at);

  // 14 分鐘前的 running 不算逾時：仍擋住新的一輪
  await resetLedger();
  await adminClient().from('scheduled_job_runs').insert({
    job: 'reconcile',
    trigger: 'pg_cron',
    status: 'running',
    started_at: new Date(Date.now() - 14 * 60_000).toISOString(),
  });
  assertEquals((await begin('reconcile', 'pg_cron')).acquired, false);
  await resetLedger();
});

Deno.test('begin_scheduled_run：未知 trigger 一律記成 manual', async () => {
  await resetLedger();
  const lease = await begin('reconcile', 'cron-job.org');
  assertEquals((await rowById(lease.id)).trigger, 'manual');
  await resetLedger();
});

Deno.test('finish_scheduled_run：寫入結果；對已不是 running 的列不生效', async () => {
  await resetLedger();
  const lease = await begin('reconcile', 'pg_cron');
  const done = await adminClient().rpc('finish_scheduled_run', {
    p_id: lease.id,
    p_status: 'failed',
    p_summary: { checked: 2 },
    p_error_code: 'query_all_failed',
  });
  assertEquals(done.error, null);
  assertEquals(done.data, true);
  const row = await rowById(lease.id);
  assertEquals(row.status, 'failed');
  assertEquals(row.error_code, 'query_all_failed');
  assertEquals(row.summary, { checked: 2 });
  assert(row.finished_at);

  // 晚到的舊 run（列已被改成 abandoned 或已 finish）不得覆寫結果
  const again = await adminClient().rpc('finish_scheduled_run', {
    p_id: lease.id,
    p_status: 'succeeded',
    p_summary: {},
    p_error_code: null,
  });
  assertEquals(again.data, false);
  assertEquals((await rowById(lease.id)).status, 'failed');
  await resetLedger();
});

Deno.test('scheduled_job_runs 權限：anon／authenticated 不可 EXECUTE 租約函式、不可讀寫帳本', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (const role of ['anon', 'authenticated']) {
      const [r] = await sql`
        select
          has_function_privilege(${role}, 'public.begin_scheduled_run(text, text)', 'execute') as begin_exec,
          has_function_privilege(${role}, 'public.finish_scheduled_run(bigint, text, jsonb, text)', 'execute') as finish_exec,
          has_table_privilege(${role}, 'public.scheduled_job_runs', 'select') as sel,
          has_table_privilege(${role}, 'public.scheduled_job_runs', 'insert') as ins`;
      assertEquals(
        { ...r },
        { begin_exec: false, finish_exec: false, sel: false, ins: false },
        `${role} 權限`,
      );
    }
  } finally {
    await sql.end();
  }
});
