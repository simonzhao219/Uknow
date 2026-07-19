import React, { useState } from 'react';
import { useContext } from 'react';
import { UserContext } from '../App';
import { RewardStats } from './reward/RewardStats';
import { WithdrawalSection } from './reward/WithdrawalSection';
import { WithdrawalProcess } from './reward/WithdrawalProcess';
import { RewardHistory } from './reward/RewardHistory';
import { Button } from './ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useRewardData } from '../hooks/useRewardData';
import { useNotification } from './notifications/NotificationContext';

export function RewardDashboard() {
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  usePageRestoration();
  const { showError } = useNotification();

  const { rewardsData, withdrawals, subscriptionStatus, isLoading, error, refetch, clearAndRefetch } =
    useRewardData();

  const [showWithdrawalProcess, setShowWithdrawalProcess] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleStartWithdrawal = () => {
    if (subscriptionStatus === 'grace' || subscriptionStatus === 'expired') {
      const message =
        subscriptionStatus === 'grace'
          ? '訂閱處於寬限期，無法申請提領。請補繳以恢復服務。'
          : '訂閱已失效，無法申請提領。請重新訂閱以恢復服務。';
      showError('無法申請提領', message);
      return;
    }
    setShowWithdrawalProcess(true);
  };

  const handleSuccessWithdrawal = async () => {
    setShowWithdrawalProcess(false);
    await clearAndRefetch();
    setHistoryRefreshTrigger((prev) => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>重新載入</Button>
        </div>
      </div>
    );
  }

  if (showWithdrawalProcess) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
          onCancel={() => setShowWithdrawalProcess(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
        <RewardHistory refreshTrigger={historyRefreshTrigger} />
        <WithdrawalSection
          availableRewards={rewardsData?.availableRewards || 0}
          pendingRewards={rewardsData?.pendingRewards || 0}
          withdrawnRewards={rewardsData?.withdrawnRewards || 0}
          hasWithdrawnToday={rewardsData?.hasWithdrawnToday || false}
          withdrawals={withdrawals}
          onStartWithdrawal={handleStartWithdrawal}
          onRefresh={refetch}
          subscriptionStatus={subscriptionStatus}
          referralProgramJoined={user?.referralProgramJoined}
        />
      </div>
    </div>
  );
}
