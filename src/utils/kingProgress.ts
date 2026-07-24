// ============================================================
// 推薦王「當月可多張」（3-B）的輪次換算。後端計數（當月 distinct 新推薦
// 人數）是唯一真相，這支純函式只把它換算成主任務卡片要的「當前輪 + 已達
// 成輪數」視圖，不影響任何計數/金流邏輯。
// ============================================================

export interface KingRounds {
  /** 本月已達成輪數 = floor(current / target)。 */
  roundsThisMonth: number;
  /** 當前輪顯示人數。決策 (a)：恰好整數倍時顯示滿額（target，表本輪剛完成），而非 0。 */
  currentRoundCount: number;
  /** 當前輪百分比（0..100），供進度條寬度/顏色使用。 */
  roundProgressPct: number;
}

export function computeKingRounds(current: number, target: number): KingRounds {
  const t = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
  const c = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;

  if (t === 0) {
    return { roundsThisMonth: 0, currentRoundCount: 0, roundProgressPct: 0 };
  }

  const roundsThisMonth = Math.floor(c / t);
  const remainder = c % t;
  // 決策 (a)：整數倍（且非 0）時，本輪顯示滿額而非歸零。
  const currentRoundCount = c > 0 && remainder === 0 ? t : remainder;
  const roundProgressPct = (currentRoundCount / t) * 100;

  return { roundsThisMonth, currentRoundCount, roundProgressPct };
}
