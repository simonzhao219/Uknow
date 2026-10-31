// ============================================================
// PayUni 非 SUCCESS 回應的分類：商店／設定類（一人遇到就告警）vs 使用者層
// （單筆不告警，只看多使用者連續失敗）。
//
// 起因：10/28 正式站原商店「網路商店停用」，PayUni 回 `DEF01006 商店狀態
// 不符合`，每個人都付不了卻零告警（launch-wave-1 plan §8）。判準取自實證：
//   * 正式站 10/28 兩筆 DEF01006、develop sandbox UPP02085（商店尚未啟用電子
//     發票），payuni_response 都只有 5 鍵 [MerID, MerTradeNo, Message,
//     Status, TradeAmt]——沒有 ResCode，代表在建單層就被拒、沒走到授權。
//   * 同日一筆 CREDIT05002 授權失敗，23 鍵含 ResCode／AuthBank——持卡人層。
// 純函式、不碰資料庫，所以是 unit 測試。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { classifyPayUniRejection, isFailureBurst } from './payuni-rejection.ts';

const SHORT = (Status: string, Message: string) => ({
  MerID: 'MER',
  MerTradeNo: 'T1',
  Message,
  Status,
  TradeAmt: '1200',
});

Deno.test('classifyPayUniRejection：正式站實證 DEF01006 商店狀態不符合 → merchant', () => {
  assertEquals(classifyPayUniRejection(SHORT('DEF01006', '商店狀態不符合')), 'merchant');
});

Deno.test('classifyPayUniRejection：sandbox 實證 UPP02085 商店尚未啟用電子發票 → merchant', () => {
  assertEquals(classifyPayUniRejection(SHORT('UPP02085', '商店尚未啟用電子發票')), 'merchant');
});

Deno.test('classifyPayUniRejection：未列入清單但無 ResCode 的建單層拒絕 → merchant', () => {
  assertEquals(classifyPayUniRejection(SHORT('UPP09999', '未知建單錯誤')), 'merchant');
});

Deno.test('classifyPayUniRejection：CREDIT05002 授權失敗（帶 ResCode）→ user', () => {
  assertEquals(
    classifyPayUniRejection({
      ...SHORT('CREDIT05002', '授權失敗'),
      ResCode: '05',
      ResCodeMsg: '拒絕交易',
      AuthBank: '822',
    }),
    'user',
  );
});

Deno.test('classifyPayUniRejection：已知商店碼即使帶 ResCode 仍是 merchant', () => {
  assertEquals(
    classifyPayUniRejection({ ...SHORT('DEF01006', '商店狀態不符合'), ResCode: '' }),
    'merchant',
  );
});

Deno.test('classifyPayUniRejection：對帳合成的 FAILED_2／FAILED_3 → user（不是 PayUni 原碼）', () => {
  assertEquals(classifyPayUniRejection({ MerTradeNo: 'T1', Status: 'FAILED_2' }), 'user');
  assertEquals(classifyPayUniRejection({ MerTradeNo: 'T1', Status: 'FAILED_3' }), 'user');
});

Deno.test('isFailureBurst：不同使用者數達門檻才算，同一人重試多次不算', () => {
  assertEquals(isFailureBurst(['a', 'b']), false);
  assertEquals(isFailureBurst(['a', 'a', 'a', 'a']), false);
  assertEquals(isFailureBurst(['a', 'b', 'c']), true);
  assertEquals(isFailureBurst(['a', 'b', 'a', 'c']), true);
});
