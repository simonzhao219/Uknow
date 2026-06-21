import { useState, useEffect, useCallback } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
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
  error: string | null;
  refetch: () => Promise<void>;
}

export function useReferralData(): UseReferralDataResult {
  const { getCache, setCache, hasCache } = useDataCache();
  const { showToast } = useNotification();

  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequestJson<{ success: boolean; data: ReferralData }>(
        buildApiUrl('/referrals/my-tree')
      );
      if (result.success) {
        setCache('referralTree', result.data);
        setReferralData(result.data);
      } else {
        throw new Error('獲取推薦數據失敗');
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? '登入已過期，請重新登入'
          : err.message || '載入失敗，請稍後再試';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasCache('referralTree')) {
      setReferralData(getCache('referralTree') as ReferralData);
      setLoading(false);
    } else {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { referralData, loading, error, refetch: fetchData };
}
