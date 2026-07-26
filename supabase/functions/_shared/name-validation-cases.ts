// 姓名格式規則的共用案例表(規劃書 §2.2)。
//
// 為什麼獨立成一支、而不是寫在測試檔裡:階段 1(前端 vitest)與階段 2
// (後端 Deno)必須跑**同一份**案例。兩個 runtime 隔離,規則必然各寫一份
// 實作;案例表共用是唯一能在「單邊改了規則、另一邊忘了同步」的當下就紅燈
// 的機制。`validateNationalId` 前端有、後端長期缺席那類漂移,就是因為兩側
// 各自為政且沒有共同的釘子。
//
// 本檔刻意不 import 任何東西,Deno 側可直接引用。
//
// 新增規則邊界時請補進這裡,不要只補單側。

export interface NameCase {
  input: string;
  /** 中文模式(前端嚴格把關)是否通過 */
  zh: boolean;
  /** 外文模式(前端嚴格把關)是否通過 */
  foreign: boolean;
}

/** 後端採聯集:合乎中文規則**或**外文規則即通過(見 §2.2 的不對稱設計)。 */
export function backendAccepts(c: NameCase): boolean {
  return c.zh || c.foreign;
}

export const NAME_CASES: readonly NameCase[] = [
  // --- 中文模式合法 ---
  { input: '王小明', zh: true, foreign: false },
  { input: '王', zh: true, foreign: false },
  { input: '谷辣斯 尤達卡', zh: true, foreign: false }, // 音譯姓名改以半形空格分隔
  { input: '\u3400\u3400', zh: true, foreign: false }, // CJK 擴充 A 區下界(同理用跳脫)
  // 相容表意文字下界(U+F900)。**必須用 \u 跳脫**:字面「豈」會被編輯器/git
  // NFC 正規化成同形的 U+8C48(這正是 index.ts 的 HAN_RANGE 註解記載的同一起
  // 事故),而 U+8C48 本來就落在主範圍 \u3400-\u9FFF 內——探針因此完全沒有
  // 測到 \uF900-\uFAFF 這段是否真的被涵蓋,砍掉它所有測試仍會全綠。
  { input: '\uF900\uF900', zh: true, foreign: false },
  // --- 空格文法探針(v3 審查 P1:原案例表完全沒有這個維度)---
  { input: '王 小 明', zh: false, foreign: false }, // 兩個空格
  { input: '谷 辣', zh: false, foreign: false }, // 空格兩邊各只有 1 字
  // --- 外文模式合法 ---
  { input: 'John Smith', zh: false, foreign: true },
  { input: 'JOHN SMITH', zh: false, foreign: true }, // 人審裁決:接受全大寫
  { input: 'Mary Jane Watson', zh: false, foreign: true },
  { input: 'Peter', zh: false, foreign: true }, // 切換鈕強制力探針:中文模式必須拒
  // --- 兩模式皆不合法 ---
  { input: 'john smith', zh: false, foreign: false }, // 首字母未大寫
  { input: 'z1234567m', zh: false, foreign: false }, // 觸發本規劃的那類值
  { input: 'testuser', zh: false, foreign: false },
  { input: '王John', zh: false, foreign: false },
  { input: '王小明123', zh: false, foreign: false },
  { input: '谷辣斯·尤達卡', zh: false, foreign: false }, // 間隔號不放行,改用空格
  { input: ' 王小明', zh: false, foreign: false },
  { input: '王小明 ', zh: false, foreign: false },
  { input: '王  小明', zh: false, foreign: false },
];
