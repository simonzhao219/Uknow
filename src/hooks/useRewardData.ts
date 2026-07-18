import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import type { WithdrawalRecord } from '@contract';

export interface RewardsData {
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
  totalEarned: number;
  hasWithdrawnToday: boolean;
}

export type { WithdrawalRecord };

export interface UseRewardDataResult {
  rewardsData: RewardsData | null;
  withdrawals: WithdrawalRecord[];
  subscriptionStatus: string | null;
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearAndRefetch: () => Promise<void>;
}

const DEDUP_KEY = 'rewards+withdrawals';

export function useRewardData(): UseRewardDataResult {
  const { getCache, setCache, isStale, invalidate } = useDataCache();

  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setIsLoading(true);
      setError(null);
    }
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
      hasDataRef.current = true;

      // 注意：這裡把訂閱狀態的複本綁進 'rewards' 快取（提領資格判斷用），
      // 跟 useSubscription 的 'subscriptionStatus' 是兩份獨立快取——任何
      // 會改變訂閱狀態的流程必須同時清這兩把 key（MUTATION_GROUPS 的
      // payment / rewardClaim 群組都已涵蓋）。
      setCache('rewards', { rewardsData: rewardsResult.data, subscriptionStatus: status });
      setCache('withdrawals', withdrawalsResult.data.withdrawals);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? '登入已過期，請重新登入'
          : err instanceof Error
          ? err.message
          : '獲取資料失敗';
      if (!hasDataRef.current) {
        setError(msg);
      } else {
        console.error('[useRewardData] 背景重新請求失敗:', msg);
      }
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // stale-while-revalidate：兩把 key 都有快取才先畫（部分資料寧可
    // 走一次冷啟動），任一 stale 就背景重新請求。
    const cachedRewards = getCache('rewards');
    const cachedWithdrawals = getCache('withdrawals');
    if (cachedRewards && cachedWithdrawals) {
      setRewardsData(cachedRewards.rewardsData);
      setWithdrawals(cachedWithdrawals);
      setSubscriptionStatus(cachedRewards.subscriptionStatus);
      hasDataRef.current = true;
      setIsLoading(false);
    }
    if (!cachedRewards || !cachedWithdrawals || isStale('rewards') || isStale('withdrawals')) {
      dedupe(DEDUP_KEY, fetchData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRevalidateOnFocus(
    () => isStale('rewards') || isStale('withdrawals'),
    () => dedupe(DEDUP_KEY, fetchData)
  );

  const refetch = useCallback(() => dedupe(DEDUP_KEY, fetchData), [fetchData]);

  const clearAndRefetch = useCallback(async () => {
    invalidate('withdrawal'); // 清 rewards + withdrawals
    await dedupe(DEDUP_KEY, fetchData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rewardsData, withdrawals, subscriptionStatus, isLoading, isValidating, error, refetch, clearAndRefetch };
}
