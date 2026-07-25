// maskDisplayName 純函式單元測試（個資機敏遮罩的單一真相，見 mask.ts）。
// 遮罩字元用 \u 逃脫比對，避免 ○(U+25CB)/•(U+2022) 的碼位歧義。
import { assertEquals } from 'jsr:@std/assert@1';
import { maskDisplayName } from './mask.ts';

const O = '○'; // ○ CJK 中間遮罩
const D = '•'; // • 英數中間遮罩

Deno.test('maskDisplayName：gen<=1 或單字/空值不遮罩（直推全顯）', () => {
  assertEquals(maskDisplayName('王小明', 1), '王小明');
  assertEquals(maskDisplayName('陳大文', 0), '陳大文');
  assertEquals(maskDisplayName('王', 2), '王');
  assertEquals(maskDisplayName('', 3), '');
  assertEquals(maskDisplayName(null, 3), '');
  assertEquals(maskDisplayName(undefined, 3), '');
});

Deno.test('maskDisplayName：二、三代 CJK 保留首末、中間逐字○', () => {
  assertEquals(maskDisplayName('王小明', 2), '王' + O + '明');
  assertEquals(maskDisplayName('林美玲', 3), '林' + O + '玲');
  assertEquals(maskDisplayName('歐陽子瑜', 2), '歐' + O + O + '瑜'); // 4 字：首 + 2×○ + 末
  assertEquals(maskDisplayName('王明', 2), '王' + O);                // 2 字：首 + ○
});

Deno.test('maskDisplayName：英數保留首末、中間固定 •••（不洩漏長度）', () => {
  assertEquals(maskDisplayName('Alice', 2), 'A' + D + D + D + 'e');
  assertEquals(maskDisplayName('Bob', 2), 'B' + D + D + D + 'b');
  assertEquals(maskDisplayName('Al', 2), 'A' + D);
});
