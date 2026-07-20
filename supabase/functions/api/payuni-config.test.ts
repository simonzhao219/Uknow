// ============================================================
// resolvePayuniConfig：PayUni 環境憑證解析的「設定正確性」測試維度。
//
// 為什麼需要這一維：
//   過去 CI 對 PayUni 只測「解密後的回傳處理邏輯」——每個測試都寫死
//   PAYUNI_SANDBOX=false + 一組正式站憑證，把金流端點整個 mock 掉。
//   e2e 也把 PayUni 全程攔在網路層。於是「payuniConfig() 怎麼挑憑證、
//   挑到哪個端點」這段從來沒有被任何測試碰過。
//
//   線上「付款完都 Fail、錯誤訊息帶(模擬)」的根因就藏在這個缺口裡：
//   舊版對 MerID / HashKey / HashIV 各自 `PAYUNI_TEST_X || PAYUNI_X`
//   逐欄回退，只要測試站憑證缺一角，正式站憑證就被混進 sandbox 端點，
//   PayUni 回傳含「(模擬)」的授權失敗。這裡把該不變式釘死：
//     * mode 由 PAYUNI_SANDBOX 決定；
//     * 每個 mode 只認自己那一套前綴的三個憑證，成套或明確失敗；
//     * 永不跨環境逐欄回退混用。
// ============================================================
import { assertEquals, assertThrows, assertStringIncludes } from 'jsr:@std/assert@1';
import { resolvePayuniConfig } from './index.ts';

// 用一個 plain object 當環境讀取器，完全脫離 Deno.env——純函式、可平行、零副作用。
function reader(env: Record<string, string>): (k: string) => string | undefined {
  return (k) => env[k];
}

const PROD = {
  PAYUNI_MER_ID: 'PRODMER',
  PAYUNI_HASH_KEY: 'prod-key-0123456789abcdef0123456789abcdef',
  PAYUNI_HASH_IV: 'prod-iv-0123',
};
const TEST = {
  PAYUNI_TEST_MER_ID: 'TESTMER',
  PAYUNI_TEST_HASH_KEY: 'test-key-0123456789abcdef0123456789abcdef',
  PAYUNI_TEST_HASH_IV: 'test-iv-0123',
};

Deno.test('production（預設）：用 PAYUNI_* 正式站憑證與正式站端點', () => {
  const cfg = resolvePayuniConfig(reader({ ...PROD }));
  assertEquals(cfg.mode, 'production');
  assertEquals(cfg.merID, 'PRODMER');
  assertEquals(cfg.hashKey, PROD.PAYUNI_HASH_KEY);
  assertEquals(cfg.hashIV, PROD.PAYUNI_HASH_IV);
  assertEquals(cfg.apiUrl, 'https://api.payuni.com.tw/api/upp');
  assertEquals(cfg.queryUrl, 'https://api.payuni.com.tw/api/trade/query');
});

Deno.test('sandbox：用 PAYUNI_TEST_* 測試站憑證與 sandbox 端點', () => {
  const cfg = resolvePayuniConfig(reader({ PAYUNI_SANDBOX: 'true', ...PROD, ...TEST }));
  assertEquals(cfg.mode, 'sandbox');
  assertEquals(cfg.merID, 'TESTMER');
  assertEquals(cfg.hashKey, TEST.PAYUNI_TEST_HASH_KEY);
  assertEquals(cfg.hashIV, TEST.PAYUNI_TEST_HASH_IV);
  assertEquals(cfg.apiUrl, 'https://sandbox-api.payuni.com.tw/api/upp');
  assertEquals(cfg.queryUrl, 'https://sandbox-api.payuni.com.tw/api/trade/query');
});

// ★ 主回歸測：這正是線上「授權失敗(模擬)」的成因。
Deno.test('sandbox 但測試站憑證缺一角：明確拋錯，絕不把正式站憑證混進 sandbox 端點', () => {
  // 只設了 TEST_MER_ID，缺 HASH_KEY / HASH_IV——舊版會逐欄回退成
  // 「測試站 MerID + 正式站金鑰」的 Frankenstein 組合送去 sandbox。
  const err = assertThrows(
    () => resolvePayuniConfig(reader({
      PAYUNI_SANDBOX: 'true',
      ...PROD,
      PAYUNI_TEST_MER_ID: 'TESTMER',
    })),
    Error,
  );
  assertStringIncludes(err.message, 'mode=sandbox');
  assertStringIncludes(err.message, 'PAYUNI_TEST_HASH_KEY');
  assertStringIncludes(err.message, 'PAYUNI_TEST_HASH_IV');
  // 不得洩漏／回退到正式站變數
  assertEquals(err.message.includes('PAYUNI_HASH_KEY '), false);
});

Deno.test('sandbox 但完全沒設測試站憑證：拋錯，不靜默借用正式站憑證打 sandbox', () => {
  // 這就是「線上把 PAYUNI_SANDBOX 誤設為 true、但只有正式站憑證」的情境。
  // 舊版會靜默用正式站三件套打 sandbox → 走到付款頁才吃「授權失敗(模擬)」。
  // 新版在建單當下就擋下，前端顯示「建立訂單失敗」，不會發生模擬扣款。
  const err = assertThrows(
    () => resolvePayuniConfig(reader({ PAYUNI_SANDBOX: 'true', ...PROD })),
    Error,
  );
  assertStringIncludes(err.message, 'PAYUNI_TEST_MER_ID');
  assertStringIncludes(err.message, '(模擬)');
});

Deno.test('production 缺任一正式站憑證：明確列出缺哪個變數', () => {
  const err = assertThrows(
    () => resolvePayuniConfig(reader({
      PAYUNI_MER_ID: 'PRODMER',
      PAYUNI_HASH_KEY: PROD.PAYUNI_HASH_KEY,
      // 缺 PAYUNI_HASH_IV
    })),
    Error,
  );
  assertStringIncludes(err.message, 'mode=production');
  assertStringIncludes(err.message, 'PAYUNI_HASH_IV');
});

Deno.test('空字串／純空白憑證等同未設定（防「設了但其實是空值」的假陽性）', () => {
  assertThrows(
    () => resolvePayuniConfig(reader({
      PAYUNI_MER_ID: '   ',
      PAYUNI_HASH_KEY: PROD.PAYUNI_HASH_KEY,
      PAYUNI_HASH_IV: PROD.PAYUNI_HASH_IV,
    })),
    Error,
    'PAYUNI_MER_ID',
  );
});

Deno.test('PAYUNI_SANDBOX 非字面 "true" 一律視為 production（避免 "1"/"yes" 之類誤開測試站）', () => {
  for (const v of ['false', '1', 'yes', 'TRUE', '']) {
    const cfg = resolvePayuniConfig(reader({ PAYUNI_SANDBOX: v, ...PROD }));
    assertEquals(cfg.mode, 'production', `PAYUNI_SANDBOX=${JSON.stringify(v)} 應為 production`);
  }
});
