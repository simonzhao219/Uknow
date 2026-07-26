import { describe, it, expect } from 'vitest';
import { REWARD_SOURCE_CATEGORIES } from '@contract';
import type { RewardSourceFacet } from '@contract';
import {
  ALL_REWARD_FILTER,
  REWARD_FILTER_LABELS,
  REWARD_SOURCE_LABELS,
  isRewardFilterActive,
  rewardFilterLabel,
  rewardFilterOptions,
  toRewardSourceParam,
  toggleRewardSource,
} from './rewardHistoryFilter';

const facets = (...pairs: [RewardSourceFacet['sourceCategory'], number][]): RewardSourceFacet[] =>
  pairs.map(([sourceCategory, count]) => ({ sourceCategory, count }));

describe('rewardFilterOptions', () => {
  it('只列出使用者實際有的分類（空分類不畫永遠篩不到的 chip）', () => {
    const options = rewardFilterOptions(facets(['referral_signup', 3], ['withdrawal', 1]));
    expect(options.map((o) => o.source)).toEqual(['referral_signup', 'withdrawal']);
    expect(options.map((o) => o.count)).toEqual([3, 1]);
  });

  it('照契約 enum 的固定順序，不受 facet 回傳順序影響', () => {
    const options = rewardFilterOptions(
      facets(['withdrawal_refund', 1], ['referral_signup', 2], ['withdrawal', 1]),
    );
    expect(options.map((o) => o.source)).toEqual([
      'referral_signup',
      'withdrawal',
      'withdrawal_refund',
    ]);
  });

  it('後端出現前端沒預期的分類（人工調整）時自動長出來——加總才守恆', () => {
    const options = rewardFilterOptions(facets(['referral_signup', 2], ['adjustment_manual', 1]));
    expect(options.map((o) => o.source)).toContain('adjustment_manual');
  });

  it('筆數 0 的分類不列出', () => {
    expect(rewardFilterOptions(facets(['referral_signup', 0]))).toEqual([]);
  });

  it('用短標籤（篩選 chip 並排時「獎勵-」前綴是雜訊）', () => {
    const [option] = rewardFilterOptions(facets(['referral_signup', 1]));
    expect(option.label).toBe('推薦新人');
  });
});

describe('toggleRewardSource', () => {
  const available = ['referral_signup', 'referral_renewal', 'withdrawal'] as const;

  it('從全部選一個＝只看那一個', () => {
    expect(toggleRewardSource(ALL_REWARD_FILTER, 'withdrawal', available)).toEqual(['withdrawal']);
  });

  it('可複選：同時看推薦新人 + 子代續約（＝我所有的推薦進帳）', () => {
    const first = toggleRewardSource(ALL_REWARD_FILTER, 'referral_signup', available);
    expect(toggleRewardSource(first, 'referral_renewal', available)).toEqual([
      'referral_signup',
      'referral_renewal',
    ]);
  });

  it('再點一次已選的＝取消它', () => {
    expect(toggleRewardSource(['referral_signup', 'withdrawal'], 'withdrawal', available)).toEqual([
      'referral_signup',
    ]);
  });

  it('取消最後一個＝回到全部', () => {
    expect(toggleRewardSource(['withdrawal'], 'withdrawal', available)).toEqual(ALL_REWARD_FILTER);
  });

  it('選滿所有分類時歸位成「全部」——不留兩個等價卻行為不同的狀態', () => {
    const selected = ['referral_signup', 'referral_renewal'] as const;
    expect(toggleRewardSource(selected, 'withdrawal', available)).toEqual(ALL_REWARD_FILTER);
  });

  it('輸出照固定順序，點選順序不影響 ?source= 字串', () => {
    const a = toggleRewardSource(['withdrawal'], 'referral_signup', available);
    const b = toggleRewardSource(['referral_signup'], 'withdrawal', available);
    expect(a).toEqual(b);
  });

  it('丟掉已不存在於 facet 的選取（分類消失時不會送出篩不到的條件）', () => {
    expect(toggleRewardSource(['withdrawal_refund'], 'withdrawal', available)).toEqual([
      'withdrawal',
    ]);
  });
});

describe('toRewardSourceParam', () => {
  it('全部：回空字串（呼叫端不帶 ?source=）', () => {
    expect(toRewardSourceParam(ALL_REWARD_FILTER)).toBe('');
  });

  it('多選：CSV 下推給後端，篩選與 count 都在 DB 端算', () => {
    expect(toRewardSourceParam(['referral_signup', 'referral_renewal'])).toBe(
      'referral_signup,referral_renewal',
    );
  });

  it('單選：只帶該分類', () => {
    expect(toRewardSourceParam(['withdrawal_refund'])).toBe('withdrawal_refund');
  });
});

describe('isRewardFilterActive', () => {
  it('只有「全部」不算篩選中（逐列餘額僅在此檢視顯示）', () => {
    expect(isRewardFilterActive(ALL_REWARD_FILTER)).toBe(false);
    expect(isRewardFilterActive(['referral_signup'])).toBe(true);
    expect(isRewardFilterActive(['referral_signup', 'withdrawal'])).toBe(true);
  });
});

describe('rewardFilterLabel', () => {
  it('全部回 null；篩選中回完整標籤（空狀態文案要能自我解釋）', () => {
    expect(rewardFilterLabel(ALL_REWARD_FILTER)).toBeNull();
    expect(rewardFilterLabel(['referral_signup'])).toBe('獎勵-推薦新人');
    expect(rewardFilterLabel(['referral_signup', 'withdrawal'])).toBe('獎勵-推薦新人、提領 Point');
  });
});

describe('標籤字彙', () => {
  it('每個分類都有完整標籤（明細列 badge）與短標籤（篩選 chip）', () => {
    for (const category of REWARD_SOURCE_CATEGORIES) {
      expect(REWARD_SOURCE_LABELS[category]).toBeTruthy();
      expect(REWARD_FILTER_LABELS[category]).toBeTruthy();
    }
  });

  it('短標籤 ≤ 4 字——手機等寬三欄不折行的前提', () => {
    for (const category of REWARD_SOURCE_CATEGORIES) {
      expect(REWARD_FILTER_LABELS[category].length).toBeLessThanOrEqual(4);
    }
  });
});
