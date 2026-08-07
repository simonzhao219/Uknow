// ============================================================
// 過期會員續費雙模式（migration 0008 + 0718 0001 + /payuni/prepare）：
//   * extend（續約）：新訂閱效期接續「前一筆最後一天（台灣日）的隔天」
//   * fresh（新約）：效期從付款日（台灣日曆日）起算，可換新推薦人
//   * 過期超過一年不能選 extend（prepare 拒絕）
// 0718 時間領域重設計後，所有效期邊界都正規化到台灣日界：
//   start = 錨定日 TW 00:00、end = 最後一天 TW 23:59:59.999999。
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
import {
  subscriptionLastDay,
  twDayOf,
  twDayPlusDays,
  twDayPlusYears,
  twEndOfDayInstant,
  twStartOfDayInstant,
} from './tw-dates.ts';

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
      user_id: user.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: tradeNo,
      renewal_mode: 'extend',
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
    // 錨定日 = 前一筆最後一天（台灣日）的隔天；start = 錨定日 TW 00:00、
    // end = 錨定日 + 1 年 − 1 天的 TW 日終（例：前期迄 2027/7/14 →
    // 新期 2027/7/15 ~ 2028/7/14）。
    const anchorDay = twDayPlusDays(twDayOf(prevEnd), 1);
    assertEquals(new Date(renewal.start_date).getTime(), twStartOfDayInstant(anchorDay).getTime());
    const lastDay = subscriptionLastDay(anchorDay);
    assertEquals(new Date(renewal.end_date).getTime(), twEndOfDayInstant(lastDay).getTime());

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
      user_id: user.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: tradeNo,
      renewal_mode: 'fresh',
    });
    const before = Date.now();
    assertEquals(await payPendingOrder(client, user.id, tradeNo), null);

    const { data: subs } = await client
      .from('subscriptions')
      .select('start_date')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    // start = 付款日（台灣日曆日）的 TW 00:00。付款瞬間可能跨台灣午夜，
    // 兩個候選日都接受。
    const startDay = twDayOf(subs![1].start_date);
    const dayOk = startDay === twDayOf(before) || startDay === twDayOf(Date.now());
    assertEquals(dayOk, true, `fresh 起算日應為付款日（台灣日），實際 ${subs![1].start_date}`);
    assertEquals(
      new Date(subs![1].start_date).getTime(),
      twStartOfDayInstant(startDay).getTime(),
      'start 應正規化為台灣日 00:00',
    );
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：過期超過一年選 extend 也能建單（A1 補繳制）；fresh 照舊', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Too Expired' });

  try {
    const { error: firstPayErr } = await payForUser(client, user.id);
    assertEquals(firstPayErr, null);
    await expireSubscriptions(client, user.id, 400); // end+1yr 也在過去

    const token = await getUserAccessToken(client, user.email);

    // A1：「續約（接續原效期）」永遠可選，不因過期多久而消失。
    const extendRes = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(extendRes.body.success, true, JSON.stringify(extendRes.body));
    const { data: extendOrder } = await client
      .from('payment_orders')
      .select('renewal_mode')
      .eq('transaction_id', extendRes.body.data.tradeNo)
      .single();
    assertEquals(extendOrder?.renewal_mode, 'extend');

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

Deno.test('prepare：從未訂閱者選 extend 仍被拒（唯一保留的 extend 擋）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Never Subscribed' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(res.status, 400);
    assertStringIncludes(res.body.error ?? '', '沒有可接續的訂閱紀錄');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('AC-1：過期近三年連續三筆 extend，前兩筆仍 expired、第三筆 active', async () => {
  const client = adminClient();
  // 三層上代：g3 ← g2 ← g1 ← payer（AC-5 要驗三代獎勵各 3 筆）。
  const g3 = await createTestUser(client, { name: 'AC1 Gen3' });
  let g2: { id: string; email: string } | null = null;
  let g1: { id: string; email: string } | null = null;
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, g3.id)).error, null);
    g2 = await createTestUser(client, {
      name: 'AC1 Gen2',
      referredByCode: await getActiveReferralCode(client, g3.id),
    });
    assertEquals((await payForUser(client, g2.id)).error, null);
    g1 = await createTestUser(client, {
      name: 'AC1 Gen1',
      referredByCode: await getActiveReferralCode(client, g2.id),
    });
    assertEquals((await payForUser(client, g1.id)).error, null);
    payer = await createTestUser(client, {
      name: 'AC1 Payer',
      referredByCode: await getActiveReferralCode(client, g1.id),
    });
    assertEquals((await payForUser(client, payer.id)).error, null);

    // 過期近三年（today − 3 年 + 45 天）→ 需連續補 3 筆才 active。
    const lastEndDay = twDayPlusDays(twDayPlusYears(twDayOf(new Date()), -3), 45);
    const endInstant = twEndOfDayInstant(lastEndDay).toISOString();
    const { error: expErr } = await client
      .from('subscriptions')
      .update({ end_date: endInstant, grace_period_end: endInstant })
      .eq('user_id', payer.id);
    assertEquals(expErr, null);

    const token = await getUserAccessToken(client, payer.email);
    // 週年日保留：三筆迄日 = 原到期日 +1/+2/+3 年。
    const expectedEnds = [1, 2, 3].map((k) => twDayPlusYears(lastEndDay, k));

    for (let i = 0; i < 3; i++) {
      const res = await postPrepare(token, { renewalMode: 'extend' });
      assertEquals(res.body.success, true, `第 ${i + 1} 筆 prepare：${JSON.stringify(res.body)}`);
      assertEquals(await payPendingOrder(client, payer.id, res.body.data.tradeNo), null);

      const { data: latest } = await client
        .from('subscriptions')
        .select('end_date')
        .eq('user_id', payer.id)
        .order('end_date', { ascending: false })
        .limit(1)
        .single();
      assertEquals(twDayOf(latest!.end_date), expectedEnds[i], `第 ${i + 1} 筆迄日`);

      const { data: acct } = await client
        .from('user_account_status').select('status').eq('user_id', payer.id).single();
      assertEquals(acct?.status, i < 2 ? 'expired' : 'active', `第 ${i + 1} 筆後帳號狀態`);
    }

    // AC-5：三筆補繳各發三代獎勵（每代 3 筆、全數綁補繳訂閱），任務不 +1。
    const { data: backfillSubs } = await client
      .from('subscriptions')
      .select('id')
      .eq('user_id', payer.id)
      .order('created_at', { ascending: false })
      .limit(3);
    const backfillSubIds = backfillSubs!.map((s) => s.id);
    for (
      const [gen, upline] of [[1, g1], [2, g2], [3, g3]] as const
    ) {
      const { data: rewards } = await client
        .from('reward_transactions')
        .select('user_id, subscription_id')
        .eq('referee_user_id', payer.id)
        .eq('generation', gen)
        .in('subscription_id', backfillSubIds);
      assertEquals(rewards?.length, 3, `第 ${gen} 代應收 3 筆補繳獎勵`);
      for (const r of rewards ?? []) assertEquals(r.user_id, upline!.id);
    }

    const { data: tp } = await client
      .from('task_progress')
      .select('total_referrals')
      .eq('user_id', g1.id)
      .single();
    assertEquals(tp?.total_referrals, 1, '補繳不得讓上代任務 +1（僅首購那次）');
  } finally {
    await deleteTestUsers(
      client,
      [g3.id, g2?.id, g1?.id, payer?.id].filter((x): x is string => !!x),
    );
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
