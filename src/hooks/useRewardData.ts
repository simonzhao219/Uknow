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
      // 訂閱狀態不在這裡打——收斂到 useSubscription 作為唯一來源，避免
      // 兩份獨立快取在到期/續訂邊界互相矛盾（提領資格由 RewardDashboard
      // 直接讀 useSubscription 的 status 傳入 WithdrawalSection）。
      const [rewardsResult, withdrawalsResult] = await Promise.all([
        apiRequestJson<{ success: boolean; data: RewardsData }>(buildApiUrl('/rewards')),
        apiRequestJson<{ success: boolean; data: { withdrawals: WithdrawalRecord[] } }>(
          buildApiUrl('/rewards/withdrawals')
        ),
      ]);

      if (!rewardsResult.success) throw new Error('獲取獎勵資料失敗');
      if (!withdrawalsResult.success) throw new Error('獲取提領記錄失敗');

      setRewardsData(rewardsResult.data);
      setWithdrawals(withdrawalsResult.data.withdrawals);
      hasDataRef.current = true;

      setCache('rewards', { rewardsData: rewardsResult.data });
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

  return { rewardsData, withdrawals, isLoading, isValidating, error, refetch, clearAndRefetch };
}
