import { describe, it, expect } from 'vitest';
import { normalizeReferralData } from './referralTree';

// 這組測試補上先前缺的一塊：前端對 /referrals/my-tree 回應形狀的相容。
// 破壞性契約變更（referralTree → roots）＋前後端獨立部署，會出現「新前端
// 打到舊後端」——e2e 用 mock 後端（形狀由我們自控），契約測試只驗後端本身，
// 兩者都攔不到這種跨部署漂移。這裡直接鎖定正規化器對「新／舊／缺」三種
// 形狀的行為，讓相容層本身有回歸保護。

describe('normalizeReferralData', () => {
  it('新後端：直接採用 roots', () => {
    const raw = {
      userReferralCode: 'ABC',
      roots: [
        { userId: 'u1', name: '甲', generation: 1, status: 'active', daysToExpiry: 100, endDate: '2027-01-01', joinedAt: '2026-01-01', listingId: 'L1', childCount: 0, children: [] },
      ],
      summary: { firstGenCount: 1, secondGenCount: 0, thirdGenCount: 0, totalReferrals: 1 },
    };
    const out = normalizeReferralData(raw);
    expect(out.userReferralCode).toBe('ABC');
    expect(out.roots).toHaveLength(1);
    expect(out.roots[0].userId).toBe('u1');
    expect(out.summary.firstGenCount).toBe(1);
  });

  it('舊後端：由壓平 referralTree 重建巢狀樹（依 referrer 連結）', () => {
    const raw = {
      userReferralCode: 'ABC',
      referralTree: {
        firstGeneration: [
          { userId: 'g1', userName: '一代甲', listingId: 'L1', activeUntil: '2027-01-01', isActive: true, referrer: null, createdAt: '2026-01-01' },
        ],
        secondGeneration: [
          { userId: 'g2', userName: '二代乙', listingId: null, activeUntil: null, isActive: false, referrer: { userId: 'g1' }, createdAt: '2026-02-01' },
        ],
        thirdGeneration: [
          { userId: 'g3', userName: '三代丙', listingId: 'L3', activeUntil: '2027-03-01', isActive: true, referrer: { userId: 'g2' }, createdAt: '2026-03-01' },
        ],
      },
      summary: { firstGenCount: 1, secondGenCount: 1, thirdGenCount: 1, totalReferrals: 3 },
    };
    const out = normalizeReferralData(raw);

    expect(out.roots).toHaveLength(1);
    const g1 = out.roots[0];
    expect(g1).toMatchObject({ userId: 'g1', name: '一代甲', generation: 1, status: 'active', childCount: 1 });
    expect(g1.children).toHaveLength(1);

    const g2 = g1.children[0];
    expect(g2).toMatchObject({ userId: 'g2', generation: 2, status: 'expired', childCount: 1 });
    expect(g2.children).toHaveLength(1);

    const g3 = g2.children[0];
    expect(g3).toMatchObject({ userId: 'g3', generation: 3, status: 'active', childCount: 0 });
    expect(g3.children).toHaveLength(0);
  });

  it('缺 roots 也缺 referralTree：回空樹但保留 summary', () => {
    const raw = { userReferralCode: 'X', summary: { firstGenCount: 5, secondGenCount: 0, thirdGenCount: 0, totalReferrals: 5 } };
    const out = normalizeReferralData(raw);
    expect(out.roots).toEqual([]);
    expect(out.summary.totalReferrals).toBe(5);
  });

  it('空輸入不炸，回安全預設', () => {
    const out = normalizeReferralData(null);
    expect(out.userReferralCode).toBe('');
    expect(out.roots).toEqual([]);
    expect(out.summary.totalReferrals).toBe(0);
  });
});
