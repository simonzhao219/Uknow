import React, { useContext, useState, useEffect } from 'react';
import { UserContext } from '../App';
import { RewardStats } from './reward/RewardStats';
import { WithdrawalSection } from './reward/WithdrawalSection';
import { WithdrawalProcess } from './reward/WithdrawalProcess';
import { RewardHistory } from './reward/RewardHistory';
import { Button } from './ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useDataCache } from '../contexts/DataCacheContext'; // ✅ 新增：資料快取
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from './notifications/NotificationContext';  // ✅ 新增

interface RewardsData {
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
  totalEarned: number;
  lastUpdated: string;
  hasWithdrawnToday: boolean;  // ✅ 新增：今日是否已提領過
}

interface WithdrawalRecord {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
}

export function RewardDashboard() {
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  usePageRestoration(); // ✅ 處理 Safari bfcache 頁面恢復問題
  const { showError } = useNotification();  // ✅ 新增
  const { getCache, setCache, hasCache, clearCache } = useDataCache(); // ✅ 新增：使用資料快取
  
  const [showWithdrawalProcess, setShowWithdrawalProcess] = useState(false);
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);  // ✅ 新增：訂閱狀態
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);  // ✅ 新增：獎勵明細刷新觸發器

  // ✅ 優化：使用快取
  useEffect(() => {
    const cachedRewards = hasCache('rewards') ? getCache('rewards') : null;
    const cachedWithdrawals = hasCache('withdrawals') ? getCache('withdrawals') : null;
    
    if (cachedRewards && cachedWithdrawals) {
      console.log('🎯 RewardDashboard: 使用快取的獎勵資料');
      setRewardsData(cachedRewards.rewardsData);
      setWithdrawals(cachedWithdrawals);
      setSubscriptionStatus(cachedRewards.subscriptionStatus);
      setIsLoading(false);
    } else {
      console.log('🔄 RewardDashboard: 無快取，載入新資料');
      fetchData();
    }
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // ✅ 並行獲取獎勵資料、提領記錄和訂閱狀態
      const [rewardsResult, withdrawalsResult, subscriptionResult] = await Promise.all([
        apiRequestJson<{ success: boolean; data: RewardsData }>(buildApiUrl('/rewards')),
        apiRequestJson<{ success: boolean; data: { withdrawals: WithdrawalRecord[] } }>(
          buildApiUrl('/rewards/withdrawals')
        ),
        apiRequestJson<{ success: boolean; data: { hasSubscription: boolean; status?: string } }>(
          buildApiUrl('/subscriptions/status')
        )
      ]);
      
      if (rewardsResult.success) {
        setRewardsData(rewardsResult.data);
      } else {
        throw new Error('獲取獎勵資料失敗');
      }

      if (withdrawalsResult.success) {
        setWithdrawals(withdrawalsResult.data.withdrawals);
      } else {
        throw new Error('獲取提領記錄失敗');
      }
      
      // ✅ 設置訂閱狀態
      if (subscriptionResult.success) {
        setSubscriptionStatus(subscriptionResult.data.status || null);
      }
      
      // ✅ 快取資料
      setCache('rewards', {
        rewardsData: rewardsResult.data,
        subscriptionStatus: subscriptionResult.data.status || null
      });
      setCache('withdrawals', withdrawalsResult.data.withdrawals);
      
    } catch (err) {
      console.error('獲取資料錯誤:', err);
      
      if (err instanceof ApiError && err.status === 401) {
        setError('登入已過期，請重新登入');
      } else {
        setError(err instanceof Error ? err.message : '獲取資料失敗');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartWithdrawal = () => {
    // ✅ URL 訪問控制：檢查訂閱狀態
    if (subscriptionStatus === 'grace' || subscriptionStatus === 'expired') {
      const message = subscriptionStatus === 'grace'
        ? '訂閱處於寬限期，無法申請提領。請補繳以恢復服務。'
        : '訂閱已失效，無法申請提領。請重新訂閱以恢復服務。';
      
      showError('無法申請提領', message);
      return;
    }
    
    setShowWithdrawalProcess(true);
  };

  const handleCancelWithdrawal = () => {
    setShowWithdrawalProcess(false);
  };

  const handleSuccessWithdrawal = () => {
    // ✅ 清除快取（提領申請成功，獎勵資料變更）
    clearCache('rewards');
    clearCache('withdrawals');
    
    setShowWithdrawalProcess(false);
    fetchData(); // 重新載入資料以更新統計
    setHistoryRefreshTrigger(prev => prev + 1);  // ✅ 新增：觸發獎勵明細刷新
  };

  // 載入狀態
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
            {/*<p className="text-muted-foreground">管理您的Point和提領申請</p>*/}
          </div>
        </div>
        
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // 錯誤狀態
  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
            {/*<p className="text-muted-foreground">管理您的Point和提領申請</p>*/}
          </div>
        </div>
        
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            重新載入
          </Button>
        </div>
      </div>
    );
  }

  if (showWithdrawalProcess) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
            <p className="text-muted-foreground">Point提領申請流程</p>
          </div>
        </div>
        
        <WithdrawalProcess 
          availableRewards={rewardsData?.availableRewards || 0}
          pendingRewards={rewardsData?.pendingRewards || 0}
          onSuccess={handleSuccessWithdrawal}
          onCancel={handleCancelWithdrawal}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">獎勵回饋</h1>
          <p className="text-muted-foreground">管理您的Point和提領申請</p>
        </div>
      </div>

      <RewardStats 
        availableRewards={rewardsData?.availableRewards || 0}
        pendingRewards={rewardsData?.pendingRewards || 0}
        withdrawnRewards={rewardsData?.withdrawnRewards || 0}
        totalRewards={rewardsData?.totalEarned || 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WithdrawalSection 
          availableRewards={rewardsData?.availableRewards || 0}
          pendingRewards={rewardsData?.pendingRewards || 0}
          withdrawnRewards={rewardsData?.withdrawnRewards || 0}
          hasWithdrawnToday={rewardsData?.hasWithdrawnToday || false}
          withdrawals={withdrawals}
          onStartWithdrawal={handleStartWithdrawal}
          onRefresh={fetchData}
          subscriptionStatus={subscriptionStatus}
          referralProgramJoined={user?.referralProgramJoined}  // ✅ 新增：傳遞是否加入推薦計畫
        />
        <RewardHistory refreshTrigger={historyRefreshTrigger} />
      </div>
    </div>
  );
}