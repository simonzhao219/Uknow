import { describe, expect, it } from 'vitest';
import { countAwaitingCollection, countExpiring, formatExpiringCount } from './dashboardSummary';
import type { NetworkNodeStatus } from '../../utils/referralNetwork';

const node = (status: NetworkNodeStatus) => ({ status });
const withdrawal = (status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected') => ({
  status,
});

describe('countExpiring', () => {
  it('沒有推薦資料時為 0', () => {
    expect(countExpiring(null)).toEqual({ count: 0, atLeast: false });
  });

  it('只計即將到期，不計已失效與停權', () => {
    const attention = {
      total: 4,
      items: [node('expiring'), node('expiring'), node('expired'), node('suspended')],
    };
    expect(countExpiring(attention)).toEqual({ count: 2, atLeast: false });
  });

  it('六筆全是即將到期且總數更多時只能確定至少六位', () => {
    const attention = { total: 9, items: Array.from({ length: 6 }, () => node('expiring')) };
    expect(countExpiring(attention)).toEqual({ count: 6, atLeast: true });
  });

  it('六筆全是即將到期且總數剛好六時是精確值', () => {
    const attention = { total: 6, items: Array.from({ length: 6 }, () => node('expiring')) };
    expect(countExpiring(attention)).toEqual({ count: 6, atLeast: false });
  });

  it('沒有即將到期的人時即使總數被截斷也是 0', () => {
    const attention = { total: 10, items: Array.from({ length: 6 }, () => node('expired')) };
    expect(countExpiring(attention)).toEqual({ count: 0, atLeast: false });
  });
});

describe('formatExpiringCount', () => {
  it('精確值只顯示數字、下限值加上至少', () => {
    expect(formatExpiringCount({ count: 3, atLeast: false })).toBe('3');
    expect(formatExpiringCount({ count: 6, atLeast: true })).toBe('至少 6');
  });
});

describe('countAwaitingCollection', () => {
  it('只計待查收的提領', () => {
    const list = [
      withdrawal('awaiting_collection'),
      withdrawal('pending'),
      withdrawal('completed'),
      withdrawal('awaiting_collection'),
    ];
    expect(countAwaitingCollection(list)).toBe(2);
  });
});
