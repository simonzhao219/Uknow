// ============================================================
// 時間領域重設計（migration 0718 0001/0002）：
//   * 付款成功時點是 SSOT：效期錨定 PayUni AuthDay/AuthTime 的台灣
//     日曆日，不是 process_successful_payment 執行當下
//   * 效期含頭尾一年整：start 台灣日 D 00:00 → end D+1年−1天 23:59:59.999999
//   * fallback 鏈：AuthDay+AuthTime → PayTime → 訂單 created_at → now()
//   * backfill_time_domain()：既有資料嚴格重算、可重跑冪等
// ============================================================
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
} from './test-helpers.ts';
import {
  twDayOf,
  twDayPlusDays,
  subscriptionLastDay,
  twStartOfDayInstant,
  twEndOfDayInstant,
} from './tw-dates.ts';

let seq = 0;

// 插入一筆 pending 訂單（可指定 created_at / 預存的 payuni_response），
// 回傳 tradeNo。
async function insertPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  opts: { createdAt?: string; payuniResponse?: Record<string, unknown> } = {},
): Promise<string> {
  const tradeNo = `PERIOD-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    ...(opts.payuniResponse ? { payuni_response: opts.payuniResponse } : {}),
  });
  if (error) throw new Error(`insertPendingOrder failed: ${error.message}`);
  return tradeNo;
}

async function processPayment(
  client: ReturnType<typeof adminClient>,
  userId: string,
  tradeNo: string,
  payuniResponse: Record<string, unknown>,
) {
  return await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: `PU-${tradeNo}`,
    p_payuni_response: payuniResponse,
  });
}

async function latestSubscription(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client
    .from('subscriptions')
    .select('id, start_date, end_date, grace_period_end')
    .eq('user_id', userId)
    .order('end_date', { ascending: false })
    .limit(1)
    .single();
  return data!;
}

Deno.test('事故重演：webhook 失敗數日後補開通，效期仍錨定 AuthDay 的台灣日', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Incident User' });

  try {
    // 真實事故的時間線：訂單 2026-07-15 23:40:31Z 建立（= 台灣 7/16
    // 07:40），PayUni 授權 AuthDay=20260716 AuthTime=074055（台灣時間），
    // webhook 失敗、數日後（= 本測試執行的「現在」）才補開通。
    const createdAt = '2026-07-15T23:40:31Z';
    const tradeNo = await insertPendingOrder(client, user.id, { createdAt });

    const { error } = await processPayment(client, user.id, tradeNo, {
      Status: 'SUCCESS',
      AuthDay: '20260716',
      AuthTime: '074055',
      TradeAmt: '1200',
    });
    assertEquals(error, null);

    const sub = await latestSubscription(client, user.id);
    // 起始 = 台灣 2026-07-16 00:00（= 2026-07-15T16:00Z）——是 AuthDay
    // 的台灣日，不是補開通當天，也不是 UTC 日（7/15）。
    assertEquals(new Date(sub.start_date).toISOString(), '2026-07-15T16:00:00.000Z');
    // 迄 = 2027-07-15 台灣日終（含頭尾一年整：7/16 ~ 隔年 7/15）
    assertEquals(twDayOf(sub.end_date), '2027-07-15');
    assertEquals(new Date(sub.end_date).getTime(), twEndOfDayInstant('2027-07-15').getTime());
    // grace = 最後一天 + 60 天的台灣日終
    assertEquals(
      new Date(sub.grace_period_end).getTime(),
      twEndOfDayInstant(twDayPlusDays('2027-07-15', 60)).getTime(),
    );

    // completed_at = 付款授權時點（不是補開通執行時點）
    const { data: order } = await client
      .from('payment_orders')
      .select('completed_at')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(new Date(order!.completed_at).toISOString(), '2026-07-15T23:40:55.000Z');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('fallback 鏈：回應沒有 AuthDay 時錨定訂單 created_at 的台灣日', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Fallback User' });

  try {
    // created_at = 2026-07-10T10:00Z（= 台灣 7/10 18:00 → 台灣日 7/10）
    const tradeNo = await insertPendingOrder(client, user.id, { createdAt: '2026-07-10T10:00:00Z' });
    const { error } = await processPayment(client, user.id, tradeNo, { Status: 'SUCCESS' });
    assertEquals(error, null);

    const sub = await latestSubscription(client, user.id);
    assertEquals(twDayOf(sub.start_date), '2026-07-10');
    assertEquals(new Date(sub.start_date).getTime(), twStartOfDayInstant('2026-07-10').getTime());
    assertEquals(twDayOf(sub.end_date), '2027-07-09');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('畸形 AuthDay 不炸，安全 fallback 到 created_at', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Malformed User' });

  try {
    const tradeNo = await insertPendingOrder(client, user.id, { createdAt: '2026-07-10T10:00:00Z' });
    const { error } = await processPayment(client, user.id, tradeNo, {
      Status: 'SUCCESS',
      AuthDay: '99999999', // 格式對（8 碼數字）但數值非法
      AuthTime: '235959',
    });
    assertEquals(error, null);

    const sub = await latestSubscription(client, user.id);
    assertEquals(twDayOf(sub.start_date), '2026-07-10');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('台灣午夜邊界：AuthTime 23:59:59 仍算當天', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Midnight User' });

  try {
    // AuthDay 7/15 23:59:59 台灣 = 7/15 15:59:59Z
    const tradeNo = await insertPendingOrder(client, user.id, { createdAt: '2026-07-15T15:00:00Z' });
    const { error } = await processPayment(client, user.id, tradeNo, {
      Status: 'SUCCESS',
      AuthDay: '20260715',
      AuthTime: '235959',
    });
    assertEquals(error, null);

    const sub = await latestSubscription(client, user.id);
    assertEquals(twDayOf(sub.start_date), '2026-07-15');
    assertEquals(twDayOf(sub.end_date), '2027-07-14');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('延遲自癒：complete_paid_pending_orders 開通的效期也錨定付款日', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Self Heal User' });

  try {
    // 三天前建單、當下已存 SUCCESS 回應（persistRawResponseBestEffort
    // 的復原資料），webhook 沒完成 → 今天自癒。
    const threeDaysAgo = new Date(Date.now() - 3 * 86400_000);
    const authDay = twDayOf(threeDaysAgo).replaceAll('-', '');
    await insertPendingOrder(client, user.id, {
      createdAt: threeDaysAgo.toISOString(),
      payuniResponse: { Status: 'SUCCESS', AuthDay: authDay, AuthTime: '120000', TradeAmt: '1200' },
    });

    const { error } = await client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    assertEquals(error, null);

    const sub = await latestSubscription(client, user.id);
    assertEquals(twDayOf(sub.start_date), twDayOf(threeDaysAgo), '起始日應為付款日，不是自癒執行日');
    assertNotEquals(twDayOf(sub.start_date), twDayOf(Date.now()));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('compute_subscription_period：閏年 2/29 起算對用戶有利（不短於整年）', async () => {
  const client = adminClient();
  // 2028-02-29 起算 → 最後一天 2029-02-28（不是 2029-02-27）
  const { data, error } = await client.rpc('compute_subscription_period', {
    p_anchor_day: '2028-02-29',
  });
  assertEquals(error, null);
  const row = Array.isArray(data) ? data[0] : data;
  assertEquals(twDayOf(row.end_date), '2029-02-28');
  // TS 鏡射實作必須同語意
  assertEquals(subscriptionLastDay('2028-02-29'), '2029-02-28');
  // 一般日期：same-day 隔年 − 1 天
  assertEquals(subscriptionLastDay('2026-07-16'), '2027-07-15');
});

Deno.test('backfill_time_domain：修正舊制錯誤效期、保留已領推薦王 +1 年、重跑冪等', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Backfill User' });

  try {
    // 模擬舊制受害者：付款授權在 2026-07-15T23:40Z（台灣 7/16），但舊版
    // 用「開通當下」起算——把訂閱直接改成錯誤的 7/18 起算 + 1 年。
    const createdAt = '2026-07-15T23:40:31Z';
    const tradeNo = await insertPendingOrder(client, user.id, { createdAt });
    const { error: payErr } = await processPayment(client, user.id, tradeNo, {
      Status: 'SUCCESS',
      AuthDay: '20260716',
      AuthTime: '074055',
    });
    assertEquals(payErr, null);

    const sub = await latestSubscription(client, user.id);
    // 竄改成舊制的錯誤值（start = 開通日、end = start+1yr、raw instant）
    const wrongStart = '2026-07-18T01:38:38Z';
    const wrongEnd = '2027-07-18T01:38:38Z';
    await client.from('subscriptions').update({
      start_date: wrongStart,
      end_date: wrongEnd,
      grace_period_end: '2027-09-16T01:38:38Z',
    }).eq('id', sub.id);
    await client.from('payment_orders').update({
      completed_at: wrongStart,
    }).eq('transaction_id', tradeNo);

    // 第一次 backfill：全部修正
    const { data: r1, error: e1 } = await client.rpc('backfill_time_domain');
    assertEquals(e1, null);
    assertEquals(r1?.success, true);

    const fixed = await latestSubscription(client, user.id);
    assertEquals(new Date(fixed.start_date).toISOString(), '2026-07-15T16:00:00.000Z');
    assertEquals(twDayOf(fixed.end_date), '2027-07-15');

    const { data: order } = await client
      .from('payment_orders').select('completed_at').eq('transaction_id', tradeNo).single();
    assertEquals(new Date(order!.completed_at).toISOString(), '2026-07-15T23:40:55.000Z');

    // 第二次 backfill：no-op（冪等）
    const before2 = await latestSubscription(client, user.id);
    const { error: e2 } = await client.rpc('backfill_time_domain');
    assertEquals(e2, null);
    const after2 = await latestSubscription(client, user.id);
    assertEquals(after2.start_date, before2.start_date);
    assertEquals(after2.end_date, before2.end_date);

    // 已領取的推薦王 credit：backfill 重算必須保留 +1 年
    await client.from('referral_king_rewards').insert({
      user_id: user.id,
      month_key: '2026-07',
      status: 'claimed',
      granted_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      resulting_subscription_id: sub.id,
    });
    const { error: e3 } = await client.rpc('backfill_time_domain');
    assertEquals(e3, null);
    const withClaim = await latestSubscription(client, user.id);
    // 基期最後一天 2027-07-15 + 1 年 = 2028-07-15
    assertEquals(twDayOf(withClaim.end_date), '2028-07-15');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
