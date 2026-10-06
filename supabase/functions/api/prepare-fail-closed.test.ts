// ============================================================
// /payuni/prepare 的建單前守衛：讀不到就不建單（fail-closed）。
//
// 守衛有兩道讀取會在暫時性錯誤時把系統故障說成業務結論：
//   * 「已有有效訂閱」防重複讀 user_account_status——先前 .single() 不看
//     error，失敗即當「非 active」放行，有效會員可再付一次（付款成功必建
//     新訂閱；fresh 還會清空帳本、上線鏈再得獎勵）。
//   * extend 讀最後一筆 subscriptions——先前失敗回 400「沒有可接續的訂閱
//     紀錄，請選擇新約」，把故障說成業務拒絕，還把人導向會清空帳本的新約。
// 兩者都必須在任何寫入前回 500 JSON（與 A16 提領守衛同一文案）。
// ============================================================
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
  withRestTableFailure,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

async function postPrepare(token: string, body?: Record<string, unknown>) {
  const res = await app.request('/api/payuni/prepare', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

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

async function pendingOrderCount(client: ReturnType<typeof adminClient>, userId: string) {
  const { count, error } = await client.from('payment_orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'pending');
  if (error) throw new Error(`pendingOrderCount failed: ${error.message}`);
  return count;
}

Deno.test('prepare：有效會員再建單被擋 400，不建待付款訂單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Prepare Active' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    const token = await getUserAccessToken(client, user.email);

    const res = await postPrepare(token);
    assertEquals(res.status, 400, JSON.stringify(res.body));
    assertStringIncludes(res.body.error ?? '', '已有有效訂閱');
    assertEquals(await pendingOrderCount(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：user_account_status 查詢失敗 → 500 且不建單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Prepare Acct Fail' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    const token = await getUserAccessToken(client, user.email);

    const res = await withRestTableFailure(['user_account_status'], () => postPrepare(token));
    assertEquals(res.status, 500, JSON.stringify(res.body));
    assertEquals(res.body.success, false);
    assertEquals(await pendingOrderCount(client, user.id), 0, '讀不到會籍就不得建單');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：extend 讀 subscriptions 失敗 → 500，不得回 400 導去新約', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Prepare LastSub Fail' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expireSubscriptions(client, user.id, 90);
    const token = await getUserAccessToken(client, user.email);

    const res = await withRestTableFailure(
      ['subscriptions'],
      () => postPrepare(token, { renewalMode: 'extend' }),
    );
    assertEquals(res.status, 500, JSON.stringify(res.body));
    assertEquals(res.body.success, false);
    assertEquals(await pendingOrderCount(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
