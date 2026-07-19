import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DataCacheProvider,
  useDataCache,
  MUTATION_GROUPS,
} from './DataCacheContext';

// Characterization（Phase 1 護欄）：釘死 stale-while-revalidate 快取合約，
// 保護 Phase 3-D/3-E（四個 hook 收斂、消除重複 subscription 副本）不改變語意。

const STORAGE_KEY = 'uknow_data_cache';

function mountCache() {
  return renderHook(() => useDataCache(), { wrapper: DataCacheProvider });
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('DataCacheContext — SWR 快取合約', () => {
  it('setCache / getCache 往返；新鮮資料不 stale', () => {
    const { result } = mountCache();
    act(() => result.current.setCache('subscriptionStatus', { hasSubscription: true }));
    expect(result.current.getCache('subscriptionStatus')).toEqual({ hasSubscription: true });
    expect(result.current.hasCache('subscriptionStatus')).toBe(true);
    // 剛親自 fetch 的資料在 softTtl（30s）內不算 stale。
    expect(result.current.isStale('subscriptionStatus')).toBe(false);
  });

  it('沒有快取 → isStale 為 true、getCache 為 null', () => {
    const { result } = mountCache();
    expect(result.current.getCache('rewards')).toBeNull();
    expect(result.current.isStale('rewards')).toBe(true);
  });

  it('自 sessionStorage 復原的資料一律標記 fromStorage → isStale 為 true（F5 後強制背景重抓）', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rewards: { data: { total: 5 }, timestamp: Date.now() } }),
    );
    const { result } = mountCache();
    // 資料仍可秒開
    expect(result.current.getCache('rewards')).toEqual({ total: 5 });
    // 但因 fromStorage，視為 stale
    expect(result.current.isStale('rewards')).toBe(true);
    expect(result.current.getEntry('rewards')?.fromStorage).toBe(true);
  });

  it('invalidate(event) 清掉 MUTATION_GROUPS 對應的整組 key', () => {
    const { result } = mountCache();
    act(() => {
      for (const k of MUTATION_GROUPS.payment) result.current.setCache(k, { v: 1 });
    });
    act(() => result.current.invalidate('payment'));
    for (const k of MUTATION_GROUPS.payment) {
      expect(result.current.hasCache(k)).toBe(false);
    }
  });

  it('clearCache() 不帶 key 清空全部（登出用）', () => {
    const { result } = mountCache();
    act(() => result.current.setCache('tasks', { a: 1 }));
    act(() => result.current.clearCache());
    expect(result.current.hasCache('tasks')).toBe(false);
    // 現況：clearCache 先 removeItem，但持久化 effect 隨即把空 state 寫回，
    // 故 sessionStorage 最終為空物件（快取內容已清空，這是關鍵不變式）。
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')).toEqual({});
  });

  it('setCache 會持久化到 sessionStorage', () => {
    const { result } = mountCache();
    act(() => result.current.setCache('userListing', { id: 'L1' }));
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored.userListing?.data).toEqual({ id: 'L1' });
  });
});
