// @vitest-environment jsdom
// ============================================================
// TDD red-first：推薦網絡前端工具（PR-B2）
// 對象 utils/referralNetwork.ts 在紅階段尚不存在——先以測試釘死契約：
//   * parseSortMode：合法四模式直通、非法/空值回落 DEFAULT_NETWORK_SORT
//   * SORT_OPTIONS：四個選項與核定文案一字不差（UI copy 守門），
//     順序為「預設項置頂」（需求方裁決）
//   * readStoredSort/storeSort：localStorage 往返、壞值安全回落
//   * nodeDaysLeft：endDate 前端重算優先（久開頁不吃伺服器過時快照），
//     無 endDate 才 fallback 伺服器 daysToExpiry
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_NETWORK_SORT } from '@contract';
import {
  parseSortMode,
  SORT_OPTIONS,
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

  it('非法值 / null / undefined 回落 DEFAULT_NETWORK_SORT', () => {
    // 釘的是「與契約的單一來源一致」，不是字面值——預設值改動時只需改 @contract
    expect(parseSortMode('bogus')).toBe(DEFAULT_NETWORK_SORT);
    expect(parseSortMode(null)).toBe(DEFAULT_NETWORK_SORT);
    expect(parseSortMode(undefined)).toBe(DEFAULT_NETWORK_SORT);
    expect(parseSortMode(42)).toBe(DEFAULT_NETWORK_SORT);
  });

  it('預設值即「最早加入」（需求方裁決）', () => {
    expect(DEFAULT_NETWORK_SORT).toBe('updated_asc');
  });
});

describe('SORT_OPTIONS（核定短文案：收合=展開同一份，單層結構消滅疊字）', () => {
  it('四個選項、順序與文案一字不差（皆 ≤5 字，窄螢幕收合不爆版）', () => {
    // 順序＝預設項置頂（需求方裁決）；文案本身一字未動。
    expect(SORT_OPTIONS).toEqual([
      { value: 'updated_asc', label: '最早加入' },
      { value: 'updated_desc', label: '最新加入' },
      { value: 'name_asc', label: '姓名 A→Z' },
      { value: 'name_desc', label: '姓名 Z→A' },
    ]);
  });

  it('首項即預設排序——選單打開時單選圓點落在第一列', () => {
    expect(SORT_OPTIONS[0].value).toBe(DEFAULT_NETWORK_SORT);
  });
});

describe('readStoredSort / storeSort', () => {
  beforeEach(() => localStorage.clear());

  it('未存過 → 預設 DEFAULT_NETWORK_SORT', () => {
    expect(readStoredSort()).toBe(DEFAULT_NETWORK_SORT);
  });

  it('storeSort 後 readStoredSort 取回相同模式', () => {
    storeSort('name_asc');
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe('name_asc');
    expect(readStoredSort()).toBe('name_asc');
  });

  it('localStorage 被塞壞值 → 安全回落預設', () => {
    localStorage.setItem(SORT_STORAGE_KEY, 'evil');
    expect(readStoredSort()).toBe(DEFAULT_NETWORK_SORT);
  });

  it('曾主動選過的使用者保留其選擇——即使選的是舊預設', () => {
    // 需求方裁決：明示選擇優先，不清除、不遷移、不告知。
    storeSort('updated_desc');
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
