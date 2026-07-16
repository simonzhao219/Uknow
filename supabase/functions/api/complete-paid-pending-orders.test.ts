// ============================================================
// complete_paid_pending_orders（migration 0007）：自癒卡單訂單。
//
// 生產事故背景：process_successful_payment 拋例外 → 回滾（訂單留
// pending），edge function 再用 persistRawResponseBestEffort 把 PayUni
// 的 SUCCESS 回應單獨寫回訂單——形成「pending + SUCCESS」矛盾態，
// 使用者被 effective_registration_step=2 永久困在付款結果頁。
// 這個函數要把這種訂單決定性收斂成訂閱，且：
//   * 失敗/無回應的訂單絕不能被誤補完；
//   * 金額不符維持 pending + 去重告警（交人工裁決）；
//   * 冪等、並發安全（for update skip locked）。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let seq = 0;

const successResponse = (tradeNo: string, extra: Record<string, unknown> = {}) => ({
  Status: 'SUCCESS',
  MerTradeNo: tradeNo,
  TradeNo: `PU-${tradeNo}`,
  TradeAmt: '1200',
  ...extra,
});

// 直接重現生產事故的資料形狀：pending 訂單 + 已存的 payuni_response。
async function seedStuckOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  makeResponse: ((tradeNo: string) => Record<string, unknown>) | null,
) {
  const tradeNo = `HEAL-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    payuni_response: makeResponse ? makeResponse(tradeNo) : null,
  });
  if (error) throw new Error(`seedStuckOrder failed: ${error.message}`);
  return tradeNo;
}

Deno.test('卡單訂單（pending + SUCCESS 存檔）被補完成訂閱，step 轉 3', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Stuck Payer' });

  try {
    const tradeNo = await seedStuckOrder(client, user.id, successResponse);

    const { data, error } = await client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    assertEquals(error, null);
    assertEquals(data.completed_count, 1, `expected 1 completed, got ${JSON.stringify(data)}`);

    const { data: order } = await client
      .from('payment_orders')
      .select('id, status, completed_at')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(order?.status, 'completed');
    assertEquals(order?.completed_at != null, true);

    // 訂閱：正好一筆，payment_transaction_id 用 PayUni 的 TradeNo，
    // source_payment_order_id 指回這筆訂單。
    const { data: subs } = await client
      .from('subscriptions')
      .select('payment_transaction_id, source_payment_order_id, is_renewal')
      .eq('user_id', user.id);
    assertEquals(subs?.length, 1);
    assertEquals(subs?.[0].payment_transaction_id, `PU-${tradeNo}`);
    assertEquals(subs?.[0].source_payment_order_id, order?.id);
    assertEquals(subs?.[0].is_renewal, false);

    const { data: step } = await client.rpc('effective_registration_step', { p_user_id: user.id });
    assertEquals(step, 3);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('自癒也會補上推薦鏈（推薦邊 + gen1 獎勵 + 任務進度）', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Heal Referrer' });
  const { error: payErr } = await payForUser(client, referrer.id);
  assertEquals(payErr, null);
  const refCode = await getActiveReferralCode(client, referrer.id);
  const payer = await createTestUser(client, { name: 'Heal Payer', referredByCode: refCode });

  try {
    await seedStuckOrder(client, payer.id, successResponse);

    const { data, error } = await client.rpc('complete_paid_pending_orders', { p_user_id: payer.id });
    assertEquals(error, null);
    assertEquals(data.completed_count, 1);

    const { data: edge } = await client
      .from('referral_edges')
      .select('referrer_user_id')
      .eq('referee_user_id', payer.id)
      .single();
    assertEquals(edge?.referrer_user_id, referrer.id);

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('user_id, amount')
      .eq('referee_user_id', payer.id)
      .eq('generation', 1);
    assertEquals(rewards?.length, 1);
    assertEquals(rewards?.[0].user_id, referrer.id);

    const { data: progress } = await client
      .from('task_progress')
      .select('total_referrals')
      .eq('user_id', referrer.id)
      .single();
    assertEquals((progress?.total_referrals ?? 0) >= 1, true);
  } finally {
    await deleteTestUsers(client, [referrer.id, payer.id]);
  }
});

Deno.test('FAILED 回應與無回應的 pending 訂單不是候選，不會被動到', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Not A Candidate' });

  try {
    const failedTradeNo = await seedStuckOrder(client, user.id, (tn) => ({
      Status: 'FAILED', MerTradeNo: tn, TradeAmt: '1200', ResCode: '51',
    }));
    const emptyTradeNo = await seedStuckOrder(client, user.id, null);

    const { data, error } = await client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    assertEquals(error, null);
    assertEquals(data.candidates_found, 0);

    for (const tn of [failedTradeNo, emptyTradeNo]) {
      const { data: order } = await client
        .from('payment_orders').select('status').eq('transaction_id', tn).single();
      assertEquals(order?.status, 'pending', `${tn} 不該被自癒動到`);
    }
    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', user.id);
    assertEquals(subs?.length, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('金額不符：維持 pending、不建訂閱、告警去重（重跑不重複告警）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Amount Mismatch' });

  try {
    const tradeNo = await seedStuckOrder(client, user.id, (tn) => successResponse(tn, { TradeAmt: '9999' }));

    const run = () => client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    const first = await run();
    assertEquals(first.error, null);
    assertEquals(first.data.amount_mismatch, 1);
    assertEquals(first.data.completed_count, 0);

    // 重跑一次：仍是 mismatch，但不該多寫一筆告警。
    const second = await run();
    assertEquals(second.error, null);
    assertEquals(second.data.amount_mismatch, 1);

    const { data: order } = await client
      .from('payment_orders').select('id, status').eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'pending');

    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', user.id);
    assertEquals(subs?.length, 0);

    const { data: alerts } = await client
      .from('system_alerts')
      .select('id, severity')
      .eq('source', 'complete_paid_pending_orders')
      .eq('context->>order_id', order!.id);
    assertEquals(alerts?.length, 1, `金額不符告警應該只有一筆（去重），實際 ${alerts?.length}`);
    assertEquals(alerts?.[0].severity, 'error');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('冪等：已補完後重跑，candidates_found 為 0、訂閱不重複', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Idempotent Heal' });

  try {
    await seedStuckOrder(client, user.id, successResponse);

    const first = await client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    assertEquals(first.data.completed_count, 1);

    const second = await client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    assertEquals(second.data.candidates_found, 0);

    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', user.id);
    assertEquals(subs?.length, 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('續約卡單：自癒後第二筆訂閱 is_renewal = true', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Renewal Heal' });

  try {
    const { error: firstPayErr } = await payForUser(client, user.id);
    assertEquals(firstPayErr, null);

    await seedStuckOrder(client, user.id, successResponse);

    const { data } = await client.rpc('complete_paid_pending_orders', { p_user_id: user.id });
    assertEquals(data.completed_count, 1);

    const { data: subs } = await client
      .from('subscriptions')
      .select('is_renewal')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    assertEquals(subs?.length, 2);
    assertEquals(subs?.map((s: { is_renewal: boolean }) => s.is_renewal), [false, true]);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('並發自癒同一使用者：仍然只有 1 筆訂閱、1 筆 gen1 獎勵', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Concurrent Heal Referrer' });
  const { error: payErr } = await payForUser(client, referrer.id);
  assertEquals(payErr, null);
  const refCode = await getActiveReferralCode(client, referrer.id);
  const payer = await createTestUser(client, { name: 'Concurrent Heal Payer', referredByCode: refCode });

  // 跟 process-payment-concurrency.test.ts 同一招：原生連線才能讓兩個
  // 呼叫真正在 DB 層同時執行（模擬 profile 載入自癒與排程對帳撞在一起）。
  const sql1 = postgres(DB_URL, { max: 1 });
  const sql2 = postgres(DB_URL, { max: 1 });

  try {
    const tradeNo = await seedStuckOrder(client, payer.id, successResponse);

    const call = (sql: ReturnType<typeof postgres>) =>
      sql`select complete_paid_pending_orders(${payer.id}::uuid) as result`;
    const [r1, r2] = await Promise.allSettled([call(sql1), call(sql2)]);
    assertEquals(r1.status === 'fulfilled' || r2.status === 'fulfilled', true);

    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', payer.id);
    assertEquals(subs?.length, 1, `並發自癒不該產生重複訂閱，實際 ${subs?.length}`);

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('id')
      .eq('referee_user_id', payer.id)
      .eq('generation', 1);
    assertEquals(rewards?.length, 1, `並發自癒不該重複發獎，實際 ${rewards?.length}`);

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'completed');
  } finally {
    await sql1.end();
    await sql2.end();
    await deleteTestUsers(client, [referrer.id, payer.id]);
  }
});
