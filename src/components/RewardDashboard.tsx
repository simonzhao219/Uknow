import React, { useContext, useState } from 'react';
import { UserContext } from '../App';
import { RewardStats } from './reward/RewardStats';
import { WithdrawalSection } from './reward/WithdrawalSection';
import { WithdrawalProcess } from './reward/WithdrawalProcess';
import { RewardHistory } from './reward/RewardHistory';

export function RewardDashboard() {
  const { user } = useContext(UserContext);
  const [showWithdrawalProcess, setShowWithdrawalProcess] = useState(false);

  const handleStartWithdrawal = () => {
    setShowWithdrawalProcess(true);
  };

  const handleCancelWithdrawal = () => {
    setShowWithdrawalProcess(false);
  };

  if (showWithdrawalProcess) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">獎勵回饋</h1>
          <p className="text-muted-foreground">Point提領申請流程</p>
        </div>
        
        <WithdrawalProcess 
          availableRewards={user?.availableRewards || 0}
          onCancel={handleCancelWithdrawal}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">獎勵回饋</h1>
        <p className="text-muted-foreground">管理您的Point和提領申請</p>
      </div>

      <RewardStats 
        availableRewards={user?.availableRewards || 0}
        pendingRewards={user?.pendingRewards || 0}
        withdrawnRewards={user?.withdrawnRewards || 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WithdrawalSection 
          availableRewards={user?.availableRewards || 0}
          onStartWithdrawal={handleStartWithdrawal}
        />
        <RewardHistory />
      </div>
    </div>
  );
}