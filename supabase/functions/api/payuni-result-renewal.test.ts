// ============================================================
// 階段 8（renewal-backfill）：GET /payuni/result/:tradeNo 回應新增
// 精簡版 renewal（backfillCount / backfillAmount / extendEndDate），
// 供 PaymentResult.tsx 判斷「這是補繳中間筆」而不必另掛
// useSubscription()（P0 裁決方案 b）。語意與 /subscriptions/status 的
// renewal 相同：以查詢當下 DB 的最新訂閱迄日計算剩餘補繳。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';
import { twDayOf, twDayPlusYears } from './tw-dates.ts';

ensureEdgeFunctionEnv();

const { app } = await import('./index.ts');

let seq = 0;

async function payExtend(client: ReturnType<typeof adminClient>, userId: string) {
  const tradeNo = `RESULT-${Date.now()}-${seq++}`;
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    renewal_mode: 'extend',
  });
  if (insertErr) throw new Error(`payExtend insert failed: ${insertErr.message}`);
  const { error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: `PU-${tradeNo}`,
    p_payuni_response: { Status: 'SUCCESS' },
  });
  if (error) throw new Error(`payExtend rpc failed: ${error.message}`);
  return tradeNo;
}

async function getResult(token: string, tradeNo: string) {
  const res = await app.request(`/api/payuni/result/${tradeNo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { status: res.status, data: body.data };
}

Deno.test('result：補繳中間筆 → renewal 回剩餘筆數/金額/下一筆迄日', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Result Backfill' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    // 過期整三年 → 需補 3 筆；付第 1 筆後剩 2 筆。
    const today = twDayOf(new Date());
    const lastEndDay = twDayPlusYears(today, -3);
    const end = new Date(`${lastEndDay}T23:59:59.999+08:00`).toISOString();
    const { error: expErr } = await client
      .from('subscriptions')
      .update({ end_date: end, grace_period_end: end })
      .eq('user_id', user.id);
    assertEquals(expErr, null);

    const tradeNo = await payExtend(client, user.id);
    const token = await getUserAccessToken(client, user.email);
    const { status, data } = await getResult(token, tradeNo);
    assertEquals(status, 200);

    // 既有欄位不變：付款本身已完成。
    assertEquals(data.orderStatus, 'completed');
    // 精簡 renewal：剩 2 筆、2400 元、下一筆補完到 lastEnd+2 年。
    assertEquals(data.renewal.backfillCount, 2);
    assertEquals(data.renewal.backfillAmount, 2400);
    assertEquals(data.renewal.extendEndDate, twDayPlusYears(lastEndDay, 2));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('result：最後一筆補繳付完（已 active）→ renewal.backfillCount=0', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Result Final' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    // 過期未滿一年 → 補 1 筆即 active。
    const today = twDayOf(new Date());
    const lastEndDay = twDayPlusYears(today, -1);
    const end = new Date(`${lastEndDay}T23:59:59.999+08:00`).toISOString();
    const { error: expErr } = await client
      .from('subscriptions')
      .update({ end_date: end, grace_period_end: end })
      .eq('user_id', user.id);
    assertEquals(expErr, null);

    const tradeNo = await payExtend(client, user.id);
    const token = await getUserAccessToken(client, user.email);
    const { data } = await getResult(token, tradeNo);
    assertEquals(data.orderStatus, 'completed');
    assertEquals(data.renewal.backfillCount, 0, '補滿後不得再顯示補繳進度');
    assertEquals(data.renewal.backfillAmount, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
