import { useState, useEffect, useCallback } from 'react';
import { useDataCache, type CacheKey } from '../contexts/DataCacheContext';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

interface UseFetchDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 通用資料請求 Hook
 *
 * 自動整合 DataCacheContext 快取、統一 loading/error 狀態、
 * 以及透過 useNotification 顯示錯誤提示。
 *
 * @param endpoint - API 路徑，例如 '/rewards'
 * @param cacheKey - 對應的快取鍵（可選，不傳則不快取）
 * @param deps - 額外的 useEffect 依賴（例如 user.id）
 */
export function useFetchData<T = unknown>(
  endpoint: string,
  cacheKey?: CacheKey,
  deps: unknown[] = []
): UseFetchDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getCache, setCache, hasCache } = useDataCache();
  const { showToast } = useNotification();

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 優先使用快取
    if (cacheKey && hasCache(cacheKey)) {
      setData(getCache(cacheKey) as T);
      setLoading(false);
      return;
    }

    try {
      const result = await apiRequestJson<T>(buildApiUrl(endpoint));
      setData(result);
      if (cacheKey) {
        setCache(cacheKey, result);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // apiRequestJson 已處理 401（signOut + redirect），此處只記錄
        return;
      }
      const msg = err instanceof Error ? err.message : '資料載入失敗';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, cacheKey, ...deps]);

  useEffect(() => {
    fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
