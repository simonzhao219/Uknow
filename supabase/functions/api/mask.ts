// ============================================================
// 顯示用姓名遮罩 —— 個資機敏設計的單一真相
// ============================================================
// 「上線看得到的下線姓名」在全站需一致遮罩：一代（直推）全顯，二、三代
// 部分遮罩。推薦樹（GET /referrals/my-tree）與獎勵明細（GET /rewards/history）
// 共用這一份，避免同一個人在兩個畫面遮罩程度不一致。
//
// 規則（與原 /referrals/my-tree 的 maskName 逐字相同）：
//   * gen <= 1 或 單字：不遮罩（直推全顯／無可遮罩空間）。
//   * CJK：保留首末字，中間逐字換成 ○（U+25CB）。
//   * 英數：保留首末字，中間固定 •••（不洩漏長度）。
//
// gen 語意＝「相對於檢視者的世代深度」：獎勵明細中，被推薦人（refereeName）
// 的深度＝該筆 generation；其上線（refereeReferrerName）深度＝generation - 1。
export function maskDisplayName(raw: string | null | undefined, gen: number): string {
  const name = (raw ?? '').trim();
  if (gen <= 1 || name.length <= 1) return name;
  const chars = [...name];
  // CJK 範圍用 \u 逃脫寫死（與原 /referrals/my-tree 相同）：統一表意 U+3400–U+9FFF
  // 與相容表意 U+F900–U+FAFF。用字面「豈」易誤打成 U+8C48 而非 U+F900，故用逃脫。
  const hasHan = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(name);
  if (hasHan) {
    return chars.length === 2
      ? chars[0] + '○'
      : chars[0] + '○'.repeat(chars.length - 2) + chars[chars.length - 1];
  }
  return chars.length === 2 ? chars[0] + '•' : chars[0] + '•••' + chars[chars.length - 1];
}
