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

// ============================================================
// pay P1-3（pg-cron-schedulers 階段 2）：PayUni 官方 TradeStatus 碼表
// （docs.payuni.com.tw「單筆交易查詢 Ver 2.0」，2026-11-05 查證）：
//   0＝取號成功、9＝未付款、4＝交易逾期 → 確認未付款（照舊 4 天後標 expired）
//   1＝已付款 → SUCCESS；2＝付款失敗、3＝付款取消 → FAILED_2／FAILED_3
//   8＝訂單待確認、碼表外、缺欄位 → unknownStatus（業主 2026-11-05 互動選項
//     「當未知交人工」）：永不自動標 expired，交人工確認
//   DataSource＝B（處理中未完整）→ 不論 TradeStatus，本輪不下結論（業主
//     2026-11-05 互動選項「B 一律本輪不下結論」）：資料不完整時收斂可能拿不到
//     付款時間，會籍起算日會錯
// 同號比對：Result 陣列只取 MerTradeNo 相同的那筆（舊行為 `?? list[0]` 會拿到
// 別張單的狀態）；只有一筆且沒帶 MerTradeNo 時照舊接受，避免已付款單收斂不了。
// ============================================================
async function query(fields: Record<string, string | number>, tradeNo = 'P13-TRADE') {
  const encryptInfo = await encryptPayUni(fields, KEY, IV);
  return await withFetch(
    { Status: 'SUCCESS', EncryptInfo: encryptInfo },
    () => queryPayUniTradeStatus(tradeNo),
  );
}

const queryResult = (list: unknown[], tradeNo = 'P13-TRADE') =>
  query({ Result: JSON.stringify(list) }, tradeNo);

Deno.test('queryPayUniTradeStatus：0／4／9（取號成功、逾期、未付款）→ 確認未付款', async () => {
  for (const code of ['0', '4', '9']) {
    assertEquals<unknown>(
      await query({ MerTradeNo: 'P13-TRADE', TradeStatus: code }),
      { stillProcessing: true },
      code,
    );
  }
});

Deno.test('queryPayUniTradeStatus：8（訂單待確認）與碼表外的碼 → unknownStatus', async () => {
  for (const code of ['8', '6', '99']) {
    assertEquals<unknown>(
      await query({ MerTradeNo: 'P13-TRADE', TradeStatus: code }),
      { stillProcessing: true, unknownStatus: { tradeStatus: code, reason: 'unknown_code' } },
      code,
    );
  }
});

Deno.test('queryPayUniTradeStatus：缺 TradeStatus → unknownStatus／missing_field', async () => {
  assertEquals<unknown>(
    await query({ MerTradeNo: 'P13-TRADE' }),
    { stillProcessing: true, unknownStatus: { tradeStatus: '', reason: 'missing_field' } },
  );
});

Deno.test('queryPayUniTradeStatus：DataSource＝B → 不論狀態本輪不下結論（incomplete）', async () => {
  for (const code of ['1', '2', '8', '0']) {
    assertEquals<unknown>(
      await query({ MerTradeNo: 'P13-TRADE', TradeStatus: code, DataSource: 'B' }),
      { stillProcessing: true, incomplete: true },
      code,
    );
  }
});

Deno.test('queryPayUniTradeStatus：1＋DataSource A 或缺漏 → SUCCESS；2／3 → FAILED', async () => {
  for (const extra of [{ DataSource: 'A' }, {}] as Array<Record<string, string>>) {
    const r = await query({ MerTradeNo: 'P13-TRADE', TradeStatus: '1', ...extra });
    assertEquals(r.stillProcessing, false);
    assertEquals(!r.stillProcessing && r.data.Status, 'SUCCESS');
  }
  for (const code of ['2', '3']) {
    const r = await query({ MerTradeNo: 'P13-TRADE', TradeStatus: code });
    assertEquals(!r.stillProcessing && r.data.Status, `FAILED_${code}`);
  }
});

Deno.test('queryPayUniTradeStatus：Result 多筆時取同號那筆，不拿第一筆的已付款', async () => {
  const r = await queryResult([
    { MerTradeNo: 'OTHER-TRADE', TradeStatus: '1' },
    { MerTradeNo: 'P13-TRADE', TradeStatus: '0' },
  ]);
  assertEquals<unknown>(r, { stillProcessing: true });
});

Deno.test('queryPayUniTradeStatus：Result 沒有同號（或平鋪 MerTradeNo 不符）→ no_matching_trade', async () => {
  const unknown = {
    stillProcessing: true,
    unknownStatus: { tradeStatus: '', reason: 'no_matching_trade' },
  };
  assertEquals<unknown>(
    await queryResult([{ MerTradeNo: 'OTHER-TRADE', TradeStatus: '1' }]),
    unknown,
  );
  assertEquals<unknown>(
    await queryResult([
      { MerTradeNo: 'OTHER-A', TradeStatus: '1' },
      { MerTradeNo: 'OTHER-B', TradeStatus: '1' },
    ]),
    unknown,
  );
  assertEquals<unknown>(await query({ MerTradeNo: 'OTHER-TRADE', TradeStatus: '1' }), unknown);
});

Deno.test('queryPayUniTradeStatus：單筆缺 MerTradeNo 或數字型 MerTradeNo → 照舊收斂已付款', async () => {
  const noKey = await queryResult([{ TradeStatus: '1' }]);
  assertEquals(!noKey.stillProcessing && noKey.data.Status, 'SUCCESS');
  const numeric = await queryResult([{ MerTradeNo: 20261105, TradeStatus: '1' }], '20261105');
  assertEquals(!numeric.stillProcessing && numeric.data.Status, 'SUCCESS');
  const padded = await query({ MerTradeNo: ' P13-TRADE ', TradeStatus: '1' });
  assertEquals(!padded.stillProcessing && padded.data.Status, 'SUCCESS');
});
