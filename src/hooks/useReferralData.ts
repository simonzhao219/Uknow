import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';
import {
  readStoredSort,
  storeSort,
  type NetworkSortMode,
  type NetworkNode,
  type NetworkOverview,
  type NetworkSearchMatch,
} from '../utils/referralNetwork';

// ============================================================
// 推薦網絡資料（Tier B 懶載入版）
// - overview：SWR（DataCacheContext 'referralNetwork'）——有快取秒開、
//   背景 revalidate；快取帶 sort 回聲，排序不符視同 miss。
// - children：hook 內 Map 快取（key = parentId::sort）+ in-flight 去重，
//   收合再展開不重撈；切排序整張作廢（伺服器是排序權威）。
// - search：即時打伺服器（真名比對在後端），不快取。
// ============================================================

export type {
  NetworkSortMode,
  NetworkNode,
  NetworkOverview,
  NetworkSearchMatch,
} from '../utils/referralNetwork';

export interface UseReferralDataResult {
  overview: NetworkOverview | null;
  loading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sort: NetworkSortMode;
  setSort: (mode: NetworkSortMode) => void;
  loadChildren: (parentId: string) => Promise<NetworkNode[]>;
  searchNetwork: (q: string) => Promise<NetworkSearchMatch[]>;
}

const DEDUP_KEY = 'referralNetwork';

export function useReferralData(): UseReferralDataResult {
  const { getCache, setCache, isStale } = useDataCache();
  const { showToast } = useNotification();

  const [sort, setSortState] = useState<NetworkSortMode>(() => readStoredSort());
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  const sortRef = useRef(sort);
  sortRef.current = sort;

  // children 快取：parentId::sort → 已載入的直接下線；inflight 去重併發展開
  const childrenCache = useRef(new Map<string, NetworkNode[]>());
  const childrenInflight = useRef(new Map<string, Promise<NetworkNode[]>>());

  const fetchOverview = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await apiRequestJson<{ success: boolean; data: NetworkOverview }>(
        buildApiUrl(`/referrals/network/overview?sort=${sortRef.current}`)
      );
      if (result.success) {
        setCache('referralNetwork', result.data);
        setOverview(result.data);
        hasDataRef.current = true;
      } else {
        throw new Error('獲取推薦數據失敗');
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? '登入已過期，請重新登入'
          : err.message || '載入失敗，請稍後再試';
      if (!hasDataRef.current) {
        // 冷啟動失敗才對使用者報錯；背景 revalidate 失敗畫面繼續用舊資料。
        setError(msg);
        showToast(msg, 'error');
      } else {
        console.error('[useReferralData] 背景重新請求失敗:', msg);
      }
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // stale-while-revalidate：有快取先畫（秒開），同時背景重新請求——
    // F5 後一個 round-trip 內就能看到新付款的下線出現，不必登出登入。
    // 快取帶 sort 回聲：與目前排序不符視同 miss（伺服器是排序權威）。
    const cached = getCache('referralNetwork') as NetworkOverview | null;
    if (cached && cached.sort === sortRef.current && Array.isArray(cached.roots)) {
      setOverview(cached);
      hasDataRef.current = true;
      setLoading(false);
    }
    if (!cached || cached.sort !== sortRef.current || isStale('referralNetwork')) {
      dedupe(DEDUP_KEY, fetchOverview);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRevalidateOnFocus(
    () => isStale('referralNetwork'),
    () => dedupe(DEDUP_KEY, fetchOverview)
  );

  const refetch = useCallback(() => dedupe(DEDUP_KEY, fetchOverview), [fetchOverview]);

  const setSort = useCallback((mode: NetworkSortMode) => {
    if (mode === sortRef.current) return;
    storeSort(mode);
    setSortState(mode);
    sortRef.current = mode;
    childrenCache.current.clear();      // 排序是伺服器權威：舊排序的分支整張作廢
    childrenInflight.current.clear();
    dedupe(DEDUP_KEY, fetchOverview);
  }, [fetchOverview]);

  const loadChildren = useCallback(async (parentId: string): Promise<NetworkNode[]> => {
    const key = `${parentId}::${sortRef.current}`;
    const cached = childrenCache.current.get(key);
    if (cached) return cached;
    const inflight = childrenInflight.current.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      const result = await apiRequestJson<{ success: boolean; data: { nodes: NetworkNode[] } }>(
        buildApiUrl(`/referrals/network/children?parentId=${encodeURIComponent(parentId)}&sort=${sortRef.current}`)
      );
      if (!result.success) throw new Error('載入下線失敗');
      childrenCache.current.set(key, result.data.nodes);
      return result.data.nodes;
    })();
    childrenInflight.current.set(key, p);
    try {
      return await p;
    } finally {
      childrenInflight.current.delete(key);
    }
  }, []);

  const searchNetwork = useCallback(async (q: string): Promise<NetworkSearchMatch[]> => {
    const result = await apiRequestJson<{ success: boolean; data: { matches: NetworkSearchMatch[] } }>(
      buildApiUrl(`/referrals/network/search?q=${encodeURIComponent(q)}&sort=${sortRef.current}`)
    );
    if (!result.success) throw new Error('搜尋失敗');
    return result.data.matches;
  }, []);

  return { overview, loading, isValidating, error, refetch, sort, setSort, loadChildren, searchNetwork };
}
