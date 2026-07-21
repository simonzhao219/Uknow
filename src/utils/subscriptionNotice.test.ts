import { describe, it, expect } from 'vitest';
import { renewalNoticeDaysLeft, RENEWAL_NOTICE_DAYS } from './subscriptionNotice';

const DAY = 86_400_000;
// 固定 now 讓天數計算可重現（不依賴真實時鐘）。
const NOW = new Date('2026-07-21T04:00:00Z').getTime();
const inDays = (n: number) => new Date(NOW + n * DAY).toISOString();

describe('renewalNoticeDaysLeft — 到期前續訂提醒（active 且 ≤30 天）', () => {
  it('門檻常數為 30 天', () => {
    expect(RENEWAL_NOTICE_DAYS).toBe(30);
  });

  it('非 active（expired）一律不提醒', () => {
    expect(renewalNoticeDaysLeft('expired', inDays(5), NOW)).toBeNull();
  });

  it('active 但沒有 activeUntil → 不提醒', () => {
    expect(renewalNoticeDaysLeft('active', undefined, NOW)).toBeNull();
  });

  it('active 且距到期超過門檻（31 天）→ 不提醒', () => {
    expect(renewalNoticeDaysLeft('active', inDays(31), NOW)).toBeNull();
  });

  it('active 且恰好門檻（30 天）→ 提醒，回 30', () => {
    expect(renewalNoticeDaysLeft('active', inDays(30), NOW)).toBe(30);
  });

  it('active 且剩 5 天 → 回 5', () => {
    expect(renewalNoticeDaysLeft('active', inDays(5), NOW)).toBe(5);
  });

  it('active 且今天稍晚到期（<1 天）→ 進位為 1', () => {
    expect(renewalNoticeDaysLeft('active', inDays(0.5), NOW)).toBe(1);
  });

  it('activeUntil 已過（時鐘偏移導致負值）→ 防禦性回 null', () => {
    expect(renewalNoticeDaysLeft('active', inDays(-1), NOW)).toBeNull();
  });
});
