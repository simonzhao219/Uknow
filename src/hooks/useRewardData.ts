import { useState, useEffect, useCallback } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';

export interface RewardsData {
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
  totalEarned: number;
  lastUpdated: string;
  hasWithdrawnToday: boolean;
}

export interface WithdrawalRecord {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
}

export interface UseRewardDataResult {
  rewardsData: RewardsData | null;
  withdrawals: WithdrawalRecord[];
  subscriptionStatus: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearAndRefetch: () => Promise<void>;
}

export function useRewardData(): UseRewardDataResult {
  const { getValidCache, setCache, clearCache } = useDataCache();

  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [rewardsResult, withdrawalsResult, subscriptionResult] = await Promise.all([
        apiRequestJson<{ success: boolean; data: RewardsData }>(buildApiUrl('/rewards')),
        apiRequestJson<{ success: boolean; data: { withdrawals: WithdrawalRecord[] } }>(
          buildApiUrl('/rewards/withdrawals')
        ),
        apiRequestJson<{ success: boolean; data: { hasSubscription: boolean; status?: string } }>(
          buildApiUrl('/subscriptions/status')
        ),
      ]);

      if (!rewardsResult.success) throw new Error('獲取獎勵資料失敗');
      if (!withdrawalsResult.success) throw new Error('獲取提領記錄失敗');

      const status = subscriptionResult.success ? (subscriptionResult.data.status ?? null) : null;

      setRewardsData(rewardsResult.data);
      setWithdrawals(withdrawalsResult.data.withdrawals);
      setSubscriptionStatus(status);

      // 注意：這裡把訂閱狀態的複本綁進 'rewards' 快取（提領資格判斷用），
      // 跟 useSubscription 的 'subscriptionStatus' 是兩份獨立快取——任何
      // 會改變訂閱狀態的流程必須同時清這兩把 key（見 useTaskData 的
      // handleClaimReward）。
      setCache('rewards', { rewardsData: rewardsResult.data, subscriptionStatus: status });
      setCache('withdrawals', withdrawalsResult.data.withdrawals);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? '登入已過期，請重新登入'
          : err instanceof Error
          ? err.message
          : '獲取資料失敗';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 過期視同 cache miss（getValidCache，5 分鐘 TTL）：下線付款後，
    // 推薦人最多 5 分鐘內就能在獎勵頁看到新進的推薦獎金。
    const cachedRewards = getValidCache('rewards');
    const cachedWithdrawals = getValidCache('withdrawals');
    if (cachedRewards && cachedWithdrawals) {
      setRewardsData(cachedRewards.rewardsData);
      setWithdrawals(cachedWithdrawals);
      setSubscriptionStatus(cachedRewards.subscriptionStatus);
      setIsLoading(false);
    } else {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAndRefetch = useCallback(async () => {
    clearCache('rewards');
    clearCache('withdrawals');
    await fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rewardsData, withdrawals, subscriptionStatus, isLoading, error, refetch: fetchData, clearAndRefetch };
}
