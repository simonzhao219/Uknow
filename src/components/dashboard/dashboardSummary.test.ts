import { describe, expect, it } from 'vitest';
import { countAwaitingCollection, countExpiring } from './dashboardSummary';

const withdrawal = (status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected') => ({
  status,
});

describe('countExpiring', () => {
  it('沒有推薦資料時為 0', () => {
    expect(countExpiring(null)).toBe(0);
  });

  it('清單被截在六筆時仍以 total 為精確人數', () => {
    expect(countExpiring({ total: 9 })).toBe(9);
  });

  it('後端回空清單時為 0', () => {
    expect(countExpiring({ total: 0 })).toBe(0);
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
