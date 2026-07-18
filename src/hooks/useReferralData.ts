import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

export interface ReferralMember {
  userId: string;
  userName: string;
  userReferralCode: string | null;
  listingId: string | null;
  listingName: string | null;
  serviceType: string | null;
  city: string | null;
  activeUntil: string | null;
  isActive: boolean;
  referrer?: {
    userId: string;
    userName: string;
    userReferralCode: string | null;
    listingId: string | null;
    listingName: string | null;
  } | null;
  createdAt: string;
}

export interface ReferralTree {
  firstGeneration: ReferralMember[];
  secondGeneration: ReferralMember[];
  thirdGeneration: ReferralMember[];
}

export interface ReferralSummary {
  totalReferrals: number;
  firstGenCount: number;
  secondGenCount: number;
  thirdGenCount: number;
}

export interface ReferralData {
  userReferralCode: string;
  referralTree: ReferralTree;
  summary: ReferralSummary;
}

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
      const result = await apiRequestJson<{ success: boolean; data: ReferralData }>(
        buildApiUrl('/referrals/my-tree')
      );
      if (result.success) {
        setCache('referralTree', result.data);
        setReferralData(result.data);
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
    const cached = getCache('referralTree') as ReferralData | null;
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
