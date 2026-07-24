import { describe, it, expect } from 'vitest';
import { computeKingRounds } from './kingProgress';

// 推薦王「當月可多張」（3-B）後，主任務卡片要以「當前輪 + 已達成輪數」
// 呈現，而非單輪 0→8。這支純函式把當月原始人數換算成輪次視圖。
// 決策 (a)：恰好整數倍時顯示滿額（8/8，表本輪剛完成），而非 0/8。
describe('computeKingRounds', () => {
  it('零人：全 0', () => {
    expect(computeKingRounds(0, 8)).toEqual({
      roundsThisMonth: 0,
      currentRoundCount: 0,
      roundProgressPct: 0,
    });
  });

  it('未達一輪：顯示原始進度', () => {
    expect(computeKingRounds(3, 8)).toEqual({
      roundsThisMonth: 0,
      currentRoundCount: 3,
      roundProgressPct: 37.5,
    });
  });

  it('恰一輪：顯示滿額 8/8（決策 a）', () => {
    expect(computeKingRounds(8, 8)).toEqual({
      roundsThisMonth: 1,
      currentRoundCount: 8,
      roundProgressPct: 100,
    });
  });

  it('恰兩輪：顯示滿額 8/8', () => {
    expect(computeKingRounds(16, 8)).toEqual({
      roundsThisMonth: 2,
      currentRoundCount: 8,
      roundProgressPct: 100,
    });
  });

  it('兩輪又 4 人：本輪 4/8', () => {
    expect(computeKingRounds(20, 8)).toEqual({
      roundsThisMonth: 2,
      currentRoundCount: 4,
      roundProgressPct: 50,
    });
  });

  it('防呆：target ≤ 0 一律回 0，不除以零', () => {
    expect(computeKingRounds(5, 0)).toEqual({
      roundsThisMonth: 0,
      currentRoundCount: 0,
      roundProgressPct: 0,
    });
  });
});
