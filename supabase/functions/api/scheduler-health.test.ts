// ============================================================
// GET /internal/scheduler-health ＋ scheduler_health() RPC。
//
// GitHub 看門狗（scripts/scheduler-watchdog.py）每小時讀它，判斷 pg_cron 是否
// 存活、要不要補跑、要不要推 LINE。回應形狀是 TS 端點與 Python 看門狗之間的
// 契約，由 scripts/fixtures/scheduler-health/shape.json 釘住：這裡做雙向鍵集合
// 比對，看門狗的 self-test 讀同一份檔。
//
// 「完成列」（plan §2.5）：status 為 succeeded／failed，且 error_code 不是
// 傳輸／設定類（vault_missing、exception）。業務失敗（query_all_failed、
// circuit_open）也算完成——代表 pg_cron 與 Edge 都正常。看門狗只用 pg_cron 的
// 完成列判斷存活，GitHub 補跑寫的完成列不能刷新它。
//
// 本機 pg_cron 會寫帳本，所以每支測試先清表；動到 cron.job 的測試結束時還原。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient, ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');
Deno.env.set('RECONCILE_SECRET', 'scheduler-health-test-secret');

const { app } = await import('./index.ts');
const headers = { 'x-internal-secret': 'scheduler-health-test-secret' };
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SHAPE = new URL('../../../scripts/fixtures/scheduler-health/shape.json', import.meta.url);

async function resetLedger() {
  const { error } = await adminClient().from('scheduled_job_runs').delete().gte('id', 0);
  if (error) throw new Error(`清帳本失敗：${error.message}`);
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function seed(rows: Array<Record<string, unknown>>) {
  const { error } = await adminClient().from('scheduled_job_runs').insert(rows);
  if (error) throw new Error(`seed 帳本失敗：${error.message}`);
}

async function health() {
  const res = await app.request('/api/internal/scheduler-health', { headers });
  assertEquals(res.status, 200);
  return await res.json();
}

/** 把 JSON 攤成「路徑」集合：物件取鍵，陣列與純量是葉節點。 */
function keyPaths(v: unknown, prefix = ''): string[] {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v).flatMap(([k, child]) => [
      `${prefix}${k}`,
      ...keyPaths(child, `${prefix}${k}.`),
    ]);
  }
  return [];
}

Deno.test('scheduler-health：缺密鑰或密鑰錯誤 → 401', async () => {
  const none = await app.request('/api/internal/scheduler-health');
  assertEquals(none.status, 401);
  await none.body?.cancel();
  const wrong = await app.request('/api/internal/scheduler-health', {
    headers: { 'x-internal-secret': 'nope' },
  });
  assertEquals(wrong.status, 401);
  await wrong.body?.cancel();
});

Deno.test('scheduler-health：回應的鍵集合與 fixture shape.json 雙向一致', async () => {
  await resetLedger();
  const got = keyPaths(await health()).sort();
  const want = keyPaths(JSON.parse(await Deno.readTextFile(SHAPE))).sort();
  assertEquals(got, want);
});

Deno.test('scheduler-health：存活只看 pg_cron 完成列，vault_missing／exception 不算完成', async () => {
  await resetLedger();
  await seed([
    {
      job: 'reconcile',
      trigger: 'pg_cron',
      status: 'succeeded',
      started_at: ago(130),
      finished_at: ago(129),
    },
    // 業務失敗也算完成
    {
      job: 'reconcile',
      trigger: 'pg_cron',
      status: 'failed',
      error_code: 'query_all_failed',
      started_at: ago(70),
      finished_at: ago(69),
    },
    {
      job: 'reconcile',
      trigger: 'pg_cron',
      status: 'failed',
      error_code: 'exception',
      started_at: ago(40),
      finished_at: ago(39),
    },
    // GitHub 補跑：刷新 lastCompletedAt，但不得刷新 lastPgCronCompletedAt
    {
      job: 'reconcile',
      trigger: 'github',
      status: 'succeeded',
      started_at: ago(20),
      finished_at: ago(19),
    },
    {
      job: 'reconcile',
      trigger: 'pg_cron',
      status: 'skipped',
      error_code: 'vault_missing',
      started_at: ago(10),
      finished_at: ago(10),
    },
  ]);
  const r = (await health()).data.jobs.reconcile;
  assertEquals(r.lastCompletedTrigger, 'github');
  assertEquals(r.lastCompletedStatus, 'succeeded');
  assert(Math.abs(Date.parse(r.lastCompletedAt) - Date.parse(ago(19))) < 5_000);
  assert(Math.abs(Date.parse(r.lastPgCronCompletedAt) - Date.parse(ago(69))) < 5_000);
  assert(Math.abs(Date.parse(r.lastPgCronRowAt) - Date.parse(ago(10))) < 5_000);
  assertEquals(r.lastPgCronErrorCode, 'vault_missing');
  assertEquals(r.counts24h, { succeeded: 2, failed: 2, skipped: 1, abandoned: 0 });
  assertEquals(r.lastPurgeDryRun, null);
  await resetLedger();
});

Deno.test('scheduler-health：lastPurgeDryRun 取最近一筆帶 dryRun 的 pg_cron 清理列', async () => {
  await resetLedger();
  await seed([
    {
      job: 'purge-photos',
      trigger: 'pg_cron',
      status: 'succeeded',
      summary: { dryRun: false, removed: 2 },
      started_at: ago(1500),
      finished_at: ago(1499),
    },
    // 較新的 github dry-run 不算（只看 pg_cron）
    {
      job: 'purge-photos',
      trigger: 'github',
      status: 'succeeded',
      summary: { dryRun: true },
      started_at: ago(600),
      finished_at: ago(599),
    },
    // 較新的 pg_cron 失敗列沒有 dryRun，跳過
    {
      job: 'purge-photos',
      trigger: 'pg_cron',
      status: 'failed',
      error_code: 'circuit_open',
      summary: { reason: 'ratio' },
      started_at: ago(60),
      finished_at: ago(59),
    },
  ]);
  const p = (await health()).data.jobs['purge-photos'];
  assertEquals(p.lastPurgeDryRun, false);
  await resetLedger();
});

Deno.test('scheduler-health：沒有任何帳本列 → 時間欄位為 null、計數為 0', async () => {
  await resetLedger();
  const r = (await health()).data.jobs.reconcile;
  assertEquals(
    [r.lastCompletedAt, r.lastPgCronCompletedAt, r.lastPgCronRowAt, r.lastPgCronErrorCode],
    [null, null, null, null],
  );
  assertEquals(r.counts24h, { succeeded: 0, failed: 0, skipped: 0, abandoned: 0 });
});

Deno.test('scheduler-health：cronJobPresent／cronJobActive 反映 cron.job 的對帳排程列', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  const [before] = await sql`
    select schedule, command, active from cron.job where jobname = 'reconcile-pending-payments'`;
  try {
    if (!before) {
      await sql`select cron.schedule('reconcile-pending-payments', '7 * * * *', 'select 1')`;
    }
    await sql`
      select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'reconcile-pending-payments'),
                            active := false)`;
    const paused = (await health()).data.jobs.reconcile;
    assertEquals([paused.cronJobPresent, paused.cronJobActive], [true, false]);

    await sql`select cron.unschedule('reconcile-pending-payments')`;
    const gone = (await health()).data.jobs.reconcile;
    assertEquals([gone.cronJobPresent, gone.cronJobActive], [false, false]);
  } finally {
    // 還原：測試前沒有排程就確保刪掉（中途失敗也不留殘列）；有就照原樣補回
    // （階段 8 的 migration 會建立它）。
    await sql`
      select cron.unschedule(jobid) from cron.job where jobname = 'reconcile-pending-payments'`;
    if (before) {
      await sql`select cron.schedule('reconcile-pending-payments', ${before.schedule}, ${before.command})`;
      await sql`
        select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'reconcile-pending-payments'),
                              active := ${before.active})`;
    }
    await sql.end();
  }
});

Deno.test('scheduler-health：回應不含帳本明細（summary、id）', async () => {
  await resetLedger();
  await seed([{
    job: 'reconcile',
    trigger: 'pg_cron',
    status: 'succeeded',
    summary: { secret: 'x' },
    started_at: ago(5),
    finished_at: ago(4),
  }]);
  const text = JSON.stringify(await health());
  assertEquals(text.includes('summary'), false);
  assertEquals(text.includes('secret'), false);
  await resetLedger();
});

// ------------------------------------------------------------
// 第 6 波 S1（R5 P2-8；W6-11）：heal 連續出問題的輪數，只看 pg_cron 完成列；
// amountMismatch 不計（金額不符的單會永遠 pending）；遇到沒有 heal 鍵的舊列就停。
// ------------------------------------------------------------
type Heal = Partial<{
  failed: number;
  error: boolean;
  skippedLocked: number;
  amountMismatch: number;
  truncated: boolean;
}>;

function reconcileRow(minutesAgo: number, heal: Heal | null, over: Record<string, unknown> = {}) {
  return {
    job: 'reconcile',
    trigger: 'pg_cron',
    status: 'succeeded',
    summary: heal === null ? { checked: 0 } : {
      checked: 0,
      heal: {
        candidates: 1,
        completed: 0,
        failed: 0,
        skippedLocked: 0,
        amountMismatch: 0,
        truncated: false,
        error: false,
        ...heal,
      },
    },
    started_at: ago(minutesAgo),
    finished_at: ago(minutesAgo - 1),
    ...over,
  };
}

Deno.test('scheduler-health：heal 連續失敗三輪 → healFailedStreak＝3，github 與 vault_missing 列不計', async () => {
  await resetLedger();
  await seed([
    reconcileRow(300, null), // 本案上線前的舊列
    reconcileRow(180, { failed: 1 }),
    reconcileRow(120, { error: true }),
    reconcileRow(60, { truncated: true }),
    reconcileRow(40, { failed: 0 }, { trigger: 'github' }),
    reconcileRow(20, null, {
      status: 'skipped',
      error_code: 'vault_missing',
      summary: null,
      finished_at: ago(20),
    }),
  ]);
  const r = (await health()).data.jobs.reconcile;
  assertEquals(r.healFailedStreak, 3);
  assertEquals(r.healSkippedStreak, 0);
  await resetLedger();
});

Deno.test('scheduler-health：最新一輪 heal 乾淨 → streak 歸零；中間乾淨只數到乾淨那輪為止', async () => {
  await resetLedger();
  await seed([
    reconcileRow(180, { failed: 1 }),
    reconcileRow(120, { failed: 2 }),
    reconcileRow(60, {}),
  ]);
  assertEquals((await health()).data.jobs.reconcile.healFailedStreak, 0);
  await resetLedger();
  await seed([
    reconcileRow(180, { failed: 1 }),
    reconcileRow(120, {}),
    reconcileRow(60, { failed: 1 }),
  ]);
  assertEquals((await health()).data.jobs.reconcile.healFailedStreak, 1);
  await resetLedger();
});

Deno.test('scheduler-health：只有金額不符不算 heal 失敗；換線鎖連續跳過另計 healSkippedStreak', async () => {
  await resetLedger();
  await seed([
    reconcileRow(180, { amountMismatch: 3, skippedLocked: 1 }),
    reconcileRow(120, { amountMismatch: 3, skippedLocked: 2 }),
  ]);
  const r = (await health()).data.jobs.reconcile;
  assertEquals({ failed: r.healFailedStreak, skipped: r.healSkippedStreak }, {
    failed: 0,
    skipped: 2,
  });
  await resetLedger();
});

Deno.test('scheduler-health：遇到沒有 heal 鍵的舊列就停；purge-photos 的兩鍵為 null', async () => {
  await resetLedger();
  await seed([
    reconcileRow(240, { failed: 1 }),
    reconcileRow(180, null),
    reconcileRow(60, { failed: 1 }),
  ]);
  const jobs = (await health()).data.jobs;
  assertEquals(jobs.reconcile.healFailedStreak, 1);
  assertEquals(jobs['purge-photos'].healFailedStreak, null);
  assertEquals(jobs['purge-photos'].healSkippedStreak, null);
  await resetLedger();
});
