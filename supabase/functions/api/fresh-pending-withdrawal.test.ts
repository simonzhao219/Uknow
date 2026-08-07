// ============================================================
// A16（renewal-backfill 階段 6）：存在審核中（status='pending'）提領時
// 擋下 fresh 建單（400，訊息含「等待審核」）；extend 不受影響。
//
// 只擋 pending：awaiting_collection 依提領狀態機不可再轉 rejected
// （錢已核准匯出），不存在「退款落進已清空帳本」的風險，不擋。
// 提領轉 completed / rejected 後 fresh 恢復可用。
// 守衛與 /subscriptions/status 的 hasPendingWithdrawal（階段 8）共用
// 同一 helper——不得複用 reward_balances.pending（那涵蓋
// awaiting_collection，集合不同）。
// ============================================================
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
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

async function expireSubscriptions(
  client: ReturnType<typeof adminClient>,
  userId: string,
  endDaysAgo: number,
) {
  const end = new Date(Date.now() - endDaysAgo * 86400_000).toISOString();
  const { error } = await client
    .from('subscriptions')
    .update({ end_date: end, grace_period_end: end })
    .eq('user_id', userId);
  if (error) throw new Error(`expireSubscriptions failed: ${error.message}`);
}

async function postPrepare(token: string, body: Record<string, unknown>) {
  const res = await app.request('/api/payuni/prepare', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** 直接塞一筆指定狀態的提領單（守衛只看存在性，不必走 request_withdrawal）。 */
async function insertWithdrawal(
  client: ReturnType<typeof adminClient>,
  userId: string,
  status: string,
): Promise<string> {
  const { data, error } = await client
    .from('withdrawals')
    .insert({ user_id: userId, amount: 1000, status, bank_code: '812', bank_account: '123' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insertWithdrawal failed: ${error?.message}`);
  return data.id;
}

Deno.test('prepare：有 pending 提領時 fresh 被擋 400、extend 照常建單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'A16 Pending' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expireSubscriptions(client, user.id, 90);
    await insertWithdrawal(client, user.id, 'pending');

    const token = await getUserAccessToken(client, user.email);

    const freshRes = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(freshRes.status, 400, JSON.stringify(freshRes.body));
    assertStringIncludes(freshRes.body.error ?? '', '等待審核');

    // extend 不受影響——A16 只擋會清空帳本的 fresh。
    const extendRes = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(extendRes.body.success, true, JSON.stringify(extendRes.body));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：僅 awaiting_collection 提領不擋 fresh', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'A16 Awaiting' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expireSubscriptions(client, user.id, 90);
    // 狀態機上 awaiting_collection 不可再轉 rejected，錢已核准匯出，
    // 沒有「退款落進已清空帳本」的風險。
    await insertWithdrawal(client, user.id, 'awaiting_collection');

    const token = await getUserAccessToken(client, user.email);
    const res = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(res.body.success, true, JSON.stringify(res.body));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：提領轉 completed 或 rejected 後 fresh 恢復可建單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'A16 Resolved' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expireSubscriptions(client, user.id, 90);
    const wid = await insertWithdrawal(client, user.id, 'pending');

    const token = await getUserAccessToken(client, user.email);
    const blocked = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(blocked.status, 400);

    const { error: doneErr } = await client
      .from('withdrawals').update({ status: 'completed' }).eq('id', wid);
    assertEquals(doneErr, null);
    const afterDone = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(afterDone.body.success, true, JSON.stringify(afterDone.body));

    // 再造一筆 pending → 擋；轉 rejected → 恢復。
    const wid2 = await insertWithdrawal(client, user.id, 'pending');
    const blocked2 = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(blocked2.status, 400);
    const { error: rejErr } = await client
      .from('withdrawals').update({ status: 'rejected' }).eq('id', wid2);
    assertEquals(rejErr, null);
    const afterRej = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(afterRej.body.success, true, JSON.stringify(afterRej.body));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
