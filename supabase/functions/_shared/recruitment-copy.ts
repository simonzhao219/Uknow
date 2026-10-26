// ============================================================
// 招募文案的共用常數 —— 邀請訊息、邀請卡與 Email 邀請同吃這一份
// ============================================================
//
// 與 @contract 同一個模式:檔案物理放在 Deno 側,前端經 vite/tsconfig 的
// `@recruitment-copy` alias 讀入,正式程式與測試都 import。R2 Email 邀請的
// 後端姓名檢查與信件模板測試也引用這一份——揭露句與禁用字樣只有一個來源,
// 規則見 docs/ui-ux-guidelines.md §13 第 5 條。測試在 src/utils/referralInvite.test.ts
// (經 alias 引入,本檔不另開測試檔)。
// ============================================================

/**
 * 邀請的揭露句(業主裁決逐字)。手冊 4-1-2(2) 要表明推薦人身分;用語「推薦人」
 * 依 ui-ux §12.13。回傳純文字、不做 HTML 跳脫——放進信件模板的呼叫端自行處理。
 *
 * 沒有名字時退回不帶名字的句子(業主 2026-10-25 裁決):能分享的人都已完成會員資料,
 * 實務上到不了,但寧可少名字也不送出「推薦人  發送」這種破句。
 */
export function referralDisclosureSentence(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `本邀請由 Uknow 推薦人 ${trimmed} 發送` : '本邀請由 Uknow 推薦人發送';
}

/**
 * 招募曝光面的固定文案不得出現的字樣。前十二個對應手冊 4-1-1(4)(受僱機會)、
 * 4-1-2(5)(獎金/收入)、(6)(賦稅優惠)、(7)(投資)、(8)(獨家、特許、僱傭或合夥
 * 關係)的禁止事項:受僱、獎金、收入、投資與 (8) 的僱傭/合夥/獨家/特許是手冊字面,
 * 賺、工作、兼職、節稅是依條文意旨補的同義詞。後三個出自業主 2026-10-23 用語裁決。
 */
export const RECRUITMENT_FORBIDDEN_WORDS = [
  '賺',
  '獎金',
  '收入',
  '投資',
  '受僱',
  '工作',
  '兼職',
  '節稅',
  '僱傭',
  '合夥',
  '獨家',
  '特許',
  '傳銷',
  '直銷',
  '下線',
] as const;

/** 回傳文字裡第一個命中的禁用字樣;沒有命中回 undefined。 */
export function findForbiddenWord(text: string): string | undefined {
  return RECRUITMENT_FORBIDDEN_WORDS.find((word) => text.includes(word));
}
