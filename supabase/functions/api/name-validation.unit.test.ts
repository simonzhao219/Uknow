// ============================================================
// 姓名格式驗證(後端)的純函式契約:
//   * 後端採**聯集**規則——合乎中文規則或外文規則即通過。前端依切換鈕狀態
//     嚴格把關(中文模式拒 `Peter`),後端不能:它只收到姓名字串,就算前端
//     多送一個模式旗標,攻擊者也只要宣稱自己是外文模式即可繞過。兩者職責
//     不同(規劃書 §2.2)。
//   * 案例表與前端共用同一份 `src/utils/nameValidationCases.ts`。兩個 runtime
//     隔離、規則必然各寫一份實作,共用案例表是唯一能在「單邊改了規則、另一邊
//     忘了同步」的當下就紅燈的機制。
//   * 型別防禦:非字串輸入回「格式不符」而**不得拋錯**。`PUT /auth/profile`
//     的觸發條件是 `'name' in body`,只檢查鍵存在、不檢查型別。
//   * 與 `maskNameByGen` 的認定一致:通過驗證的中文姓名經 gen=2 遮罩必為
//     中文樣式,否則會出現「通過驗證卻仍顯示英數樣式遮罩」——原地重現本次
//     要解決的症狀。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { backendAccepts, NAME_CASES } from '../../../src/utils/nameValidationCases.ts';
import { maskNameByGen, validateNameFormat } from './index.ts';

Deno.test('validateNameFormat：共用案例表的聯集期望值全數符合', () => {
  for (const c of NAME_CASES) {
    const err = validateNameFormat(c.input);
    assertEquals(
      err === undefined,
      backendAccepts(c),
      `「${c.input}」後端應${backendAccepts(c) ? '通過' : '被拒'}(實際訊息:${err}）`,
    );
  }
});

Deno.test('validateNameFormat：中文與外文各自的合法值都通過聯集', () => {
  // 聯集的意思:同一支函式同時放行兩種形狀,不需要知道使用者選了哪個模式。
  assertEquals(validateNameFormat('王小明'), undefined);
  assertEquals(validateNameFormat('谷辣斯 尤達卡'), undefined);
  assertEquals(validateNameFormat('John Smith'), undefined);
  assertEquals(validateNameFormat('JOHN SMITH'), undefined);
  // Peter 在前端的中文模式被拒,但後端必須放行——它是合法的外文姓名,
  // 而後端無從得知使用者當下選的是哪個模式。
  assertEquals(validateNameFormat('Peter'), undefined);
});

Deno.test('validateNameFormat：任何模式都不合法的值被拒', () => {
  for (const bad of ['z1234567m', 'testuser', '王John', '王小明123', 'john smith']) {
    assert(validateNameFormat(bad) !== undefined, `「${bad}」應被拒`);
  }
});

Deno.test('validateNameFormat：非字串輸入回格式不符而不拋錯', () => {
  // HAN_RANGE 那段註解記載的正是「未防禦邊界輸入導致 500」的事故;同檔
  // verifyNationalId 的 `(idNumber ?? '').trim()` 對數字一樣會拋未捕捉例外。
  for (const bad of [null, undefined, 123, {}, [], true]) {
    const err = validateNameFormat(bad);
    assert(typeof err === 'string', `${JSON.stringify(bad)} 應回字串訊息,實際 ${err}`);
  }
});

Deno.test('validateNameFormat：超長被拒,聯集上限為 50', () => {
  assertEquals(validateNameFormat(`A${'a'.repeat(49)}`), undefined);
  assert(validateNameFormat(`A${'a'.repeat(50)}`) !== undefined);
});

Deno.test('validateNameFormat：分隔符號類標點被拒且訊息引導改用半形空格', () => {
  // 不靠碼點清單窮舉——只鎖 U+00B7/U+2027/U+30FB 會讓 bullet、半形中點、
  // 全形空格等變體漏網,原地重現同一個死巷,只是換一個字元觸發。
  for (const sep of ['·', '‧', '・', '•', '･', '　']) {
    const err = validateNameFormat(`谷辣斯${sep}尤達卡`);
    assert(err?.includes('半形空格'), `分隔符號 ${sep} 應回引導訊息,實際 ${err}`);
  }
});

Deno.test('validateNameFormat 與 maskNameByGen：通過驗證的中文姓名必得中文遮罩', () => {
  // 兩者對「什麼算中文」的認定若漂移,會出現「通過驗證卻在推薦網絡頁顯示
  // 英數樣式遮罩」——那正是觸發本規劃的症狀(截圖裡的 z···m)。
  for (const c of NAME_CASES) {
    if (!c.zh) continue;
    assertEquals(validateNameFormat(c.input), undefined, `「${c.input}」應通過驗證`);
    const masked = maskNameByGen(c.input, 2);
    if ([...c.input].length <= 1) continue; // 單字姓名不遮罩,原樣回傳
    assert(
      masked.includes('○'),
      `「${c.input}」通過中文規則卻得到非中文樣式遮罩「${masked}」`,
    );
    assert(!masked.includes('•'), `「${c.input}」不應套用英數樣式遮罩「${masked}」`);
  }
});

Deno.test('validateNameFormat：空值與純空白被拒', () => {
  for (const bad of ['', '   ']) {
    assert(validateNameFormat(bad) !== undefined, `「${bad}」應被拒`);
  }
});
