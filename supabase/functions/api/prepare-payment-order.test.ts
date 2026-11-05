// ============================================================
// prepare_payment_order：/payuni/prepare 的建單 RPC（第 5 波 S2 階段 5；pay P1-2、W5-5）。
//
// 在 profiles 列鎖下重查停權與 active 後才 INSERT 訂單——與付款完成
// （process_successful_payment：order → profiles）序列化：付款交易持鎖期間送出的
// 建單會等它 commit，拿到鎖時讀到 active → 拒絕，不會再多出一張可付的單。
// 回傳：ok｜not_found｜suspended｜active｜duplicate_trade_no。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Client = ReturnType<typeof adminClient>;

async function callRpc(client: Client, userId: string, tradeNo: string, mode: string | null) {
  return await client.rpc('prepare_payment_order', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_renewal_mode: mode,
  });
}

async function orders(client: Client, userId: string) {
  const { data } = await client.from('payment_orders')
    .select('transaction_id, amount, status, payment_method, renewal_mode')
    .eq('user_id', userId);
  return data ?? [];
}

Deno.test('prepare_payment_order：可付款者 → ok 並建一張 pending 訂單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'PPO Ok' });
  try {
    const tradeNo = `PPO-OK-${user.id}`;
    const { data, error } = await callRpc(client, user.id, tradeNo, null);
    assertEquals(error, null);
    assertEquals(data, 'ok');
    assertEquals(await orders(client, user.id), [
      {
        transaction_id: tradeNo,
        amount: 1200,
        status: 'pending',
        payment_method: 'payuni',
        renewal_mode: null,
      },
    ]);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare_payment_order：查無 profile → not_found', async () => {
  const client = adminClient();
  const { data, error } = await callRpc(client, crypto.randomUUID(), `PPO-NF-${Date.now()}`, null);
  assertEquals(error, null);
  assertEquals(data, 'not_found');
});

Deno.test('prepare_payment_order：停權 → suspended，不建單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'PPO Suspended' });
  try {
    await client.from('profiles').update({ suspended_at: new Date().toISOString() })
      .eq('id', user.id);
    const { data } = await callRpc(client, user.id, `PPO-S-${user.id}`, null);
    assertEquals(data, 'suspended');
    assertEquals((await orders(client, user.id)).length, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare_payment_order：會籍有效 → active，不建單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'PPO Active' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    const before = (await orders(client, user.id)).length;
    const { data } = await callRpc(client, user.id, `PPO-A-${user.id}`, null);
    assertEquals(data, 'active');
    assertEquals((await orders(client, user.id)).length, before);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare_payment_order：tradeNo 撞號 → duplicate_trade_no，不擲錯', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'PPO Dup' });
  try {
    const tradeNo = `PPO-D-${user.id}`;
    assertEquals((await callRpc(client, user.id, tradeNo, null)).data, 'ok');
    const { data, error } = await callRpc(client, user.id, tradeNo, null);
    assertEquals(error, null);
    assertEquals(data, 'duplicate_trade_no');
    assertEquals((await orders(client, user.id)).length, 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('payuni/prepare：RPC 回 duplicate_trade_no 時重產 tradeNo 再試一次 → 200', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'PPO Edge Retry' });
  const original = globalThis.fetch;
  let rpcCalls = 0;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (/\/rest\/v1\/rpc\/prepare_payment_order(\?|$)/.test(url)) {
      rpcCalls++;
      if (rpcCalls === 1) {
        return Promise.resolve(
          // S6 起 /payuni/prepare 呼叫六參數版，回 jsonb { outcome }。
          new Response(JSON.stringify({ outcome: 'duplicate_trade_no' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
    }
    return original(input, init);
  }) as typeof fetch;
  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/payuni/prepare', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    assertEquals(res.status, 200, await res.clone().text());
    assertEquals(rpcCalls, 2);
    assertEquals((await orders(client, user.id)).length, 1);
  } finally {
    globalThis.fetch = original;
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare_payment_order：付款交易持鎖期間建單 → 等 commit 後回 active，不多建單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'PPO Interleave' });
  const sql1 = postgres(DB_URL, { max: 1 });
  const sql2 = postgres(DB_URL, { max: 1 });
  try {
    const tradeNo = `PPO-I-${user.id}`;
    assertEquals(
      (await client.from('payment_orders').insert({
        user_id: user.id,
        amount: 1200,
        status: 'pending',
        payment_method: 'payuni',
        transaction_id: tradeNo,
      })).error,
      null,
    );
    const success = JSON.stringify({ Status: 'SUCCESS' });
    let prepared: Promise<{ r: string }[]> | null = null;
    await sql1.begin(async (tx) => {
      await tx`select process_successful_payment(${user.id}::uuid, ${tradeNo}, ${tradeNo}, ${success}::jsonb)`;
      // 付款已寫入、尚未 commit：此時建第二張單。
      prepared = sql2<{ r: string }[]>`
        select prepare_payment_order(${user.id}::uuid, ${`PPO-I2-${user.id}`}, null) as r`
        .execute();
      await new Promise((r) => setTimeout(r, 500));
    });
    const rows = await prepared!;
    assertEquals(rows[0].r, 'active');
    assertEquals((await orders(client, user.id)).length, 1);
  } finally {
    await sql1.end();
    await sql2.end();
    await deleteTestUsers(client, [user.id]);
  }
});
