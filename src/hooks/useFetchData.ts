import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache, type CacheKey } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

interface UseFetchDataResult<T> {
  data: T | null;
  loading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 通用資料請求 Hook（stale-while-revalidate）
 *
 * 有快取先畫（秒開、不轉圈），同時在 stale 時背景重新請求；分頁重新
 * 取得焦點時也會檢查一次。自動整合 DataCacheContext、統一
 * loading/error 狀態、透過 useNotification 顯示錯誤提示。
 *
 * @param endpoint - API 路徑，例如 '/rewards'
 * @param cacheKey - 對應的快取鍵（可選，不傳則不快取、每次都抓）
 * @param deps - 額外的 useEffect 依賴（例如 user.id）
 */
export function useFetchData<T = unknown>(
  endpoint: string,
  cacheKey?: CacheKey,
  deps: unknown[] = []
): UseFetchDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const { getCache, setCache, isStale } = useDataCache();
  const { showToast } = useNotification();

  const doFetch = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await apiRequestJson<T>(buildApiUrl(endpoint));
      setData(result);
      hasDataRef.current = true;
      if (cacheKey) setCache(cacheKey, result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // apiRequestJson 已處理 401（signOut + redirect），此處只記錄
        return;
      }
      const msg = err instanceof Error ? err.message : '資料載入失敗';
      if (!hasDataRef.current) {
        setError(msg);
        showToast(msg, 'error');
      } else {
        console.error(`[useFetchData] 背景重新請求失敗（${endpoint}）:`, msg);
      }
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, cacheKey, ...deps]);

  const revalidate = useCallback(
    () => dedupe(cacheKey ?? endpoint, doFetch),
    [cacheKey, endpoint, doFetch]
  );

  useEffect(() => {
    if (cacheKey) {
      const cached = getCache(cacheKey);
      if (cached != null) {
        setData(cached as T);
        hasDataRef.current = true;
        setLoading(false);
      }
      if (cached == null || isStale(cacheKey)) {
        revalidate();
      }
    } else {
      revalidate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revalidate]);

  useRevalidateOnFocus(
    () => (cacheKey ? isStale(cacheKey) : true),
    revalidate
  );

  return { data, loading, isValidating, error, refetch: revalidate };
}
