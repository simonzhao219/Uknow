// ============================================================
// 過期會員續費雙模式（migration 0008 + /payuni/prepare）：
//   * extend（續約）：新訂閱效期接續前一筆的最後一天
//   * fresh（新約）：效期從付款日起算，可換新推薦人（推薦邊 rewire）
//   * 過期超過一年不能選 extend（prepare 拒絕）
// ============================================================
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
// prepare 路由會呼叫 payuniConfig()（成功路徑要加密表單資料）。
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

let seq = 0;

// 把使用者的所有訂閱改成「已完全過期」（超過寬限期），offsetDays 控制
// 過期多久：end_date = now - offsetDays。
async function expireSubscriptions(
  client: ReturnType<typeof adminClient>,
  userId: string,
  endDaysAgo: number,
) {
  const end = new Date(Date.now() - endDaysAgo * 86400_000).toISOString();
  const grace = new Date(Date.now() - Math.max(endDaysAgo - 60, 1) * 86400_000).toISOString();
  const { error } = await client
    .from('subscriptions')
    .update({ end_date: end, grace_period_end: grace })
    .eq('user_id', userId);
  if (error) throw new Error(`expireSubscriptions failed: ${error.message}`);
  return end;
}

async function postPrepare(token: string, body?: Record<string, unknown>) {
  const res = await app.request('/api/payuni/prepare', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

async function payPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  tradeNo: string,
) {
  const { error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: `PU-${tradeNo}`,
    p_payuni_response: { Status: 'SUCCESS', MerTradeNo: tradeNo, TradeAmt: '1200' },
  });
  return error;
}

Deno.test('extend：新訂閱效期接續前一筆的最後一天（不是付款日）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Extend Renewal' });

  try {
    const { error: firstPayErr } = await payForUser(client, user.id);
    assertEquals(firstPayErr, null);
    // 過期 90 天（寬限期也過了）
    const prevEnd = await expireSubscriptions(client, user.id, 90);

    // 直接塞一筆 extend 訂單並驅動付款（效期錨點是 SQL 層的職責）。
    const tradeNo = `EXTEND-${Date.now()}-${seq++}`;
    await client.from('payment_orders').insert({
      user_id: user.id, amount: 1200, status: 'pending', payment_method: 'payuni',
      transaction_id: tradeNo, renewal_mode: 'extend',
    });
    assertEquals(await payPendingOrder(client, user.id, tradeNo), null);

    const { data: subs } = await client
      .from('subscriptions')
      .select('start_date, end_date, is_renewal')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    assertEquals(subs?.length, 2);

    const renewal = subs![1];
    assertEquals(renewal.is_renewal, true);
    // start = 前一筆 end_date；end = start + 1 年
    assertEquals(new Date(renewal.start_date).getTime(), new Date(prevEnd).getTime());
    const expectedEnd = new Date(prevEnd);
    expectedEnd.setFullYear(expectedEnd.getFullYear() + 1);
    assertEquals(new Date(renewal.end_date).getTime(), expectedEnd.getTime());

    // 過期 90 天 + 接續一年 → 現在是有效會員
    const { data: acct } = await client
      .from('user_account_status').select('status').eq('user_id', user.id).single();
    assertEquals(acct?.status, 'active');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('fresh / null：效期從付款當下起算（現行語意不變）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Fresh Renewal' });

  try {
    const { error: firstPayErr } = await payForUser(client, user.id);
    assertEquals(firstPayErr, null);
    await expireSubscriptions(client, user.id, 400); // 過期超過一年

    const tradeNo = `FRESH-${Date.now()}-${seq++}`;
    await client.from('payment_orders').insert({
      user_id: user.id, amount: 1200, status: 'pending', payment_method: 'payuni',
      transaction_id: tradeNo, renewal_mode: 'fresh',
    });
    const before = Date.now();
    assertEquals(await payPendingOrder(client, user.id, tradeNo), null);

    const { data: subs } = await client
      .from('subscriptions')
      .select('start_date')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    const start = new Date(subs![1].start_date).getTime();
    // start ≈ 付款當下（容忍 60 秒時鐘誤差）
    assertEquals(Math.abs(start - before) < 60_000, true, `fresh 起算日應為付款日，實際 ${subs![1].start_date}`);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：過期超過一年選 extend 被拒絕；選 fresh 可以', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Too Expired' });

  try {
    const { error: firstPayErr } = await payForUser(client, user.id);
    assertEquals(firstPayErr, null);
    await expireSubscriptions(client, user.id, 400); // end+1yr 也在過去

    const token = await getUserAccessToken(client, user.email);

    const extendRes = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(extendRes.status, 400);
    assertStringIncludes(extendRes.body.error ?? '', '過期超過一年');

    const freshRes = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(freshRes.body.success, true);

    const { data: order } = await client
      .from('payment_orders')
      .select('renewal_mode')
      .eq('transaction_id', freshRes.body.data.tradeNo)
      .single();
    assertEquals(order?.renewal_mode, 'fresh');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：過期未滿一年選 extend 建單成功，訂單帶 renewal_mode', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Recent Expired' });

  try {
    const { error: firstPayErr } = await payForUser(client, user.id);
    assertEquals(firstPayErr, null);
    await expireSubscriptions(client, user.id, 90);

    const token = await getUserAccessToken(client, user.email);
    const res = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(res.body.success, true, JSON.stringify(res.body));

    const { data: order } = await client
      .from('payment_orders')
      .select('renewal_mode, status')
      .eq('transaction_id', res.body.data.tradeNo)
      .single();
    assertEquals(order?.renewal_mode, 'extend');
    assertEquals(order?.status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('fresh 換推薦人：推薦邊 rewire 到新推薦人，新訂閱獎勵歸新人、舊獎勵保留', async () => {
  const client = adminClient();
  const referrer1 = await createTestUser(client, { name: 'Old Referrer' });
  const referrer2 = await createTestUser(client, { name: 'New Referrer' });
  let payer: { id: string; email: string } | null = null;

  try {
    // 兩位推薦人都先成為會員（產生 active 推薦碼）
    assertEquals((await payForUser(client, referrer1.id)).error, null);
    assertEquals((await payForUser(client, referrer2.id)).error, null);
    const code1 = await getActiveReferralCode(client, referrer1.id);
    const code2 = await getActiveReferralCode(client, referrer2.id);

    // payer 由 referrer1 推薦註冊並首次付款
    payer = await createTestUser(client, { name: 'Switching Payer', referredByCode: code1 });
    assertEquals((await payForUser(client, payer.id)).error, null);

    const { data: edgeBefore } = await client
      .from('referral_edges').select('referrer_user_id').eq('referee_user_id', payer.id).single();
    assertEquals(edgeBefore?.referrer_user_id, referrer1.id);

    // 會籍過期 → 走 prepare 的 fresh + 新推薦碼（referrer2）
    await expireSubscriptions(client, payer.id, 90);
    const token = await getUserAccessToken(client, payer.email);
    const res = await postPrepare(token, { renewalMode: 'fresh', referredByCode: code2 });
    assertEquals(res.body.success, true, JSON.stringify(res.body));

    // prepare 當下就更新推薦來源
    const { data: profile } = await client
      .from('profiles').select('referred_by_user_id, referred_by_code').eq('id', payer.id).single();
    assertEquals(profile?.referred_by_user_id, referrer2.id);

    // 完成付款 → 推薦邊 rewire、新訂閱的 gen1 獎勵歸 referrer2
    assertEquals(await payPendingOrder(client, payer.id, res.body.data.tradeNo), null);

    const { data: edgeAfter } = await client
      .from('referral_edges').select('referrer_user_id').eq('referee_user_id', payer.id).single();
    assertEquals(edgeAfter?.referrer_user_id, referrer2.id, '推薦邊應 rewire 到新推薦人');

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('user_id')
      .eq('referee_user_id', payer.id)
      .eq('generation', 1)
      .order('created_at', { ascending: true });
    // 第一次付款的獎勵（referrer1）保留；新約付款的獎勵歸 referrer2
    assertEquals(rewards?.length, 2);
    assertEquals(rewards?.[0].user_id, referrer1.id);
    assertEquals(rewards?.[1].user_id, referrer2.id);
  } finally {
    await deleteTestUsers(client, [referrer1.id, referrer2.id, ...(payer ? [payer.id] : [])]);
  }
});

Deno.test('prepare：fresh 帶自己的推薦碼被拒絕', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Self Referral' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    const ownCode = await getActiveReferralCode(client, user.id);
    await expireSubscriptions(client, user.id, 90);

    const token = await getUserAccessToken(client, user.email);
    const res = await postPrepare(token, { renewalMode: 'fresh', referredByCode: ownCode });
    assertEquals(res.status, 400);
    assertStringIncludes(res.body.error ?? '', '自己的推薦碼');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
