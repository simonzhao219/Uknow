// ============================================================
// buildProfileResponse 的自癒行為（生產事故重播測試）。
//
// 事故形狀：訂單 pending 但 payuni_response 已存 SUCCESS（訂單
// 202607160740314QE7）。使用者每次載入 profile 都拿到
// registrationStep=2，被前端守衛永久困在付款結果頁。
// 修復後：同一次 profile 載入就要自癒完成，直接回 step 3——使用者
// 什麼都不用做，登入即痊癒。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers, ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
const { buildProfileResponse } = await import('./index.ts');

let seq = 0;

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  payuniResponse: Record<string, unknown> | null,
  createdAt?: string,
) {
  const tradeNo = `PROFILE-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId, amount: 1200, status: 'pending', payment_method: 'payuni',
    transaction_id: tradeNo, payuni_response: payuniResponse,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (error) throw new Error(`seedPendingOrder failed: ${error.message}`);
  return tradeNo;
}

const success = (tradeAmt = '1200') => ({ Status: 'SUCCESS', TradeAmt: tradeAmt, TradeNo: 'PU-X' });

Deno.test('生產事故重播：卡單使用者載入 profile 的「同一個回應」就是 step 3 + active', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Trapped User' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id, success());

    const profile = await buildProfileResponse(client, user.id, user.email);

    assertEquals(profile?.registrationStep, 3, '自癒後同一個回應就該是 step 3');
    assertEquals(profile?.paidAwaitingActivation, false);
    assertEquals(profile?.accountStatus, 'active');
    assertEquals(profile?.lastTradeNo, null);

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'completed');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('自癒收斂不了（金額不符）：step 2 + paidAwaitingActivation=true，前端顯示開通處理中', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Mismatch Profile' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id, success('9999'));

    const profile = await buildProfileResponse(client, user.id, user.email);

    assertEquals(profile?.registrationStep, 2);
    assertEquals(profile?.paidAwaitingActivation, true, '已付款但收斂不了，要讓前端知道不是「沒付錢」');
    assertEquals(profile?.lastTradeNo, tradeNo);

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('一般 pending（還沒收到 PayUni 回應）：step 2、不觸發自癒、旗標為 false', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Plain Pending' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id, null);

    const profile = await buildProfileResponse(client, user.id, user.email);

    assertEquals(profile?.registrationStep, 2);
    assertEquals(profile?.paidAwaitingActivation, false);
    assertEquals(profile?.lastTradeNo, tradeNo);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('多筆 pending：只有較舊那筆有 SUCCESS 存檔，也要能自癒（不能只看最新一筆）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Retried Payer' });

  try {
    // 較舊：卡單（有 SUCCESS 存檔）；較新：使用者重試付款留下的空 pending。
    const stuckTradeNo = await seedPendingOrder(
      client, user.id, success(), new Date(Date.now() - 3600_000).toISOString(),
    );
    await seedPendingOrder(client, user.id, null);

    const profile = await buildProfileResponse(client, user.id, user.email);

    assertEquals(profile?.registrationStep, 3, '舊那筆卡單該被自癒，step 轉 3');

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', stuckTradeNo).single();
    assertEquals(order?.status, 'completed');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('待開通時 lastTradeNo 指向已付款成功的那筆訂單，不是最新的 pending', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'LastTradeNo Priority' });

  try {
    // 較舊：金額不符的卡單（自癒收斂不了，但確實付過款）；
    // 較新：重試留下的空 pending。守衛要導去的是「付款成功那筆」的結果頁。
    const paidTradeNo = await seedPendingOrder(
      client, user.id, success('9999'), new Date(Date.now() - 3600_000).toISOString(),
    );
    await seedPendingOrder(client, user.id, null);

    const profile = await buildProfileResponse(client, user.id, user.email);

    assertEquals(profile?.registrationStep, 2);
    assertEquals(profile?.paidAwaitingActivation, true);
    assertEquals(profile?.lastTradeNo, paidTradeNo, 'lastTradeNo 該指向帶 SUCCESS 的訂單');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
