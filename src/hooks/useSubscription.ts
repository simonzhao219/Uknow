import { useState, useEffect, useCallback, useContext } from 'react';
import { UserContext } from '../App';
import { useDataCache } from '../contexts/DataCacheContext';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

export interface SubscriptionData {
  hasSubscription: boolean;
  status?: 'active' | 'cancelled' | 'grace' | 'expired';
  activeUntil?: string;
  daysRemaining?: number;
  message?: string;
  nextPaymentDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextPeriodStart?: string;
  nextPeriodEnd?: string;
  autoRenew?: boolean;
  graceStartedAt?: string;
  lastPaymentFailureReason?: string;
}

export interface UseSubscriptionResult {
  subscriptionData: SubscriptionData | null;
  isLoading: boolean;
  isProcessing: boolean;
  refresh: () => Promise<void>;
  handleConfirmCancel: (idNumber: string) => Promise<void>;
  handleResume: () => Promise<void>;
  handleMakeup: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionResult {
  const { user } = useContext(UserContext);
  const { getValidCache, setCache, clearCache } = useDataCache();
  const { showToast, showSuccess, showError } = useNotification();

  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiRequestJson<{ success: boolean; data: SubscriptionData }>(
        buildApiUrl('/subscriptions/status')
      );
      setCache('subscriptionStatus', result.data);
      setSubscriptionData(result.data);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        showToast('無法獲取訂閱狀態', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    // 過期視同 cache miss（getValidCache，5 分鐘 TTL）：領獎/付款等事件
    // 之外的陳舊性也有上限，會員到期日不會整個 session 顯示舊值。
    const cached = getValidCache('subscriptionStatus') as SubscriptionData | null;
    if (cached) {
      setSubscriptionData(cached);
      setIsLoading(false);
    } else {
      fetchStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const refresh = useCallback(async () => {
    clearCache('subscriptionStatus');
    await fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmCancel = useCallback(async (idNumber: string) => {
    const result = await apiRequestJson(
      buildApiUrl('/subscriptions/cancel'),
      { method: 'POST', body: JSON.stringify({ idNumber }) }
    );
    if (result.success) {
      showSuccess('訂閱已取消', '您的訂閱已成功取消');
      await refresh();
    } else {
      throw new Error(result.error?.message || '取消訂閱失敗');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResume = useCallback(async () => {
    setIsProcessing(true);
    try {
      const result = await apiRequestJson(
        buildApiUrl('/subscriptions/resume'),
        { method: 'POST' }
      );
      if (result.success) {
        showSuccess('訂閱已恢復', '您的訂閱已成功恢復');
        await refresh();
      } else {
        showError('恢復失敗', result.error?.message || '恢復訂閱失敗');
      }
    } catch (err) {
      showError('恢復失敗', err instanceof Error ? err.message : '恢復訂閱失敗');
    } finally {
      setIsProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMakeup = useCallback(async () => {
    showToast('正在處理補繳，請稍候...', 'info');
    setIsProcessing(true);
    try {
      const result = await apiRequestJson(
        buildApiUrl('/subscriptions/makeup'),
        { method: 'POST' }
      );
      if (result.success) {
        showSuccess('補繳成功', '您的訂閱已恢復，下次扣款日：' + result.data.nextPaymentDate);
        await refresh();
      } else {
        showError('補繳失敗', result.error?.message || '補繳失敗');
      }
    } catch (err) {
      showError('補繳失敗', err instanceof Error ? err.message : '補繳失敗');
    } finally {
      setIsProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { subscriptionData, isLoading, isProcessing, refresh, handleConfirmCancel, handleResume, handleMakeup };
}
