import { describe, it, expect } from 'vitest';
import { computeKingRounds, type MedalFill, medalFills } from './kingProgress';

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

// 任務中心的四顆徽章＝本輪進度（畫面稿，業主 2026-10-05）：奇數半亮、偶數全亮。
// 門檻取 reward_config 的 target，不寫死 8：每顆涵蓋 target/4 人，進度換算成 0／½／1。
// target=8 剛好是 2／4／6／8；target 不是 4 的倍數時用連續比例，不會有重複門檻，
// 而且「達標（人數 ≥ target）＝四顆全亮」恆成立。
describe('medalFills', () => {
  it.each<[number, number, MedalFill[]]>([
    // target=8：一顆＝2 人
    [0, 8, [0, 0, 0, 0]],
    [1, 8, [0.5, 0, 0, 0]],
    [2, 8, [1, 0, 0, 0]],
    [3, 8, [1, 0.5, 0, 0]],
    [4, 8, [1, 1, 0, 0]],
    [5, 8, [1, 1, 0.5, 0]],
    [7, 8, [1, 1, 1, 0.5]],
    [8, 8, [1, 1, 1, 1]],
    // target 不是 4 的倍數：每顆涵蓋 target/4 人
    [1, 5, [0.5, 0, 0, 0]],
    [2, 5, [1, 0.5, 0, 0]],
    [4, 5, [1, 1, 1, 0.5]],
    [5, 5, [1, 1, 1, 1]],
    [6, 10, [1, 1, 0.5, 0]],
    [1, 3, [1, 0.5, 0, 0]],
    [2, 3, [1, 1, 0.5, 0]],
    [3, 3, [1, 1, 1, 1]],
    [1, 1, [1, 1, 1, 1]],
  ])('本輪 %i 人、門檻 %i 時四顆為 %j', (roundCount, target, expected) => {
    expect(medalFills(roundCount, target)).toEqual(expected);
  });

  it('達標（本輪人數 ≥ 門檻）時四顆全亮，不管門檻是不是 4 的倍數', () => {
    for (let target = 1; target <= 24; target += 1) {
      expect(medalFills(target, target), `target=${target}`).toEqual([1, 1, 1, 1]);
    }
  });

  it('有進度就至少亮半顆，沒進度全暗', () => {
    for (let target = 1; target <= 24; target += 1) {
      expect(medalFills(0, target)).toEqual([0, 0, 0, 0]);
      expect(medalFills(1, target)[0], `target=${target}`).toBeGreaterThan(0);
    }
  });

  it('亮度不隨人數倒退', () => {
    for (const target of [3, 5, 8, 10, 13]) {
      let previous = 0;
      for (let count = 0; count <= target; count += 1) {
        const total = medalFills(count, target).reduce<number>((sum, f) => sum + f, 0);
        expect(total, `target=${target} count=${count}`).toBeGreaterThanOrEqual(previous);
        previous = total;
      }
    }
  });

  it('防呆：門檻 ≤ 0 或人數無效一律全暗，不除以零', () => {
    expect(medalFills(5, 0)).toEqual([0, 0, 0, 0]);
    expect(medalFills(Number.NaN, 8)).toEqual([0, 0, 0, 0]);
    expect(medalFills(-1, 8)).toEqual([0, 0, 0, 0]);
  });
});
