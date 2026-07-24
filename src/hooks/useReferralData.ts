import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

import { normalizeReferralData } from '../utils/referralTree';

// 型別集中在 utils/referralTree（純模組，可被測試與相容層共用）。
export type {
  ReferralNodeStatus,
  ReferralNode,
  ReferralSummary,
  ReferralData,
} from '../utils/referralTree';
import type { ReferralData } from '../utils/referralTree';

export interface UseReferralDataResult {
  referralData: ReferralData | null;
  loading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DEDUP_KEY = 'referralTree';

export function useReferralData(): UseReferralDataResult {
  const { getCache, setCache, isStale } = useDataCache();
  const { showToast } = useNotification();

  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await apiRequestJson<{ success: boolean; data: unknown }>(
        buildApiUrl('/referrals/my-tree')
      );
      if (result.success) {
        // 寬容讀取：新後端回 roots；舊後端（過渡期）回 referralTree，於此正規化。
        const data = normalizeReferralData(result.data);
        setCache('referralTree', data);
        setReferralData(data);
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
    // F5 後一個 round-trip 內就能看到新付款的下線出現在推薦樹，不必
    // 登出登入、也不必等 TTL 過期。
    const cachedRaw = getCache('referralTree');
    const cached = cachedRaw ? normalizeReferralData(cachedRaw) : null;
    if (cached) {
      setReferralData(cached);
      hasDataRef.current = true;
      setLoading(false);
    }
    if (!cached || isStale('referralTree')) {
      dedupe(DEDUP_KEY, fetchData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRevalidateOnFocus(
    () => isStale('referralTree'),
    () => dedupe(DEDUP_KEY, fetchData)
  );

  const refetch = useCallback(() => dedupe(DEDUP_KEY, fetchData), [fetchData]);

  return { referralData, loading, isValidating, error, refetch };
}
