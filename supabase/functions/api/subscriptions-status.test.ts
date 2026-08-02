// ============================================================
// 階段 8（renewal-backfill）：GET /subscriptions/status 的 data 新增
//   * renewal 物件（extendAnchorDate/extendEndDate/backfillCount/
//     backfillAmount/backfillFinalEndDate/expiredForMonths/
//     hasPaidAnyBackfill/freshForfeitPoints/freshForfeitReferrals）
//   * data 頂層 hasPendingWithdrawal（A16 建單守衛的前端對應，與守衛
//     共用同一 helper；不得複用 reward_balances.pending）
// hasPaidAnyBackfill 定義：最新一筆 subscriptions 的 end_date < 其
// source_payment_order_id 對應訂單的 completed_at（補繳付款的獨有特徵
// ——付款當下算出的效期已在過去）。
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
import { twDayOf, twDayPlusDays, twDayPlusYears } from './tw-dates.ts';

ensureEdgeFunctionEnv();

const { app } = await import('./index.ts');

let seq = 0;

async function getStatus(token: string) {
  const res = await app.request('/api/subscriptions/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return { status: res.status, data: body.data };
}

/** 把使用者最新訂閱的迄日改成指定台灣日（日終），grace 同步。 */
async function setLastEnd(
  client: ReturnType<typeof adminClient>,
  userId: string,
  lastEndDay: string,
) {
  const end = new Date(`${lastEndDay}T23:59:59.999+08:00`).toISOString();
  const { error } = await client
    .from('subscriptions')
    .update({ end_date: end, grace_period_end: end })
    .eq('user_id', userId);
  if (error) throw new Error(`setLastEnd failed: ${error.message}`);
}

async function payExtend(client: ReturnType<typeof adminClient>, userId: string) {
  const tradeNo = `STATUS-${Date.now()}-${seq++}`;
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    renewal_mode: 'extend',
  });
  if (insertErr) throw new Error(`payExtend insert failed: ${insertErr.message}`);
  const { data, error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: `PU-${tradeNo}`,
    p_payuni_response: { Status: 'SUCCESS' },
  });
  if (error) throw new Error(`payExtend rpc failed: ${error.message}`);
  return { tradeNo, subscriptionId: data?.subscription_id };
}

Deno.test('status：過期兩年 → renewal 回補繳筆數/金額/錨點/迄日/完整月數', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Status Backfill' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    const today = twDayOf(new Date());
    const lastEndDay = twDayPlusYears(today, -2); // 剛好過期兩年 → 需補 2 筆
    await setLastEnd(client, user.id, lastEndDay);

    const token = await getUserAccessToken(client, user.email);
    const { status, data } = await getStatus(token);
    assertEquals(status, 200);

    assertEquals(data.renewal.extendAnchorDate, twDayPlusDays(lastEndDay, 1));
    assertEquals(data.renewal.extendEndDate, twDayPlusYears(lastEndDay, 1));
    assertEquals(data.renewal.backfillCount, 2);
    assertEquals(data.renewal.backfillAmount, 2400);
    assertEquals(data.renewal.backfillFinalEndDate, twDayPlusYears(lastEndDay, 2));
    assertEquals(data.renewal.expiredForMonths, 24);
    assertEquals(data.renewal.hasPaidAnyBackfill, false);

    // 付第 1 筆補繳（效期仍在過去）→ hasPaidAnyBackfill 翻 true、
    // 剩餘筆數遞減、錨點接續前進。
    await payExtend(client, user.id);
    const after = (await getStatus(token)).data;
    assertEquals(after.renewal.hasPaidAnyBackfill, true);
    assertEquals(after.renewal.backfillCount, 1);
    assertEquals(after.renewal.backfillAmount, 1200);
    assertEquals(after.renewal.extendAnchorDate, twDayPlusDays(twDayPlusYears(lastEndDay, 1), 1));
    assertEquals(after.renewal.backfillFinalEndDate, twDayPlusYears(lastEndDay, 2));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('status：active 會員 renewal.backfillCount=0、從未訂閱 renewal=null', async () => {
  const client = adminClient();
  const active = await createTestUser(client, { name: 'Status Active' });
  const never = await createTestUser(client, { name: 'Status Never' });

  try {
    assertEquals((await payForUser(client, active.id)).error, null);
    const activeToken = await getUserAccessToken(client, active.email);
    const activeData = (await getStatus(activeToken)).data;
    assertEquals(activeData.renewal.backfillCount, 0);
    assertEquals(activeData.renewal.backfillAmount, 0);
    assertEquals(activeData.renewal.expiredForMonths, 0);
    assertEquals(activeData.renewal.hasPaidAnyBackfill, false);

    const neverToken = await getUserAccessToken(client, never.email);
    const neverData = (await getStatus(neverToken)).data;
    assertEquals(neverData.renewal, null);
  } finally {
    await deleteTestUsers(client, [active.id, never.id]);
  }
});

Deno.test('status：曾 extend 續約後自然再到期且本輪未付款 → hasPaidAnyBackfill=false', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Status AC8' });

  try {
    // 曾正常 extend 續約過（最新一筆 completed 訂單是 extend——舊定義
    // 會誤判 true 的正是這種老會員）。
    assertEquals((await payForUser(client, user.id)).error, null);
    const { tradeNo } = await payExtend(client, user.id);

    // 模擬「自然再到期」：效期改成 100 天前，且付款時點在效期起算前
    // 一年多（正常續約的時間關係：completed_at 遠早於 end_date）。
    const today = twDayOf(new Date());
    await setLastEnd(client, user.id, twDayPlusDays(today, -100));
    const paidAt = new Date(Date.now() - 465 * 86400_000).toISOString();
    const { error: backErr } = await client
      .from('payment_orders')
      .update({ completed_at: paidAt })
      .eq('transaction_id', tradeNo);
    assertEquals(backErr, null);

    const token = await getUserAccessToken(client, user.email);
    const data = (await getStatus(token)).data;
    assertEquals(data.renewal.hasPaidAnyBackfill, false, 'AC-8：老會員自然到期不得顯示已補繳');
    assertEquals(data.renewal.backfillCount, 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('status：freshForfeitPoints/Referrals 等於現值、無資產時為 0', async () => {
  const client = adminClient();
  const rich = await createTestUser(client, { name: 'Status Forfeit Rich' });
  const bare = await createTestUser(client, { name: 'Status Forfeit Bare' });

  try {
    assertEquals((await payForUser(client, rich.id)).error, null);
    assertEquals((await payForUser(client, bare.id)).error, null);
    const { error: adjErr } = await client.from('reward_transactions').insert({
      user_id: rich.id,
      type: 'adjustment',
      amount: 100,
      description: '測試入帳',
    });
    assertEquals(adjErr, null);
    const { error: tpErr } = await client.from('task_progress').insert({
      user_id: rich.id,
      total_referrals: 2,
      monthly_referrals: { '2025-03': [crypto.randomUUID(), crypto.randomUUID()] },
    });
    assertEquals(tpErr, null);

    const richData = (await getStatus(await getUserAccessToken(client, rich.email))).data;
    assertEquals(richData.renewal.freshForfeitPoints, 100);
    assertEquals(richData.renewal.freshForfeitReferrals, 2);

    const bareData = (await getStatus(await getUserAccessToken(client, bare.email))).data;
    assertEquals(bareData.renewal.freshForfeitPoints, 0);
    assertEquals(bareData.renewal.freshForfeitReferrals, 0);
  } finally {
    await deleteTestUsers(client, [rich.id, bare.id]);
  }
});

Deno.test('status：hasPendingWithdrawal 在 data 頂層，只認 pending 提領', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Status Pending W' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    const token = await getUserAccessToken(client, user.email);

    assertEquals((await getStatus(token)).data.hasPendingWithdrawal, false);

    const { error: wErr } = await client
      .from('withdrawals')
      .insert({ user_id: user.id, amount: 1000, status: 'awaiting_collection' });
    assertEquals(wErr, null);
    assertEquals(
      (await getStatus(token)).data.hasPendingWithdrawal,
      false,
      'awaiting_collection 不算審核中',
    );

    const { error: w2Err } = await client
      .from('withdrawals')
      .insert({ user_id: user.id, amount: 1000, status: 'pending' });
    assertEquals(w2Err, null);
    assertEquals((await getStatus(token)).data.hasPendingWithdrawal, true);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
