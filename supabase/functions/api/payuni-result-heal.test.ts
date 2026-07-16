// ============================================================
// GET /payuni/result/:tradeNo 的自癒行為：使用者停在付款結果頁輪詢時，
// 若訂單是「pending + SUCCESS 存檔」的卡單，這一次輪詢就要當場補完並
// 回傳 completed——不用等使用者重新整理或下一輪排程。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
const { app } = await import('./index.ts');

let seq = 0;

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  payuniResponse: Record<string, unknown> | null,
) {
  const tradeNo = `RESULT-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId, amount: 1200, status: 'pending', payment_method: 'payuni',
    transaction_id: tradeNo, payuni_response: payuniResponse,
  });
  if (error) throw new Error(`seedPendingOrder failed: ${error.message}`);
  return tradeNo;
}

async function getResult(token: string, tradeNo: string) {
  const res = await app.request(`/api/payuni/result/${tradeNo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

Deno.test('卡單使用者輪詢結果頁：同一次請求就回 completed（當場自癒）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Result Heal' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const tradeNo = await seedPendingOrder(client, user.id, {
      Status: 'SUCCESS', TradeAmt: '1200', TradeNo: 'PU-RESULT',
    });

    const { status, body } = await getResult(token, tradeNo);

    assertEquals(status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.orderStatus, 'completed', '同一次輪詢就該拿到 completed');
    assertEquals(body.data.paidAwaitingActivation, false);

    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', user.id);
    assertEquals(subs?.length, 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('金額不符的卡單：維持 pending，但 paidAwaitingActivation=true（前端顯示開通處理中）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Result Mismatch' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const tradeNo = await seedPendingOrder(client, user.id, {
      Status: 'SUCCESS', TradeAmt: '9999', TradeNo: 'PU-MISMATCH',
    });

    const { status, body } = await getResult(token, tradeNo);

    assertEquals(status, 200);
    assertEquals(body.data.orderStatus, 'pending');
    assertEquals(body.data.paidAwaitingActivation, true);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('一般 pending（無存檔回應）：不觸發自癒，照舊回 pending', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Result Plain Pending' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const tradeNo = await seedPendingOrder(client, user.id, null);

    const { status, body } = await getResult(token, tradeNo);

    assertEquals(status, 200);
    assertEquals(body.data.orderStatus, 'pending');
    assertEquals(body.data.paidAwaitingActivation, false);

    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', user.id);
    assertEquals(subs?.length, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
