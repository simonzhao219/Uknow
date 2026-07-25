// ============================================================
// POST /webhooks/payuni/notify —— 錢進來變成會籍的主路徑。
//
// 這支端點在 2026-07 之前**零測試**：/payuni/return（瀏覽器導回）有
// payuni-return-status.test.ts 顧著，但 notify 是 server-to-server、
// 是 PayUni 唯一保證會送達的通道，也是唯一由外部主動觸發的寫入端點。
// 它同時是攻擊面最大的一支：能偽造 notify 就等於能免費開通會籍。
//
// 涵蓋四類：
//   A. 簽章與輸入驗證（偽造 / 竄改 / 缺參數 → 一律不得開通）
//   B. 快樂路徑（合法 notify → 訂單完成、訂閱落地）
//   C. 冪等（PayUni 會重送，重放不得重複開通或重複發獎）
//   D. 對外契約（回應形狀 —— 回錯 PayUni 會無限重送）
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { encryptPayUni, generatePayUniHash } from './crypto.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
} from './test-helpers.ts';

// 與 payuni-return-status.test.ts 用同一組值：兩支都在模組載入時寫
// 環境變數，值一致才不會因為載入順序不同而互相踩到。
const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';
const FRONTEND = 'https://frontend.test';
const PRICE = 1200;

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', KEY);
Deno.env.set('PAYUNI_HASH_IV', IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', FRONTEND);

const { app } = await import('./index.ts');

let seq = 0;

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
): Promise<string> {
  const tradeNo = `NOTIFY-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: PRICE,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
  });
  if (error) throw new Error(`seedPendingOrder failed: ${error.message}`);
  return tradeNo;
}

/** 用正確的 HashKey/IV 簽一份合法 notify。 */
async function postNotify(data: Record<string, string | number>) {
  const encryptInfo = await encryptPayUni(data, KEY, IV);
  const hashInfo = await generatePayUniHash(encryptInfo, KEY, IV);
  return await postRaw({ EncryptInfo: encryptInfo, HashInfo: hashInfo });
}

/** 直接送指定的欄位（給偽造 / 缺參數情境用）。 */
async function postRaw(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return await app.request('/api/webhooks/payuni/notify', { method: 'POST', body: form });
}

async function orderStatus(client: ReturnType<typeof adminClient>, tradeNo: string) {
  const { data } = await client
    .from('payment_orders')
    .select('status')
    .eq('transaction_id', tradeNo)
    .single();
  return data?.status ?? null;
}

async function subscriptionCount(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client.from('subscriptions').select('id').eq('user_id', userId);
  return data?.length ?? 0;
}

// ── A. 簽章與輸入驗證 ────────────────────────────────────────────────

Deno.test('偽造簽章：HashInfo 對不上一律拒絕，訂單不得被開通', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Notify Forged' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    // 攻擊者知道 MerTradeNo（它出現在使用者自己的付款流程裡），
    // 於是自己組一份 SUCCESS 內容——但沒有 HashKey，簽不出對的 HashInfo。
    const encryptInfo = await encryptPayUni(
      { Status: 'SUCCESS', MerTradeNo: tradeNo, TradeNo: `PU-${tradeNo}`, TradeAmt: String(PRICE) },
      KEY,
      IV,
    );
    const res = await postRaw({ EncryptInfo: encryptInfo, HashInfo: 'DEADBEEF'.repeat(8) });

    assertEquals(res.status, 200);
    assertEquals((await res.json()).Status, 'FAILED');

    // 最重要的一條：沒開通。
    assertEquals(await orderStatus(client, tradeNo), 'pending');
    assertEquals(await subscriptionCount(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('竄改密文：EncryptInfo 被動過（簽章仍是原文的）一律拒絕', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Notify Tampered' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    const original = await encryptPayUni(
      { Status: 'FAILED', MerTradeNo: tradeNo, TradeNo: `PU-${tradeNo}` },
      KEY,
      IV,
    );
    const hashInfo = await generatePayUniHash(original, KEY, IV);
    // 把密文換成另一份（想改成 SUCCESS），簽章維持舊的
    const swapped = await encryptPayUni(
      { Status: 'SUCCESS', MerTradeNo: tradeNo, TradeNo: `PU-${tradeNo}`, TradeAmt: String(PRICE) },
      KEY,
      IV,
    );

    const res = await postRaw({ EncryptInfo: swapped, HashInfo: hashInfo });
    assertEquals((await res.json()).Status, 'FAILED');
    assertEquals(await orderStatus(client, tradeNo), 'pending');
    assertEquals(await subscriptionCount(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('缺參數：沒有 EncryptInfo / HashInfo 不得炸，回 FAILED', async () => {
  for (const fields of [{}, { EncryptInfo: 'x' }, { HashInfo: 'y' }]) {
    const res = await postRaw(fields as Record<string, string>);
    assertEquals(res.status, 200, `fields=${JSON.stringify(fields)} 應回 200`);
    assertEquals((await res.json()).Status, 'FAILED');
  }
});

Deno.test('金額不符：付 1 元不得換到 1200 元的會籍', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Notify Underpaid' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    const res = await postNotify({
      Status: 'SUCCESS',
      MerTradeNo: tradeNo,
      TradeNo: `PU-${tradeNo}`,
      TradeAmt: '1',
    });

    assertEquals((await res.json()).Status, 'FAILED');
    assertEquals(await orderStatus(client, tradeNo), 'pending');
    assertEquals(await subscriptionCount(client, user.id), 0);

    // 但原始回應仍要存檔：這是卡單自癒的資料來源，
    // 金額不符是「需要人工處理」而不是「當作沒發生過」。
    const { data: order } = await client
      .from('payment_orders')
      .select('payuni_response')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(order?.payuni_response?.Status, 'SUCCESS');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('未知 MerTradeNo：不得 500，回 FAILED', async () => {
  const res = await postNotify({
    Status: 'SUCCESS',
    MerTradeNo: `GHOST-${Date.now()}`,
    TradeNo: 'PU-GHOST',
    TradeAmt: String(PRICE),
  });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).Status, 'FAILED');
});

// ── B. 快樂路徑 ─────────────────────────────────────────────────────

Deno.test('合法 notify：訂單完成、訂閱落地、回 SUCCESS', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Notify Happy' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    const res = await postNotify({
      Status: 'SUCCESS',
      MerTradeNo: tradeNo,
      TradeNo: `PU-${tradeNo}`,
      TradeAmt: String(PRICE),
    });

    assertEquals(res.status, 200);
    assertEquals((await res.json()).Status, 'SUCCESS');
    assertEquals(await orderStatus(client, tradeNo), 'completed');
    assertEquals(await subscriptionCount(client, user.id), 1, '應恰好開通一筆訂閱');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('付款失敗的 notify：訂單標 failed，不開通', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Notify Failed' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    const res = await postNotify({
      Status: 'FAIL',
      MerTradeNo: tradeNo,
      TradeNo: `PU-${tradeNo}`,
      ResCodeMsg: '銀行拒絕授權',
    });

    // 付款失敗對「通知處理」而言是成功處理（PayUni 不需要重送）
    assertEquals((await res.json()).Status, 'SUCCESS');
    assertEquals(await orderStatus(client, tradeNo), 'failed');
    assertEquals(await subscriptionCount(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

// ── C. 冪等 ─────────────────────────────────────────────────────────

Deno.test('重放：同一筆 notify 連送三次只開通一次，不重複發獎', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Notify Referrer' });
  const created = [referrer.id];

  try {
    // 推薦人先自己付款成為有效會員，才會有可用的推薦碼
    const referrerTrade = await seedPendingOrder(client, referrer.id);
    await postNotify({
      Status: 'SUCCESS',
      MerTradeNo: referrerTrade,
      TradeNo: `PU-${referrerTrade}`,
      TradeAmt: String(PRICE),
    });

    const { data: codeRow } = await client
      .from('referral_codes')
      .select('code')
      .eq('user_id', referrer.id)
      .eq('status', 'active')
      .single();
    assert(codeRow?.code, '推薦人付款後應有 active 推薦碼');

    const referee = await createTestUser(client, {
      name: 'Notify Referee',
      referredByCode: codeRow.code,
    });
    created.push(referee.id);
    const tradeNo = await seedPendingOrder(client, referee.id);

    const payload = {
      Status: 'SUCCESS',
      MerTradeNo: tradeNo,
      TradeNo: `PU-${tradeNo}`,
      TradeAmt: String(PRICE),
    };

    // PayUni 在沒收到 SUCCESS 回應時會重送——重放必須是無操作
    for (let i = 0; i < 3; i++) {
      const res = await postNotify(payload);
      assertEquals((await res.json()).Status, 'SUCCESS', `第 ${i + 1} 次通知應成功`);
    }

    assertEquals(await orderStatus(client, tradeNo), 'completed');
    assertEquals(await subscriptionCount(client, referee.id), 1, '重放不得產生第二筆訂閱');

    // 推薦獎勵也不得因為重放而重複發放
    const { data: rewards } = await client
      .from('rewards')
      .select('id')
      .eq('user_id', referrer.id)
      .eq('source_user_id', referee.id);
    assertEquals(rewards?.length, 1, '重放不得重複發推薦獎勵');
  } finally {
    await deleteTestUsers(client, created);
  }
});

// ── D. 對外契約 ─────────────────────────────────────────────────────

Deno.test('契約：回應一律是 HTTP 200 + JSON 的 Status 欄位', async () => {
  // PayUni 判讀的是回應內容而不是 HTTP 狀態碼；回錯形狀（例如讓例外
  // 冒出去變成 500 HTML）會讓它認定未送達而無限重送。
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Notify Contract' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);
    const cases = [
      await postRaw({}),
      await postRaw({ EncryptInfo: 'not-really-encrypted', HashInfo: 'nope' }),
      await postNotify({ Status: 'SUCCESS', MerTradeNo: tradeNo, TradeAmt: String(PRICE) }),
    ];

    for (const [i, res] of cases.entries()) {
      assertEquals(res.status, 200, `case ${i} 應為 200`);
      assertEquals(
        res.headers.get('content-type')?.includes('application/json'),
        true,
        `case ${i} 應為 JSON`,
      );
      const body = await res.json();
      assert(
        body.Status === 'SUCCESS' || body.Status === 'FAILED',
        `case ${i} 的 Status 應為 SUCCESS/FAILED，實際 ${JSON.stringify(body)}`,
      );
    }
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
