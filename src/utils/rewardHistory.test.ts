import { describe, it, expect } from 'vitest';
import { formatRewardDetail, isReferralSource } from './rewardHistory';
import type { RewardHistoryRecord } from '@contract';

// 契約的 InferObj 把 optional 欄位視為「必填但可 undefined」的 key，故基底補齊所有 key。
const rec = (o: Partial<RewardHistoryRecord>): RewardHistoryRecord => ({
  id: 'x',
  type: 'referral_reward',
  sourceCategory: 'referral_signup',
  amount: 100,
  description: '',
  issuedAt: '2026-07-20T00:00:00Z',
  requestedAt: undefined,
  generation: undefined,
  balance: undefined,
  refereeName: undefined,
  refereeReferrerName: undefined,
  viaFreeRenewal: undefined,
  ...o,
});

describe('formatRewardDetail', () => {
  it('提領：以結構化金額組出「提領 X P + 手續費 15 P」', () => {
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'withdrawal',
          amount: -1015,
          description: '提領申請（1000 P + 手續費 15 P）',
        }),
      ),
    ).toBe('提領 1000 P + 手續費 15 P');
    // 描述格式無關——一律由金額重算，故舊資料也統一顯示
    expect(formatRewardDetail(rec({ sourceCategory: 'withdrawal', amount: -8015 }))).toBe(
      '提領 8000 P + 手續費 15 P',
    );
  });

  it('推薦新人 第 1 代：只顯示被推薦人（後端已遮罩值直通）', () => {
    expect(
      formatRewardDetail(
        rec({ sourceCategory: 'referral_signup', generation: 1, refereeName: '王小明' }),
      ),
    ).toBe('王小明');
  });

  it('推薦 第 2/3 代：被推薦人（上線）括號格式', () => {
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'referral_signup',
          generation: 2,
          refereeName: '陳○文',
          refereeReferrerName: '王小明',
        }),
      ),
    ).toBe('陳○文（王小明）');
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'referral_renewal',
          generation: 3,
          refereeName: '李○華',
          refereeReferrerName: '陳○文',
        }),
      ),
    ).toBe('李○華（陳○文）');
  });

  it('子代續約：券換的才註記「任務免費續約」，付款續約不贅字', () => {
    // 分類軸改成拉新／續約後，付款續約與免費續約同屬 referral_renewal，
    // 這行註記是它們在 UI 上唯一的區別（見 migration 0725 0002）。
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'referral_renewal',
          generation: 1,
          refereeName: '王小明',
          viaFreeRenewal: true,
        }),
      ),
    ).toBe('王小明・任務免費續約');
    expect(
      formatRewardDetail(
        rec({ sourceCategory: 'referral_renewal', generation: 1, refereeName: '王小明' }),
      ),
    ).toBe('王小明');
    // 第 2/3 代：括號上線與註記並存
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'referral_renewal',
          generation: 2,
          refereeName: '陳○文',
          refereeReferrerName: '王小明',
          viaFreeRenewal: true,
        }),
      ),
    ).toBe('陳○文（王小明）・任務免費續約');
  });

  it('退還／調整：description 原樣，無則回退 —', () => {
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'withdrawal_refund',
          amount: 1015,
          description: '提領遭退件，點數退回',
        }),
      ),
    ).toBe('提領遭退件，點數退回');
    expect(formatRewardDetail(rec({ sourceCategory: 'adjustment_manual', description: '' }))).toBe(
      '—',
    );
  });
});

describe('isReferralSource', () => {
  it('推薦類為 true、其餘為 false', () => {
    expect(isReferralSource('referral_signup')).toBe(true);
    expect(isReferralSource('referral_renewal')).toBe(true);
    expect(isReferralSource('withdrawal')).toBe(false);
    expect(isReferralSource('withdrawal_refund')).toBe(false);
    expect(isReferralSource('adjustment_manual')).toBe(false);
  });
});
