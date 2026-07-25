import { describe, it, expect } from 'vitest';
import { REWARD_SOURCE_CATEGORIES } from '@contract';
import {
  ALL_REWARD_FILTER,
  REWARD_FILTER_GROUPS,
  REWARD_SOURCE_LABELS,
  findRewardFilterGroup,
  isRewardFilterActive,
  rewardFilterLabel,
  selectRewardFilterGroup,
  toRewardSourceParam,
} from './rewardHistoryFilter';

describe('toRewardSourceParam', () => {
  it('全部：回空字串（呼叫端不帶 ?source=）', () => {
    expect(toRewardSourceParam(ALL_REWARD_FILTER)).toBe('');
  });

  it('只選群組：帶整群 CSV，篩選與 count 都在 DB 端算', () => {
    expect(toRewardSourceParam({ group: 'referral', source: null })).toBe(
      'referral_payment,referral_task_renewal',
    );
    expect(toRewardSourceParam({ group: 'withdrawal', source: null })).toBe(
      'withdrawal,withdrawal_refund',
    );
  });

  it('選到細分：只帶該分類', () => {
    expect(toRewardSourceParam({ group: 'referral', source: 'referral_task_renewal' })).toBe(
      'referral_task_renewal',
    );
    expect(toRewardSourceParam({ group: 'withdrawal', source: 'withdrawal_refund' })).toBe(
      'withdrawal_refund',
    );
  });
});

describe('isRewardFilterActive', () => {
  it('只有「全部」不算篩選中（逐列餘額僅在此檢視顯示）', () => {
    expect(isRewardFilterActive(ALL_REWARD_FILTER)).toBe(false);
    expect(isRewardFilterActive({ group: 'referral', source: null })).toBe(true);
    expect(isRewardFilterActive({ group: 'withdrawal', source: 'withdrawal' })).toBe(true);
  });
});

describe('rewardFilterLabel', () => {
  it('全部回 null；群組回短標籤；細分回完整標籤', () => {
    expect(rewardFilterLabel(ALL_REWARD_FILTER)).toBeNull();
    expect(rewardFilterLabel({ group: 'referral', source: null })).toBe('推薦獎勵');
    expect(rewardFilterLabel({ group: 'referral', source: 'referral_payment' })).toBe(
      '推薦獎勵·付款',
    );
  });
});

describe('selectRewardFilterGroup', () => {
  it('換群組時清掉細分，不留父子矛盾的殘留狀態', () => {
    expect(selectRewardFilterGroup('withdrawal')).toEqual({ group: 'withdrawal', source: null });
    expect(selectRewardFilterGroup(null)).toEqual(ALL_REWARD_FILTER);
  });
});

describe('篩選群組結構', () => {
  it('涵蓋所有會產生的來源分類（adjustment_manual 除外——無端點產生）', () => {
    const covered = REWARD_FILTER_GROUPS.flatMap((g) => g.subs.map((s) => s.source)).sort();
    const expected = REWARD_SOURCE_CATEGORIES.filter((c) => c !== 'adjustment_manual')
      .slice()
      .sort();
    expect(covered).toEqual(expected);
  });

  it('每個分類只屬於一個群組（篩選集合不重疊，count 才不會重複計）', () => {
    const covered = REWARD_FILTER_GROUPS.flatMap((g) => g.subs.map((s) => s.source));
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('第一層標籤 ≤ 4 字、第二層 ≤ 4 字——窄欄位（半欄桌面／手機）不折行的前提', () => {
    for (const group of REWARD_FILTER_GROUPS) {
      expect(group.label.length).toBeLessThanOrEqual(4);
      for (const sub of group.subs) {
        expect(sub.label.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('每個分類都有完整標籤（明細列 badge 用）', () => {
    for (const category of REWARD_SOURCE_CATEGORIES) {
      expect(REWARD_SOURCE_LABELS[category]).toBeTruthy();
    }
  });

  it('findRewardFilterGroup 查無／null 時回 null', () => {
    expect(findRewardFilterGroup(null)).toBeNull();
    expect(findRewardFilterGroup('referral')?.label).toBe('推薦獎勵');
  });
});
