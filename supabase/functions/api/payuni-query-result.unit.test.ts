// ============================================================
// W7-16：PayUni 交易查詢解密結果的結果列解析（payuni-query-result.ts）。
// 官方形狀是 http_build_query 的 `Result[i][欄位]` 鍵名；JSON 字串 Result 與平鋪欄位保留。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  describeDecryptedShape,
  extractPayUniTrades,
  pickSameTrade,
  withQueryPayTime,
} from './payuni-query-result.ts';

Deno.test('extractPayUniTrades：Result[i][欄位] 鍵名 → 依 i 數值排序成陣列、其他鍵不混入', () => {
  assertEquals(
    extractPayUniTrades({
      Status: 'SUCCESS',
      'Result[10][MerTradeNo]': 'C',
      'Result[2][MerTradeNo]': 'B',
      'Result[0][MerTradeNo]': 'A',
      'Result[0][TradeStatus]': '1',
      'Result[2][TradeStatus]': '9',
    }),
    [
      { MerTradeNo: 'A', TradeStatus: '1' },
      { MerTradeNo: 'B', TradeStatus: '9' },
      { MerTradeNo: 'C' },
    ],
  );
});

Deno.test('extractPayUniTrades：Result 是 JSON 陣列字串 → 陣列（值轉字串、非物件略過）', () => {
  assertEquals(
    extractPayUniTrades({ Result: JSON.stringify([{ MerTradeNo: 123, TradeStatus: 1 }, 'x']) }),
    [{ MerTradeNo: '123', TradeStatus: '1' }],
  );
});

Deno.test('extractPayUniTrades：平鋪欄位、Result 不是 JSON → null（呼叫端當單筆）', () => {
  assertEquals(extractPayUniTrades({ MerTradeNo: 'A', TradeStatus: '1' }), null);
  assertEquals(extractPayUniTrades({ Result: 'not json' }), null);
});

Deno.test('extractPayUniTrades：Result[i] 鍵名優先於同時存在的 JSON Result', () => {
  assertEquals(
    extractPayUniTrades({ Result: '[]', 'Result[0][MerTradeNo]': 'A' }),
    [{ MerTradeNo: 'A' }],
  );
});

Deno.test('withQueryPayTime：只有 PaymentDay → 補 PayTime；已有 PayTime 或缺 PaymentDay 不動', () => {
  assertEquals(withQueryPayTime({ PaymentDay: '2026-10-28 18:55:30' }), {
    PaymentDay: '2026-10-28 18:55:30',
    PayTime: '2026-10-28 18:55:30',
  });
  assertEquals(withQueryPayTime({ PaymentDay: 'x', PayTime: 'y' }), {
    PaymentDay: 'x',
    PayTime: 'y',
  });
  assertEquals(withQueryPayTime({ TradeStatus: '1' }), { TradeStatus: '1' });
});

Deno.test('extractPayUniTrades：前導 0 的索引（Result[01]）不認，不與 Result[1] 併成同一列', () => {
  assertEquals(
    extractPayUniTrades({ 'Result[1][MerTradeNo]': 'A', 'Result[01][TradeStatus]': '1' }),
    [{ MerTradeNo: 'A' }],
  );
});

Deno.test('pickSameTrade：無同號 → none；同號有已付款 → 取已付款；衝突無已付款 → conflict', () => {
  const rows = [
    { MerTradeNo: 'T1', TradeStatus: '2' },
    { MerTradeNo: 'OTHER', TradeStatus: '1' },
    { MerTradeNo: 'T1', TradeStatus: '1' },
  ];
  assertEquals(pickSameTrade(rows, 'T9'), { kind: 'none' });
  assertEquals(pickSameTrade(rows, ' T1 '), { kind: 'one', trade: rows[2] });
  assertEquals(
    pickSameTrade(
      [{ MerTradeNo: 'T1', TradeStatus: '2' }, { MerTradeNo: 'T1', TradeStatus: '3' }],
      'T1',
    ),
    { kind: 'conflict' },
  );
  assertEquals(pickSameTrade([{ MerTradeNo: 'T1', TradeStatus: '9' }], 'T1'), {
    kind: 'one',
    trade: { MerTradeNo: 'T1', TradeStatus: '9' },
  });
});

Deno.test('describeDecryptedShape：不像鍵名的鍵（無 = 的片段整段當鍵）→ 只記長度', () => {
  const decrypted = Object.fromEntries(new URLSearchParams('S1|1|secret&Status=SUCCESS'));
  assertEquals(describeDecryptedShape(decrypted), 'keys=?(len=11),Status Result=absent');
});
