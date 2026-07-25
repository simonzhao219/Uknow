import { describe, it, expect } from 'vitest';
import { formatRewardDetail, isReferralSource } from './rewardHistory';
import type { RewardHistoryRecord } from '@contract';

// 契約的 InferObj 把 optional 欄位視為「必填但可 undefined」的 key，故基底補齊所有 key。
const rec = (o: Partial<RewardHistoryRecord>): RewardHistoryRecord => ({
  id: 'x',
  type: 'referral_reward',
  sourceCategory: 'referral_payment',
  amount: 100,
  description: '',
  issuedAt: '2026-07-20T00:00:00Z',
  requestedAt: undefined,
  generation: undefined,
  balance: undefined,
  refereeName: undefined,
  refereeReferrerName: undefined,
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

  it('推薦·付款 第 1 代：只顯示被推薦人（後端已遮罩值直通）', () => {
    expect(
      formatRewardDetail(
        rec({ sourceCategory: 'referral_payment', generation: 1, refereeName: '王小明' }),
      ),
    ).toBe('王小明');
  });

  it('推薦 第 2/3 代：被推薦人（上線）括號格式', () => {
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'referral_payment',
          generation: 2,
          refereeName: '陳○文',
          refereeReferrerName: '王小明',
        }),
      ),
    ).toBe('陳○文（王小明）');
    expect(
      formatRewardDetail(
        rec({
          sourceCategory: 'referral_task_renewal',
          generation: 3,
          refereeName: '李○華',
          refereeReferrerName: '陳○文',
        }),
      ),
    ).toBe('李○華（陳○文）');
  });

  it('退款／調整：description 原樣，無則回退 —', () => {
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
    expect(isReferralSource('referral_payment')).toBe(true);
    expect(isReferralSource('referral_task_renewal')).toBe(true);
    expect(isReferralSource('withdrawal')).toBe(false);
    expect(isReferralSource('withdrawal_refund')).toBe(false);
    expect(isReferralSource('adjustment_manual')).toBe(false);
  });
});
