import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { UserContext } from '../App';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

// 訂閱三態模型（見時間領域/訂閱重設計）：一次性年費、無自動扣款，
// 沒有「取消／恢復／補繳」——過期後直接用 /payment/checkout 續訂或
// 重新訂即可，效期由 process_successful_payment 依 renewalMode 決定。
export interface SubscriptionData {
  hasSubscription: boolean;
  status?: 'active' | 'grace' | 'expired';
  activeUntil?: string;
  gracePeriodEnd?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}

export interface UseSubscriptionResult {
  subscriptionData: SubscriptionData | null;
  isLoading: boolean;
  isValidating: boolean;
  refresh: () => Promise<void>;
}

const DEDUP_KEY = 'subscriptionStatus';

export function useSubscription(): UseSubscriptionResult {
  const { user } = useContext(UserContext);
  const { getCache, setCache, clearCache, isStale } = useDataCache();
  const { showToast } = useNotification();

  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const hasDataRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setIsLoading(true);
    }
    try {
      const result = await apiRequestJson<{ success: boolean; data: SubscriptionData }>(
        buildApiUrl('/subscriptions/status')
      );
      setCache('subscriptionStatus', result.data);
      setSubscriptionData(result.data);
      hasDataRef.current = true;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        // 背景 revalidate 失敗不打擾使用者：畫面繼續顯示舊資料即可。
        if (!hasDataRef.current) showToast('無法獲取訂閱狀態', 'error');
        else console.error('[useSubscription] 背景重新請求失敗:', err);
      }
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    const cached = getCache('subscriptionStatus') as SubscriptionData | null;
    if (cached) {
      setSubscriptionData(cached);
      hasDataRef.current = true;
      setIsLoading(false);
    }
    // stale-while-revalidate：有快取先畫，同時（或沒快取時單純）背景重
    // 新請求一次——F5 後一個 round-trip 內就能看到最新的會員效期，不用
    // 再靠登出登入或等 5 分鐘的舊機制。
    if (!cached || isStale('subscriptionStatus')) {
      dedupe(DEDUP_KEY, fetchStatus);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useRevalidateOnFocus(
    () => isStale('subscriptionStatus'),
    () => dedupe(DEDUP_KEY, fetchStatus)
  );

  const refresh = useCallback(async () => {
    clearCache('subscriptionStatus');
    await dedupe(DEDUP_KEY, fetchStatus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { subscriptionData, isLoading, isValidating, refresh };
}
