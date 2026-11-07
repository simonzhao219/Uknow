// ============================================================
// /payuni/prepare 的 Edge 層（第 5 波 S6 階段 3；ref P0-1＝pay P0-1、ref P0-2、pay P1-1、pay P1-4）。
//
// prepare 不再寫 profiles：新約的換線意圖只傳給建單 RPC（存在訂單上），付款成功時才換線。
// 新拒絕形狀同停權 403（`{ success:false, error:{ code, message } }`，PrepareErrorBodySchema）：
//   RENEWAL_MODE_REQUIRED 400（曾訂閱者不帶續費模式）、REFERRAL_CYCLE 400（新推薦碼在自己的
//   推薦樹內）、PAYMENT_PENDING_ACTIVATION 409（已付款待開通，帶 lastTradeNo）。
// 停權仍優先（403 先於這些 400）。
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
  seedPaidAwaitingActivation,
} from './test-helpers.ts';
import {
  assertShape,
  PAYMENT_PENDING_ACTIVATION,
  PrepareErrorBodySchema,
  REFERRAL_CYCLE,
  RENEWAL_MODE_REQUIRED,
} from '../_shared/api-contract.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

type Client = ReturnType<typeof adminClient>;

async function postPrepare(token: string, body?: Record<string, unknown>) {
  const res = await app.request('/api/payuni/prepare', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

async function expire(client: Client, userId: string) {
  const past = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { error } = await client.from('subscriptions')
    .update({ end_date: past, grace_period_end: past }).eq('user_id', userId);
  assertEquals(error, null);
}

// 付過一次款的會員（有訂閱、有推薦碼）；referredByCode 時以該碼為推薦人。
async function member(client: Client, ids: string[], name: string, referredByCode?: string) {
  const u = await createTestUser(client, { name, referredByCode });
  ids.push(u.id);
  assertEquals((await payForUser(client, u.id)).error, null);
  return u;
}

async function referrerOf(client: Client, userId: string) {
  const { data: p } = await client.from('profiles').select('referred_by_user_id')
    .eq('id', userId).single();
  const { data: e } = await client.from('referral_edges').select('referrer_user_id')
    .eq('referee_user_id', userId).maybeSingle();
  return { profile: p?.referred_by_user_id ?? null, edge: e?.referrer_user_id ?? null };
}

async function completeOrder(client: Client, userId: string, tradeNo: string) {
  const { error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: `PU-${tradeNo}`,
    p_payuni_response: { Status: 'SUCCESS' },
  });
  assertEquals(error, null);
}

Deno.test('prepare：新約填別人的碼後棄單、改付續約 → 推薦人與推薦邊都不變', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const y = await member(client, ids, 'Edge 棄單 原推薦人');
    const x = await member(client, ids, 'Edge 棄單 新推薦人');
    const m = await member(
      client,
      ids,
      'Edge 棄單 會員',
      await getActiveReferralCode(client, y.id),
    );
    await expire(client, m.id);
    const token = await getUserAccessToken(client, m.email);

    const fresh = await postPrepare(token, {
      renewalMode: 'fresh',
      referredByCode: await getActiveReferralCode(client, x.id),
    });
    assertEquals(fresh.body.success, true, JSON.stringify(fresh.body));
    assertEquals(await referrerOf(client, m.id), { profile: y.id, edge: y.id }, '建單不動推薦人');

    const ext = await postPrepare(token, { renewalMode: 'extend' });
    assertEquals(ext.body.success, true, JSON.stringify(ext.body));
    await completeOrder(client, m.id, ext.body.data.tradeNo);
    assertEquals(await referrerOf(client, m.id), { profile: y.id, edge: y.id });
  } finally {
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare：曾訂閱者不帶續費模式 → 400 RENEWAL_MODE_REQUIRED', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const m = await member(client, ids, 'Edge 無模式');
    await expire(client, m.id);
    const res = await postPrepare(await getUserAccessToken(client, m.email));
    assertEquals(res.status, 400);
    assertShape(PrepareErrorBodySchema, res.body, 'prepare 400');
    assertEquals(res.body.error.code, RENEWAL_MODE_REQUIRED);
  } finally {
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare：新約填自己一代的碼 → 400 REFERRAL_CYCLE 且不建單', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const m = await member(client, ids, 'Edge 環 會員');
    const d = await member(client, ids, 'Edge 環 一代', await getActiveReferralCode(client, m.id));
    await expire(client, m.id);
    const res = await postPrepare(await getUserAccessToken(client, m.email), {
      renewalMode: 'fresh',
      referredByCode: await getActiveReferralCode(client, d.id),
    });
    assertEquals(res.status, 400);
    assertShape(PrepareErrorBodySchema, res.body, 'prepare 400');
    assertEquals(res.body.error.code, REFERRAL_CYCLE);
    const { data: orders } = await client.from('payment_orders').select('id')
      .eq('user_id', m.id).eq('status', 'pending');
    assertEquals(orders?.length ?? 0, 0);
  } finally {
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare：已付款待開通 → 409 PAYMENT_PENDING_ACTIVATION 帶 lastTradeNo', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const m = await member(client, ids, 'Edge 待開通');
    await expire(client, m.id);
    const paid = await seedPaidAwaitingActivation(client, m.id);
    const res = await postPrepare(await getUserAccessToken(client, m.email), {
      renewalMode: 'extend',
    });
    assertEquals(res.status, 409);
    assertShape(PrepareErrorBodySchema, res.body, 'prepare 409');
    assertEquals(res.body.error.code, PAYMENT_PENDING_ACTIVATION);
    assertEquals(res.body.lastTradeNo, paid);
  } finally {
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare：停權的曾訂閱者不帶模式 → 仍先回 403 停權', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const m = await member(client, ids, 'Edge 停權優先');
    await expire(client, m.id);
    await client.from('profiles').update({ suspended_at: new Date().toISOString() }).eq('id', m.id);
    const res = await postPrepare(await getUserAccessToken(client, m.email));
    assertEquals(res.status, 403);
  } finally {
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare：首購者送新約與推薦碼 → 訂單不帶換線意圖', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const x = await member(client, ids, 'Edge 首購 別人');
    const u = await createTestUser(client, { name: 'Edge 首購 會員' });
    ids.push(u.id);
    const res = await postPrepare(await getUserAccessToken(client, u.email), {
      renewalMode: 'fresh',
      referredByCode: await getActiveReferralCode(client, x.id),
    });
    assertEquals(res.body.success, true, JSON.stringify(res.body));
    const { data: o } = await client.from('payment_orders')
      .select('fresh_referrer_user_id, fresh_referrer_source')
      .eq('transaction_id', res.body.data.tradeNo).single();
    assertEquals(o, { fresh_referrer_user_id: null, fresh_referrer_source: null });
  } finally {
    await deleteTestUsers(client, ids);
  }
});
