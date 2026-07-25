// @vitest-environment jsdom
// ============================================================
// TDD red-first：推薦網絡前端工具（PR-B2）
// 對象 utils/referralNetwork.ts 在紅階段尚不存在——先以測試釘死契約：
//   * parseSortMode：合法四模式直通、非法/空值回落 'updated_desc'
//   * SORT_OPTIONS：四個選項與核定文案一字不差（UI copy 守門）
//   * readStoredSort/storeSort：localStorage 往返、壞值安全回落
//   * nodeDaysLeft：endDate 前端重算優先（久開頁不吃伺服器過時快照），
//     無 endDate 才 fallback 伺服器 daysToExpiry
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseSortMode,
  SORT_OPTIONS,
  SORT_SHORT_LABEL,
  SORT_STORAGE_KEY,
  readStoredSort,
  storeSort,
  nodeDaysLeft,
} from './referralNetwork';

describe('parseSortMode', () => {
  it('四種合法模式直通', () => {
    for (const m of ['updated_desc', 'updated_asc', 'name_asc', 'name_desc'] as const) {
      expect(parseSortMode(m)).toBe(m);
    }
  });

  it('非法值 / null / undefined 回落預設 updated_desc', () => {
    expect(parseSortMode('bogus')).toBe('updated_desc');
    expect(parseSortMode(null)).toBe('updated_desc');
    expect(parseSortMode(undefined)).toBe('updated_desc');
    expect(parseSortMode(42)).toBe('updated_desc');
  });
});

describe('SORT_OPTIONS（核定文案）', () => {
  it('四個選項、順序與文案一字不差', () => {
    expect(SORT_OPTIONS).toEqual([
      { value: 'updated_desc', label: '更新：新 → 舊' },
      { value: 'updated_asc', label: '更新：舊 → 新' },
      { value: 'name_asc', label: '姓名：A → Z（筆畫少 → 多）' },
      { value: 'name_desc', label: '姓名：Z → A（筆畫多 → 少）' },
    ]);
  });
});

describe('SORT_SHORT_LABEL（窄螢幕晶片短標籤）', () => {
  it('四模式各有 ≤3 字的短標籤，收合狀態一眼可見且撐不爆版面', () => {
    expect(SORT_SHORT_LABEL).toEqual({
      updated_desc: '最新',
      updated_asc: '最舊',
      name_asc: 'A→Z',
      name_desc: 'Z→A',
    });
  });
});

describe('readStoredSort / storeSort', () => {
  beforeEach(() => localStorage.clear());

  it('未存過 → 預設 updated_desc', () => {
    expect(readStoredSort()).toBe('updated_desc');
  });

  it('storeSort 後 readStoredSort 取回相同模式', () => {
    storeSort('name_asc');
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe('name_asc');
    expect(readStoredSort()).toBe('name_asc');
  });

  it('localStorage 被塞壞值 → 安全回落預設', () => {
    localStorage.setItem(SORT_STORAGE_KEY, 'evil');
    expect(readStoredSort()).toBe('updated_desc');
  });
});

describe('nodeDaysLeft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('有 endDate：以現在時間重算，忽略伺服器過時的 daysToExpiry', () => {
    // 伺服器快照說剩 99 天（過時），endDate 實際只剩 10 天
    expect(nodeDaysLeft({ endDate: '2026-08-04T00:00:00Z', daysToExpiry: 99 })).toBe(10);
  });

  it('endDate 已過 → 0（不出現負數倒數）', () => {
    expect(nodeDaysLeft({ endDate: '2026-07-01T00:00:00Z', daysToExpiry: 5 })).toBe(0);
  });

  it('無 endDate → fallback 伺服器 daysToExpiry', () => {
    expect(nodeDaysLeft({ endDate: null, daysToExpiry: 7 })).toBe(7);
    expect(nodeDaysLeft({ endDate: null, daysToExpiry: null })).toBeNull();
  });
});
