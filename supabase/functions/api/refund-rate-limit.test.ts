// ============================================================
// refund_rate_limit（migration 20261025000012）：把本請求 bump 過的計數退回一格。
//
// Email 邀請在「信沒寄出」時要把推薦人自己的額度退回（業主裁決 A）；既有
// bump_rate_limit 只增不減。用 delete 整列不行——全站鍵的列記著所有人的計數，
// 刪列等於歸零。所以是原子的 count - 1，且 count > 0 守住不為負（窗口已翻轉時
// 退到新窗口的計數，少算一次，接受）。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient } from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function countOf(key: string): Promise<number | null> {
  const { data } = await adminClient().from('rate_limits').select('count').eq('key', key);
  return data?.[0]?.count ?? null;
}

Deno.test('refund_rate_limit：計數退一格，窗口起點不動', async () => {
  const client = adminClient();
  const key = `test:refund:${crypto.randomUUID()}`;
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  try {
    await client.from('rate_limits').insert({ key, count: 3, window_start: windowStart });
    const { error } = await client.rpc('refund_rate_limit', { p_key: key });
    assertEquals(error, null);
    const { data } = await client.from('rate_limits').select('count, window_start').eq('key', key);
    assertEquals(data?.[0]?.count, 2);
    assertEquals(new Date(data![0].window_start).toISOString(), windowStart);
  } finally {
    await client.from('rate_limits').delete().eq('key', key);
  }
});

Deno.test('refund_rate_limit：bump 一次再退一次 → 同一窗口內額度回來', async () => {
  const client = adminClient();
  const key = `test:refund:${crypto.randomUUID()}`;
  try {
    const bump = () =>
      client.rpc('bump_rate_limit', { p_key: key, p_max: 1, p_window_seconds: 300 });
    assertEquals((await bump()).data, true);
    assertEquals((await bump()).data, false, '第二次超額');
    await client.rpc('refund_rate_limit', { p_key: key }); // 退掉超額那次
    await client.rpc('refund_rate_limit', { p_key: key }); // 退掉第一次
    assertEquals((await bump()).data, true, '兩次都退回後應再放行');
  } finally {
    await client.from('rate_limits').delete().eq('key', key);
  }
});

Deno.test('refund_rate_limit：計數已是 0 → 不變成負數', async () => {
  const client = adminClient();
  const key = `test:refund:${crypto.randomUUID()}`;
  try {
    await client.from('rate_limits').insert({ key, count: 0 });
    const { error } = await client.rpc('refund_rate_limit', { p_key: key });
    assertEquals(error, null);
    assertEquals(await countOf(key), 0);
  } finally {
    await client.from('rate_limits').delete().eq('key', key);
  }
});

Deno.test('refund_rate_limit：key 不存在 → 不報錯、也不新建列', async () => {
  const client = adminClient();
  const key = `test:refund:${crypto.randomUUID()}`;
  const { error } = await client.rpc('refund_rate_limit', { p_key: key });
  assertEquals(error, null);
  assertEquals(await countOf(key), null);
});

Deno.test('refund_rate_limit：anon、authenticated 不能執行，只給 service_role', async () => {
  // 對外開放等於讓任何人替自己（或全站）把限流額度退回去
  const sql = postgres(DB_URL);
  try {
    const fn = 'public.refund_rate_limit(text)';
    const [row] = await sql<{ anon: boolean; authed: boolean; service: boolean }[]>`
      select
        has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
        has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authed,
        has_function_privilege('service_role', ${fn}, 'EXECUTE') as service
    `;
    assertEquals(row.anon, false);
    assertEquals(row.authed, false);
    assertEquals(row.service, true);
  } finally {
    await sql.end();
  }
});
