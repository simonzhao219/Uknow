import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';

export interface TaskReward {
  type: 'free_renewal_year';
  label: string;
}

export interface Task {
  id: string;
  type: string;
  title: string;
  description: string;
  target: number;
  current: number;
  completed: boolean;
  reward: TaskReward;
  progress: number;
  hasUnclaimedReward?: boolean;
  unclaimedRewardCount?: number;
  details: any;
}

export interface MonthlyReferralRecord {
  userId: string;
  userName: string;
  userReferralCode: string | null;
  createdAt: string | null;
}

export interface CurrentMonthReferrals {
  month: string;
  total: number;
  completedCount: number;
  currentProgress: number;
  referrals: MonthlyReferralRecord[];
  target: number;  // 推薦王月門檻（reward_config），前端進度以此為準
}

export interface PendingMissionReward {
  id: string;
  type: 'monthly_king';
  rewardType?: 'free_renewal_year';
  amount: number;
  achievedAt: string;
  status: 'pending' | 'claimed' | 'expired';
  description: string;
  details: any;
}

export interface UseTaskDataResult {
  tasks: Task[];
  pendingRewards: PendingMissionReward[];
  currentMonthData: CurrentMonthReferrals | null;
  isLoading: boolean;
  isValidating: boolean;
  loadingCurrent: boolean;
  loadingPending: boolean;
  error: string | null;
  fetchCurrentMonthTop: () => Promise<CurrentMonthReferrals | null>;
  fetchPendingRewards: () => Promise<void>;
  handleClaimReward: (rewardId: string, idNumber: string) => Promise<void>;
}

const DEDUP_KEY = 'tasks+pendingRewards';

export function useTaskData(): UseTaskDataResult {
  const { getCache, setCache, isStale, invalidate } = useDataCache();
  const { showSuccess, showToast } = useNotification();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingRewards, setPendingRewards] = useState<PendingMissionReward[]>([]);
  const [currentMonthData, setCurrentMonthData] = useState<CurrentMonthReferrals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const fetchAllData = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setIsLoading(true);
      setError(null);
    }
    try {
      const [tasksResult, pendingResult] = await Promise.all([
        apiRequestJson<{ success: boolean; data: { tasks: Task[] } }>(buildApiUrl('/tasks')),
        apiRequestJson<{ success: boolean; data: PendingMissionReward[] }>(
          buildApiUrl('/tasks/pending-rewards')
        ),
      ]);

      if (tasksResult.success) {
        const list = tasksResult.data.tasks || [];
        setTasks(list);
        setCache('tasks', list);
      } else {
        throw new Error('獲取任務資料失敗');
      }

      if (pendingResult.success) {
        setPendingRewards(pendingResult.data);
        setCache('pendingRewards', pendingResult.data);
      }
      hasDataRef.current = true;
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? '登入已過期，請重新登入'
          : err instanceof Error
          ? err.message
          : '獲取任務資料失敗';
      if (!hasDataRef.current) {
        setError(msg);
      } else {
        console.error('[useTaskData] 背景重新請求失敗:', msg);
      }
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // stale-while-revalidate：有快取先畫（秒開），同時背景重新請求——
    // 推薦王的本月推薦數在 F5 後一個 round-trip 內就是最新值。
    const cachedTasks = getCache('tasks');
    const cachedPending = getCache('pendingRewards');
    if (cachedTasks && cachedPending) {
      setTasks(cachedTasks);
      setPendingRewards(cachedPending);
      hasDataRef.current = true;
      setIsLoading(false);
    }
    if (!cachedTasks || !cachedPending || isStale('tasks') || isStale('pendingRewards')) {
      dedupe(DEDUP_KEY, fetchAllData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRevalidateOnFocus(
    () => isStale('tasks') || isStale('pendingRewards'),
    () => dedupe(DEDUP_KEY, fetchAllData)
  );

  const fetchCurrentMonthTop = useCallback(async (): Promise<CurrentMonthReferrals | null> => {
    setLoadingCurrent(true);
    try {
      const result = await apiRequestJson<{ success: boolean; data: CurrentMonthReferrals }>(
        buildApiUrl('/tasks/current-month-top?limit=100')
      );
      if (result.success) {
        setCurrentMonthData(result.data);
        return result.data;
      }
      throw new Error('獲取本月推薦失敗');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '獲取本月推薦失敗', 'error');
      return null;
    } finally {
      setLoadingCurrent(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPendingRewards = useCallback(async () => {
    setLoadingPending(true);
    try {
      const result = await apiRequestJson<{ success: boolean; data: PendingMissionReward[] }>(
        buildApiUrl('/tasks/pending-rewards')
      );
      if (result.success) {
        setPendingRewards(result.data);
        setCache('pendingRewards', result.data);
      }
    } catch (err) {
      console.error('獲取待領取獎勵錯誤:', err);
    } finally {
      setLoadingPending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClaimReward = useCallback(async (rewardId: string, idNumber: string) => {
    const result = await apiRequestJson<{ success: boolean; data: any }>(
      buildApiUrl(`/tasks/claim-reward/${rewardId}`),
      { method: 'POST', body: JSON.stringify({ idNumber }) }
    );
    if (result.success) {
      showSuccess('領取任務獎勵成功！', '免費續約 1 年已加入您的會員效期');
      setPendingRewards((prev) => prev.filter((r) => r.id !== rewardId));
      // 領「免費續約一年」直接改變會員到期日——一次失效整組相關快取
      // （tasks / pendingRewards / rewards / subscriptionStatus，見
      // MUTATION_GROUPS.rewardClaim）。刻意只失效、不做局部樂觀更新：
      // 下次進頁重抓的成本低於湊半個物件的風險。
      invalidate('rewardClaim');
    } else {
      throw new Error('領取獎勵失敗');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    tasks,
    pendingRewards,
    currentMonthData,
    isLoading,
    isValidating,
    loadingCurrent,
    loadingPending,
    error,
    fetchCurrentMonthTop,
    fetchPendingRewards,
    handleClaimReward,
  };
}
