// ============================================================
// scheduled_job_runs 帳本與租約（migration 20261112000001）：
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

// ------------------------------------------------------------
// 階段 8：invoke_internal_endpoint、prune、pause／resume 與三個 cron 排程。
// Vault 兩筆由人在各環境 SQL Editor 建，不進 migration；缺值時 invoke 寫一列
// skipped／vault_missing 而不送請求，看門狗才看得到「排程有跑、但沒設定」。
// ------------------------------------------------------------
const VAULT_NAMES = ['uknow_api_base_url', 'uknow_internal_secret'];

async function clearVault(sql: ReturnType<typeof postgres>) {
  await sql`delete from vault.secrets where name = any(${VAULT_NAMES})`;
}

Deno.test('invoke_internal_endpoint：Vault 缺值 → 回 null、不送請求、寫 skipped／vault_missing', async () => {
  await resetLedger();
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await clearVault(sql);
    const [{ before }] = await sql`select count(*)::int as before from net.http_request_queue`;
    const [{ id }] = await sql`select public.invoke_internal_endpoint('reconcile') as id`;
    assertEquals(id, null);
    const [{ after }] = await sql`select count(*)::int as after from net.http_request_queue`;
    assertEquals(after, before);
    const { data } = await adminClient().from('scheduled_job_runs')
      .select('job, trigger, status, error_code').eq('job', 'reconcile');
    assertEquals(data, [{
      job: 'reconcile',
      trigger: 'pg_cron',
      status: 'skipped',
      error_code: 'vault_missing',
    }]);
  } finally {
    await sql.end();
    await resetLedger();
  }
});

Deno.test('invoke_internal_endpoint：Vault 有值 → 對白名單路徑送出帶 trigger 與密鑰的 POST', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await clearVault(sql);
    await sql`select vault.create_secret('http://127.0.0.1:9/functions/v1/api/', 'uknow_api_base_url')`;
    await sql`select vault.create_secret('invoke-test-secret', 'uknow_internal_secret')`;
    // 在同一個交易裡看佇列：交易未 commit 前 pg_net 的 worker 看不到這一列。
    const queued = await sql.begin(async (tx) => {
      const [{ id }] = await tx`select public.invoke_internal_endpoint('purge-photos') as id`;
      assert(id !== null, '應回傳 pg_net 的 request id');
      const [row] = await tx`
        select url, method, headers, convert_from(body, 'utf8') as body
          from net.http_request_queue where id = ${id}`;
      return row;
    });
    assertEquals(
      queued.url,
      'http://127.0.0.1:9/functions/v1/api/internal/purge-orphan-listing-photos',
    );
    assertEquals(queued.method, 'POST');
    assertEquals(queued.headers['x-internal-secret'], 'invoke-test-secret');
    assertEquals(JSON.parse(queued.body), { trigger: 'pg_cron' });
  } finally {
    await clearVault(sql);
    await sql.end();
  }
});

Deno.test('invoke_internal_endpoint：白名單外的 job 名 → 擲錯', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    let threw = false;
    try {
      await sql`select public.invoke_internal_endpoint('https://evil.example/x')`;
    } catch {
      threw = true;
    }
    assert(threw, '未知 job 必須擲錯，不得送出任意 URL');
  } finally {
    await sql.end();
  }
});

// 第 6 波 S1（R5 P2-9）：人工在 SQL Editor 驗證時帶 'manual'，帳本不冒充 pg_cron。
Deno.test("invoke_internal_endpoint：帶 'manual' → 請求 body 與 vault_missing 列都記 manual", async () => {
  await resetLedger();
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await clearVault(sql);
    await sql`select public.invoke_internal_endpoint('reconcile', 'manual')`;
    const { data } = await adminClient().from('scheduled_job_runs')
      .select('trigger, error_code').eq('job', 'reconcile');
    assertEquals(data, [{ trigger: 'manual', error_code: 'vault_missing' }]);

    await sql`select vault.create_secret('http://127.0.0.1:9/functions/v1/api/', 'uknow_api_base_url')`;
    await sql`select vault.create_secret('invoke-test-secret', 'uknow_internal_secret')`;
    const body = await sql.begin(async (tx) => {
      const [{ id }] =
        await tx`select public.invoke_internal_endpoint('reconcile', 'manual') as id`;
      const [row] = await tx`
        select convert_from(body, 'utf8') as body from net.http_request_queue where id = ${id}`;
      return JSON.parse(row.body);
    });
    assertEquals(body, { trigger: 'manual' });
  } finally {
    await clearVault(sql);
    await sql.end();
    await resetLedger();
  }
});

Deno.test('invoke_internal_endpoint：trigger 只收 pg_cron／manual，其他值擲錯', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    let threw = false;
    try {
      await sql`select public.invoke_internal_endpoint('reconcile', 'github')`;
    } catch {
      threw = true;
    }
    assert(threw, 'github 補跑走 GitHub Actions，不經這支函式');
  } finally {
    await sql.end();
  }
});

Deno.test('invoke_internal_endpoint：只剩一個多載，cron 指令的單參數呼叫不歧義', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql`
      select pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'invoke_internal_endpoint'`;
    assertEquals(rows.map((r) => r.args), ['p_job text, p_trigger text']);
  } finally {
    await sql.end();
  }
});

Deno.test('cron.job：對帳、照片清理、帳本清理三個排程的時間與指令', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql`
      select jobname, schedule, command from cron.job
       where jobname in ('reconcile-pending-payments', 'purge-orphan-listing-photos', 'prune-scheduled-job-runs')
       order by jobname`;
    assertEquals(rows.map((r) => ({ ...r })), [
      {
        jobname: 'prune-scheduled-job-runs',
        schedule: '41 4 * * *',
        command: 'select public.prune_scheduled_job_runs()',
      },
      {
        jobname: 'purge-orphan-listing-photos',
        schedule: '17 19 * * *',
        command: "select public.invoke_internal_endpoint('purge-photos')",
      },
      {
        jobname: 'reconcile-pending-payments',
        schedule: '7 * * * *',
        command: "select public.invoke_internal_endpoint('reconcile')",
      },
    ]);
  } finally {
    await sql.end();
  }
});

Deno.test('prune_scheduled_job_runs：只刪 90 天前的帳本列', async () => {
  await resetLedger();
  const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
  const recent = new Date(Date.now() - 89 * 86_400_000).toISOString();
  await adminClient().from('scheduled_job_runs').insert([
    { job: 'reconcile', trigger: 'pg_cron', status: 'succeeded', started_at: old },
    { job: 'reconcile', trigger: 'pg_cron', status: 'succeeded', started_at: recent },
  ]);
  const { data, error } = await adminClient().rpc('prune_scheduled_job_runs');
  assertEquals(error, null);
  assertEquals(data, 1);
  const { data: left } = await adminClient().from('scheduled_job_runs').select('started_at');
  assertEquals(left?.length, 1);
  await resetLedger();
});

Deno.test('pause／resume_scheduled_jobs：只切 active，排程列保留', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  const names = ['reconcile-pending-payments', 'purge-orphan-listing-photos'];
  try {
    await sql`select public.pause_scheduled_jobs()`;
    const paused = await sql`
      select jobname, active from cron.job where jobname = any(${names}) order by jobname`;
    assertEquals(paused.map((r) => [r.jobname, r.active]), [
      ['purge-orphan-listing-photos', false],
      ['reconcile-pending-payments', false],
    ]);
    await sql`select public.resume_scheduled_jobs()`;
    const resumed = await sql`
      select jobname, active from cron.job where jobname = any(${names}) order by jobname`;
    assertEquals(resumed.map((r) => r.active), [true, true]);
  } finally {
    await sql`select public.resume_scheduled_jobs()`.catch(() => {});
    await sql.end();
  }
});

// W5-31（業主 2026-11-05 04:00 互動選項「接受平台預設」）：pg_net 裝好後
// anon／authenticated 在 SQL 層有 net 的權限，postgres 角色收不回（擁有者是
// supabase_admin）。防線改成三條：REST 碰不到 net、本案函式已 revoke、vault 不可讀。
Deno.test('W5-31 權限：PostgREST 不暴露 net schema', async () => {
  const url = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const res = await fetch(`${url}/rest/v1/http_request_queue?select=id`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': 'net' },
  });
  const body = await res.json();
  assertEquals(res.status, 406);
  assertEquals(body.code, 'PGRST106');
});

Deno.test('W5-31 權限：anon／authenticated 不可 EXECUTE 排程函式、對 vault 沒有 USAGE', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (const role of ['anon', 'authenticated']) {
      const [r] = await sql`
        select
          has_function_privilege(${role}, 'public.invoke_internal_endpoint(text, text)', 'execute') as invoke,
          has_function_privilege(${role}, 'public.prune_scheduled_job_runs(integer)', 'execute') as prune,
          has_function_privilege(${role}, 'public.pause_scheduled_jobs()', 'execute') as pause,
          has_function_privilege(${role}, 'public.resume_scheduled_jobs()', 'execute') as resume,
          has_function_privilege(${role}, 'public.scheduler_health()', 'execute') as health,
          has_schema_privilege(${role}, 'vault', 'usage') as vault`;
      assertEquals(
        { ...r },
        { invoke: false, prune: false, pause: false, resume: false, health: false, vault: false },
        `${role} 權限`,
      );
    }
  } finally {
    await sql.end();
  }
});
