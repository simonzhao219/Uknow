// ============================================================
// A10/A11（renewal-backfill 階段 5）：續約選 fresh 且未填推薦碼
//   * A10：套用平台預設推薦碼（reward_config.default_referrer_code），
//     referred_by_is_default = **true**（前端據此隱藏該碼，Q11）
//   * A11：預設碼解析失敗（未設定／無效／推薦人停權／自我推薦）→
//     維持原上代不變 + system_alerts 告警，**不阻斷金流**（建單照常）
//   * S12：原本就沒有上代的人 fresh 不填碼 → 也綁預設推薦人
//   * S6：extend 完全不動上代
// 落點 = /payuni/prepare 的 W3 寫入點（改法 B）；碼的合法性唯一判準
// 仍是 validate_referral_code。
//
// ⚠️ 本測試會改動全域單列 reward_config 的 default_referrer_code，
// 務必在 finally 還原原值（比照 default-referrer.test.ts 的紀律）。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
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
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

async function snapshotDefaultCode(client: ReturnType<typeof adminClient>) {
  const { data } = await client
    .from('reward_config')
    .select('default_referrer_code')
    .eq('id', true)
    .single();
  return data?.default_referrer_code ?? null;
}

async function setDefaultCode(client: ReturnType<typeof adminClient>, code: string | null) {
  const { error } = await client
    .from('reward_config')
    .update({ default_referrer_code: code })
    .eq('id', true);
  assertEquals(error, null, `設定 default_referrer_code 失敗: ${error?.message}`);
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

async function postPrepare(token: string, body?: Record<string, unknown>) {
  const res = await app.request('/api/payuni/prepare', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

async function referralStateOf(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client
    .from('profiles')
    .select('referred_by_user_id, referred_by_code, referred_by_is_default')
    .eq('id', userId)
    .single();
  return data!;
}

Deno.test('prepare：fresh 未填碼 → 套用預設推薦碼且 referred_by_is_default=true', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const upline = await createTestUser(client, { name: 'A10 Upline' });
  const platform = await createTestUser(client, { name: 'A10 Platform' });
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    assertEquals((await payForUser(client, platform.id)).error, null);
    const platformCode = await getActiveReferralCode(client, platform.id);
    await setDefaultCode(client, platformCode);

    payer = await createTestUser(client, {
      name: 'A10 Payer',
      referredByCode: await getActiveReferralCode(client, upline.id),
    });
    assertEquals((await payForUser(client, payer.id)).error, null);
    await expireSubscriptions(client, payer.id, 90);

    const token = await getUserAccessToken(client, payer.email);
    const res = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(res.body.success, true, JSON.stringify(res.body));

    // A10：選新約 = 離開原上代；未填碼 → 綁平台預設推薦人，且旗標為
    // 自動來源（前端不得把這個碼顯示給使用者）。
    const state = await referralStateOf(client, payer.id);
    assertEquals(state.referred_by_user_id, platform.id);
    assertEquals(state.referred_by_code, platformCode);
    assertEquals(state.referred_by_is_default, true);

    // 完成付款 → 推薦邊 rewire 到預設推薦人。
    const { error: payErr } = await client.rpc('process_successful_payment', {
      p_user_id: payer.id,
      p_trade_no: res.body.data.tradeNo,
      p_transaction_id: `PU-${res.body.data.tradeNo}`,
      p_payuni_response: { Status: 'SUCCESS' },
    });
    assertEquals(payErr, null);
    const { data: edge } = await client
      .from('referral_edges').select('referrer_user_id').eq('referee_user_id', payer.id).single();
    assertEquals(edge?.referrer_user_id, platform.id);
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [upline.id, platform.id, ...(payer ? [payer.id] : [])]);
  }
});

Deno.test('prepare：fresh 填現任上代的碼 → 上代仍是原人且 is_default=false', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const upline = await createTestUser(client, { name: 'AC10 Upline' });
  const platform = await createTestUser(client, { name: 'AC10 Platform' });
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    assertEquals((await payForUser(client, platform.id)).error, null);
    await setDefaultCode(client, await getActiveReferralCode(client, platform.id));

    const uplineCode = await getActiveReferralCode(client, upline.id);
    payer = await createTestUser(client, { name: 'AC10 Payer', referredByCode: uplineCode });
    assertEquals((await payForUser(client, payer.id)).error, null);
    await expireSubscriptions(client, payer.id, 90);

    // 與 AC-9 的差別只在有沒有填碼——填了現任上代的碼就留在原樹，
    // 預設碼完全不介入。
    const token = await getUserAccessToken(client, payer.email);
    const res = await postPrepare(token, { renewalMode: 'fresh', referredByCode: uplineCode });
    assertEquals(res.body.success, true, JSON.stringify(res.body));

    const state = await referralStateOf(client, payer.id);
    assertEquals(state.referred_by_user_id, upline.id);
    assertEquals(state.referred_by_is_default, false);
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [upline.id, platform.id, ...(payer ? [payer.id] : [])]);
  }
});

Deno.test('prepare：預設碼四種失效 → 維持原上代、建單成功、留告警', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const upline = await createTestUser(client, { name: 'A11 Upline' });
  const suspended = await createTestUser(client, { name: 'A11 Suspended' });
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    assertEquals((await payForUser(client, suspended.id)).error, null);
    const suspendedCode = await getActiveReferralCode(client, suspended.id);

    const uplineCode = await getActiveReferralCode(client, upline.id);
    payer = await createTestUser(client, { name: 'A11 Payer', referredByCode: uplineCode });
    assertEquals((await payForUser(client, payer.id)).error, null);
    const payerOwnCode = await getActiveReferralCode(client, payer.id);
    await expireSubscriptions(client, payer.id, 90);

    // 停權預設碼主人（validate_referral_code 會拒絕停權推薦人的碼）。
    const { error: susErr } = await client
      .from('profiles')
      .update({ suspended_at: new Date().toISOString() })
      .eq('id', suspended.id);
    assertEquals(susErr, null);

    const token = await getUserAccessToken(client, payer.email);
    const scenarios: Array<{ label: string; code: string | null }> = [
      { label: 'unset', code: null },
      { label: 'invalid', code: 'no-such-code-a11' },
      { label: 'suspended', code: suspendedCode },
      { label: 'self', code: payerOwnCode },
    ];

    for (const s of scenarios) {
      await setDefaultCode(client, s.code);
      const before = Date.now();
      const res = await postPrepare(token, { renewalMode: 'fresh' });
      // A11：不阻斷金流——建單照常成功。
      assertEquals(res.body.success, true, `${s.label}：${JSON.stringify(res.body)}`);
      // 上代維持原樣、旗標不變。
      const state = await referralStateOf(client, payer.id);
      assertEquals(state.referred_by_user_id, upline.id, `${s.label}：上代不得改變`);
      assertEquals(state.referred_by_is_default, false, `${s.label}：旗標不得改變`);
      // 留下一筆可追的告警。
      const { data: alerts } = await client
        .from('system_alerts')
        .select('id')
        .eq('message', 'default_referrer_unavailable_on_fresh')
        .eq('context->>user_id', payer.id)
        .gte('created_at', new Date(before - 1000).toISOString());
      assertEquals(
        (alerts?.length ?? 0) >= 1,
        true,
        `${s.label}：應留 default_referrer_unavailable_on_fresh 告警`,
      );
    }
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [upline.id, suspended.id, ...(payer ? [payer.id] : [])]);
  }
});

Deno.test('prepare：原無上代者 fresh 未填碼 → 綁預設推薦人（S12）', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const platform = await createTestUser(client, { name: 'S12 Platform' });
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, platform.id)).error, null);
    const platformCode = await getActiveReferralCode(client, platform.id);

    // 先確保「無上代」狀態成立：清空 default code 再讓 payer 首購。
    await setDefaultCode(client, null);
    payer = await createTestUser(client, { name: 'S12 Payer' });
    assertEquals((await payForUser(client, payer.id)).error, null);
    assertEquals((await referralStateOf(client, payer.id)).referred_by_user_id, null);

    await setDefaultCode(client, platformCode);
    await expireSubscriptions(client, payer.id, 90);

    const token = await getUserAccessToken(client, payer.email);
    const res = await postPrepare(token, { renewalMode: 'fresh' });
    assertEquals(res.body.success, true, JSON.stringify(res.body));

    const state = await referralStateOf(client, payer.id);
    assertEquals(state.referred_by_user_id, platform.id);
    assertEquals(state.referred_by_is_default, true);
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [platform.id, ...(payer ? [payer.id] : [])]);
  }
});

Deno.test('prepare：extend 未填碼完全不動上代（S6）', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const upline = await createTestUser(client, { name: 'S6 Upline' });
  const platform = await createTestUser(client, { name: 'S6 Platform' });
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    assertEquals((await payForUser(client, platform.id)).error, null);
    await setDefaultCode(client, await getActiveReferralCode(client, platform.id));

    const uplineCode = await getActiveReferralCode(client, upline.id);
    payer = await createTestUser(client, { name: 'S6 Payer', referredByCode: uplineCode });
    assertEquals((await payForUser(client, payer.id)).error, null);
    await expireSubscriptions(client, payer.id, 90);

    const token = await getUserAccessToken(client, payer.email);
    const res = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(res.body.success, true, JSON.stringify(res.body));

    const state = await referralStateOf(client, payer.id);
    assertEquals(state.referred_by_user_id, upline.id);
    assertEquals(state.referred_by_code, uplineCode);
    assertEquals(state.referred_by_is_default, false);
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [upline.id, platform.id, ...(payer ? [payer.id] : [])]);
  }
});
