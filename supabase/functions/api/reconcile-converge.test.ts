// ============================================================
// 對帳端點的真實收斂：queryPayUniTradeStatus → resolveOrderFromPayUni →
// process_successful_payment，只有 PayUni 的 HTTP 回應是假的。
//
// 主 session 審查 P2（MerTradeNo）：同號比對接受「單筆缺 MerTradeNo」與
// 「前後帶空白」之後，交給 resolveOrderFromPayUni 的 data 若沿用原值，會回
// missing MerTradeNo，或 `.eq('transaction_id', …)` 對不到單，進而發出誤導的
// 「錢已收、找不到訂單」告警。比對成立後 data.MerTradeNo 一律改成請求的單號。
// 這裡驗的是訂單真的被收斂成 completed，而不只是 Status=SUCCESS。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { encryptPayUni } from './crypto.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
} from './test-helpers.ts';

// 與 payuni-notify*.test.ts 同一組值：各檔都在模組載入時寫環境變數。
const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';
const PRICE = 1200;

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', KEY);
Deno.env.set('PAYUNI_HASH_IV', IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');
Deno.env.set('RECONCILE_SECRET', 'reconcile-converge-test-secret');

const { app } = await import('./index.ts');

async function seedPendingOrder(userId: string, tradeNo: string) {
  const { error } = await adminClient().from('payment_orders').insert({
    user_id: userId,
    amount: PRICE,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  });
  if (error) throw new Error(`seed pending order failed: ${error.message}`);
}

/** 只攔 PayUni 的請求；Supabase 的請求照常送到本機 DB。 */
async function withPayUni<T>(decrypted: Record<string, string>, fn: () => Promise<T>) {
  const encryptInfo = await encryptPayUni(decrypted, KEY, IV);
  const real = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('payuni')) {
      return Promise.resolve(
        new Response(JSON.stringify({ Status: 'SUCCESS', EncryptInfo: encryptInfo }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return real(input, init);
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

async function runReconcile() {
  const res = await app.request('/api/internal/reconcile-pending-payments', {
    method: 'POST',
    headers: {
      'x-internal-secret': 'reconcile-converge-test-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger: 'manual' }),
  });
  await res.body?.cancel();
}

async function orderStatus(tradeNo: string) {
  const { data } = await adminClient().from('payment_orders').select('status')
    .eq('transaction_id', tradeNo).single();
  return data?.status;
}

async function notFoundAlerts(tradeNo: string) {
  const { data } = await adminClient().from('system_alerts').select('id')
    .eq('source', 'resolveOrderFromPayUni').eq('context->>merTradeNo', tradeNo);
  return data ?? [];
}

const trade = (tag: string, userId: string) => `CONV-${tag}-${userId.slice(0, 8)}`;

Deno.test('對帳收斂：Result 單筆缺 MerTradeNo 的已付款 → 訂單收斂為 completed，不誤報找不到訂單', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Converge No MerTradeNo' });
  const tradeNo = trade('NOKEY', user.id);
  try {
    await seedPendingOrder(user.id, tradeNo);
    await withPayUni(
      { Result: JSON.stringify([{ TradeStatus: '1', TradeAmt: String(PRICE) }]) },
      runReconcile,
    );
    assertEquals(await orderStatus(tradeNo), 'completed');
    assertEquals(await notFoundAlerts(tradeNo), []);
  } finally {
    await client.from('system_alerts').delete().eq('context->>merTradeNo', tradeNo);
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('對帳收斂：平鋪 MerTradeNo 前後帶空白的已付款 → 訂單收斂為 completed', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Converge Padded' });
  const tradeNo = trade('PAD', user.id);
  try {
    await seedPendingOrder(user.id, tradeNo);
    await withPayUni(
      { MerTradeNo: ` ${tradeNo} `, TradeStatus: '1', TradeAmt: String(PRICE) },
      runReconcile,
    );
    assertEquals(await orderStatus(tradeNo), 'completed');
    assertEquals(await notFoundAlerts(tradeNo), []);
  } finally {
    await client.from('system_alerts').delete().eq('context->>merTradeNo', tradeNo);
    await deleteTestUsers(client, [user.id]);
  }
});
