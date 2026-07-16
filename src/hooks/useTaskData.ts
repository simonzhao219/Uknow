import { useState, useEffect, useCallback } from 'react';
import { useDataCache } from '../contexts/DataCacheContext';
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

export interface MonthlyProgress {
  month: string;
  hasReferral: boolean;
  firstReferral: {
    userName: string;
    userReferralCode: string;
    createdAt: string;
  } | null;
  status: 'completed' | 'missed' | 'pending' | 'future';
  gameMonth: number;
}

export interface MonthlyReferralRecord {
  userId: string;
  userName: string;
  userReferralCode: string;
  listingId: string | null;
  listingName: string | null;
  createdAt: string;
}

export interface CurrentMonthReferrals {
  month: string;
  total: number;
  completedCount: number;
  currentProgress: number;
  referrals: MonthlyReferralRecord[];
}

export interface PendingMissionReward {
  id: string;
  type: 'consecutive_referral' | 'monthly_king';
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
  monthlyProgress: MonthlyProgress[];
  currentMonthData: CurrentMonthReferrals | null;
  isLoading: boolean;
  loadingMonthly: boolean;
  loadingCurrent: boolean;
  loadingPending: boolean;
  error: string | null;
  fetchMonthlySummary: () => Promise<MonthlyProgress[] | null>;
  fetchCurrentMonthTop: () => Promise<CurrentMonthReferrals | null>;
  fetchPendingRewards: () => Promise<void>;
  handleClaimReward: (rewardId: string, idNumber: string) => Promise<void>;
}

export function useTaskData(): UseTaskDataResult {
  const { getValidCache, setCache, clearCache } = useDataCache();
  const { showSuccess, showToast } = useNotification();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingRewards, setPendingRewards] = useState<PendingMissionReward[]>([]);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgress[]>([]);
  const [currentMonthData, setCurrentMonthData] = useState<CurrentMonthReferrals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 過期視同 cache miss（getValidCache，5 分鐘 TTL）：推薦王的
        // 本月推薦數不再整個 session 卡在舊值。
        const cachedTasks = getValidCache('tasks');
        const cachedPending = getValidCache('pendingRewards');

        if (cachedTasks && cachedPending) {
          setTasks(cachedTasks);
          setPendingRewards(cachedPending);
          setIsLoading(false);
          return;
        }

        const [tasksResult, pendingResult] = await Promise.all([
          apiRequestJson<{ success: boolean; data: { tasks: Task[] } }>(buildApiUrl('/tasks')),
          apiRequestJson<{ success: boolean; data: PendingMissionReward[] }>(
            buildApiUrl('/tasks/pending-rewards')
          ),
        ]);

        if (tasksResult.success) {
          const sorted = (tasksResult.data.tasks || []).sort((a, b) => {
            const order: Record<string, number> = { monthly_king: 1, consecutive_referral: 2 };
            return (order[a.type] ?? 999) - (order[b.type] ?? 999);
          });
          setTasks(sorted);
          setCache('tasks', sorted);
        } else {
          throw new Error('獲取任務資料失敗');
        }

        if (pendingResult.success) {
          setPendingRewards(pendingResult.data);
          setCache('pendingRewards', pendingResult.data);
        }
      } catch (err) {
        const msg =
          err instanceof ApiError && err.status === 401
            ? '登入已過期，請重新登入'
            : err instanceof Error
            ? err.message
            : '獲取任務資料失敗';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMonthlySummary = useCallback(async (): Promise<MonthlyProgress[] | null> => {
    setLoadingMonthly(true);
    try {
      const result = await apiRequestJson<{ success: boolean; data: MonthlyProgress[] }>(
        buildApiUrl('/tasks/monthly-summary')
      );
      if (result.success) {
        setMonthlyProgress(result.data);
        return result.data;
      }
      throw new Error('獲取月度摘要失敗');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '獲取月度摘要失敗', 'error');
      return null;
    } finally {
      setLoadingMonthly(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      showSuccess('領取任務獎勵成功！', '獎勵已加入您的可提領點數');
      setPendingRewards((prev) => prev.filter((r) => r.id !== rewardId));
      clearCache('tasks');
      clearCache('pendingRewards');
      clearCache('rewards');
      // 領「免費續約一年」會直接改變會員到期日——MemberDashboard 的
      // SubscriptionStatusCard 讀的是 subscriptionStatus 快取，不清掉
      // 就會顯示舊到期日。刻意只失效、不用 claim 回傳的 activeUntil 做
      // 局部樂觀更新：SubscriptionData 欄位多（daysRemaining、
      // nextPaymentDate…），湊半個物件的風險大於下次進頁重抓的成本。
      clearCache('subscriptionStatus');
    } else {
      throw new Error('領取獎勵失敗');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    tasks,
    pendingRewards,
    monthlyProgress,
    currentMonthData,
    isLoading,
    loadingMonthly,
    loadingCurrent,
    loadingPending,
    error,
    fetchMonthlySummary,
    fetchCurrentMonthTop,
    fetchPendingRewards,
    handleClaimReward,
  };
}
