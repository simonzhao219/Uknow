// ============================================================
// issue #395：PayUni 查詢層回非 SUCCESS 時，queryPayUniTradeStatus 必須把
// PayUni 的 Status／Message 帶回來（queryFailure），不能只回一個跟「交易
// 未付款」長得一模一樣的 { stillProcessing: true }。
//
// 帶回來之後由 reconcilePendingOrders 決定要不要告警（見
// reconcile-expire.test.ts）——查詢函式本身不碰資料庫，所以這裡可以是
// 純單元測試：stub fetch，驗回傳形狀。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { encryptPayUni } from './crypto.ts';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';

const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', KEY);
Deno.env.set('PAYUNI_HASH_IV', IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { queryPayUniTradeStatus } = await import('./index.ts');

async function withFetch<T>(body: unknown, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
    );
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test('queryPayUniTradeStatus：查詢層非 SUCCESS → 帶回 PayUni 的 Status 與 Message', async () => {
  const result = await withFetch(
    { Status: 'TRADE_QUERY_ERROR', Message: '參數錯誤' },
    () => queryPayUniTradeStatus('Q395-NOTSUCCESS'),
  );
  assertEquals<unknown>(result, {
    stillProcessing: true,
    queryFailure: { status: 'TRADE_QUERY_ERROR', message: '參數錯誤' },
  });
});

Deno.test('queryPayUniTradeStatus：Status 為 SUCCESS 但缺 EncryptInfo → 也算查詢層失敗', async () => {
  const result = await withFetch(
    { Status: 'SUCCESS' },
    () => queryPayUniTradeStatus('Q395-NOENCRYPT'),
  );
  assertEquals<unknown>(result, {
    stillProcessing: true,
    queryFailure: { status: 'SUCCESS', message: '回應缺少 EncryptInfo' },
  });
});

Deno.test('queryPayUniTradeStatus：非 SUCCESS 且無 Message → 不誤報成缺 EncryptInfo', async () => {
  const result = await withFetch(
    { Status: 'ERROR' },
    () => queryPayUniTradeStatus('Q395-NOMESSAGE'),
  );
  assertEquals<unknown>(result, {
    stillProcessing: true,
    queryFailure: { status: 'ERROR', message: '' },
  });
});

Deno.test('queryPayUniTradeStatus：查詢成功但交易未付款 → 不帶 queryFailure', async () => {
  const encryptInfo = await encryptPayUni(
    { MerTradeNo: 'Q395-UNPAID', TradeStatus: '0' },
    KEY,
    IV,
  );
  const result = await withFetch(
    { Status: 'SUCCESS', EncryptInfo: encryptInfo },
    () => queryPayUniTradeStatus('Q395-UNPAID'),
  );
  assertEquals<unknown>(result, { stillProcessing: true });
});
