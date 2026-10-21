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

export type MedalFill = 0 | 0.5 | 1;

/**
 * 任務中心四顆徽章的亮度（畫面稿，業主 2026-10-05）：全暗 0、半亮 0.5、全亮 1。
 *
 * 門檻取 reward_config 的 target，不寫死 8——每顆涵蓋 target/4 人，第 i 顆（i=0..3）的填充是
 * `(4p − i·T) / T` 夾在 0..1：target=8 剛好是「一顆 2 人、奇數半亮、偶數全亮」。target 不是 4
 * 的倍數時用連續比例，不會有重複門檻（target=3 的整數等分是 1/2/3/3），而且「達標＝四顆全亮」
 * 恆成立。填充只取 0／½／1 三階：有進度就至少亮半顆，沒進度全暗。
 *
 * `roundCount` 傳「本輪」人數（computeKingRounds 的 currentRoundCount），不是當月原始累計。
 */
export function medalFills(
  roundCount: number,
  target: number,
): [MedalFill, MedalFill, MedalFill, MedalFill] {
  const t = Number.isFinite(target) && target > 0 ? target : 0;
  const p = Number.isFinite(roundCount) && roundCount > 0 ? roundCount : 0;
  if (t === 0 || p === 0) return [0, 0, 0, 0];
  const fill = (i: number): MedalFill => {
    const covered = 4 * p - i * t; // 以整數比較，避免浮點誤差
    if (covered >= t) return 1;
    return covered > 0 ? 0.5 : 0;
  };
  return [fill(0), fill(1), fill(2), fill(3)];
}
