// ============================================================
// W6-36／W7-2：正控的資料庫側（migration 20261124000001 的
// payuni_query_controls 與 positiveControlDbDeps 的挑單口徑）。
// 判讀與 36 小時窗的純邏輯在 payuni-positive-control.unit.test.ts。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';
import { positiveControlDbDeps } from './payuni-positive-control.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function resetControls() {
  await adminClient().from('payuni_query_controls').delete().gte('id', 0);
}

async function seedOrder(
  userId: string,
  tradeNo: string,
  fields: Record<string, unknown>,
) {
  const { error } = await adminClient().from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    payment_method: 'payuni',
    transaction_id: tradeNo,
    ...fields,
  });
  if (error) throw new Error(`seed payment_orders failed: ${error.message}`);
}

Deno.test('payuni_query_controls：寫入後 latest 讀回最近一次的時間與結果', async () => {
  await resetControls();
  const deps = positiveControlDbDeps(adminClient);
  await deps.record({
    checkedAt: '2026-11-20T00:00:00.000Z',
    outcome: 'success',
    tradeNo: 'CTRL-OLD',
    reason: null,
  });
  await deps.record({
    checkedAt: '2026-11-21T00:00:00.000Z',
    outcome: 'failed',
    tradeNo: 'CTRL-NEW',
    reason: 'query_status:QUERY03001',
  });
  const latest = await deps.latest();
  assertEquals(latest?.outcome, 'failed');
  assertEquals(new Date(latest!.checkedAt).toISOString(), '2026-11-21T00:00:00.000Z');
  await resetControls();
});

Deno.test('payuni_query_controls：沒有任何紀錄 → latest 回 null', async () => {
  await resetControls();
  assertEquals(await positiveControlDbDeps(adminClient).latest(), null);
});

Deno.test('payuni_query_controls：outcome 只收 success／failed／no_sample', async () => {
  const { error } = await adminClient().from('payuni_query_controls')
    .insert({ outcome: 'maybe', checked_at: new Date().toISOString() });
  assert(error, '應被 check constraint 擋下');
});

Deno.test('payuni_query_controls：RLS 開啟、anon／authenticated 無任何表權限', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const [row] = await sql<{ rls: boolean; anon: boolean; authed: boolean }[]>`
      select c.relrowsecurity as rls,
             has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon,
             has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authed
        from pg_class c
       where c.oid = 'public.payuni_query_controls'::regclass`;
    assertEquals(row, { rls: true, anon: false, authed: false });
  } finally {
    await sql.end();
  }
});

Deno.test('正控挑單：取最近 completed 且存有 PayUni SUCCESS 的單，略過 pending 與無存檔的單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Control Sample' });
  const stamp = Date.now();
  const far = new Date(stamp + 365 * 86_400_000); // 比其他測試的單都新，免得互相干擾
  const iso = (offsetMin: number) => new Date(far.getTime() + offsetMin * 60_000).toISOString();
  try {
    await seedOrder(user.id, `CTRL-A-${stamp}`, {
      status: 'completed',
      completed_at: iso(0),
      payuni_response: { Status: 'SUCCESS', MerTradeNo: `CTRL-A-${stamp}` },
    });
    await seedOrder(user.id, `CTRL-B-${stamp}`, {
      status: 'completed',
      completed_at: iso(5), // 較新但沒有 PayUni 存檔（例如人工開通）→ 不算
    });
    await seedOrder(user.id, `CTRL-C-${stamp}`, {
      status: 'pending',
      created_at: iso(10),
      payuni_response: { Status: 'SUCCESS', MerTradeNo: `CTRL-C-${stamp}` },
    });
    assertEquals(await positiveControlDbDeps(adminClient).pickSample(), `CTRL-A-${stamp}`);
  } finally {
    await client.from('payment_orders').delete().like('transaction_id', `CTRL-%-${stamp}`);
    await deleteTestUsers(client, [user.id]);
  }
});
