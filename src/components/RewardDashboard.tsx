import React, { useContext, useState, useEffect } from 'react';
import { UserContext } from '../App';
import { RewardStats } from './reward/RewardStats';
import { WithdrawalSection } from './reward/WithdrawalSection';
import { WithdrawalProcess } from './reward/WithdrawalProcess';
import { RewardHistory } from './reward/RewardHistory';
import { Button } from './ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';

interface RewardsData {
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
  totalEarned: number;
  lastUpdated: string;
}

export function RewardDashboard() {
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const [showWithdrawalProcess, setShowWithdrawalProcess] = useState(false);
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 獲取獎勵資料
  useEffect(() => {
    const fetchRewards = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // ✅ 使用統一的 API 請求工具
        const result = await apiRequestJson<{ success: boolean; data: RewardsData }>(
          buildApiUrl('/rewards')
        );
        
        if (result.success) {
          setRewardsData(result.data);
        } else {
          throw new Error('獲取獎勵資料失敗');
        }
      } catch (err) {
        console.error('獲取獎勵資料錯誤:', err);
        
        if (err instanceof ApiError && err.status === 401) {
          setError('登入已過期，請重新登入');
        } else {
          setError(err instanceof Error ? err.message : '獲取獎勵資料失敗');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchRewards();
  }, []);

  const handleStartWithdrawal = () => {
    setShowWithdrawalProcess(true);
  };

  const handleCancelWithdrawal = () => {
    setShowWithdrawalProcess(false);
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
            <p className="text-muted-foreground">管理您的Point和提領申請</p>
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
            <p className="text-muted-foreground">管理您的Point和提領申請</p>
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
        totalEarned={rewardsData?.totalEarned || 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WithdrawalSection 
          availableRewards={rewardsData?.availableRewards || 0}
          onStartWithdrawal={handleStartWithdrawal}
        />
        <RewardHistory />
      </div>
    </div>
  );
}