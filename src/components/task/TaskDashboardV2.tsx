/**
 * Task Dashboard V2 Component
 * 
 * Main dashboard for task system
 * Shows Monthly King and Consecutive Referral Master progress
 * 
 * @component TaskDashboardV2
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2, RefreshCw, Gift, TrendingUp } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';
import { TaskProgressCard } from './TaskProgressCard';

interface TaskProgress {
  currentCount: number;
  targetCount: number;
  completedCount: number;
  progress: number;
  status: string;
  currentMonth: string;
}

interface TaskData {
  monthlyKing: TaskProgress;
  consecutiveReferral: TaskProgress;
}

interface TaskReward {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: Date | string;
}

interface TaskRewardData {
  rewards: TaskReward[];
  summary: {
    totalEarned: number;
    consecutiveCount: number;
    monthlyKingCount: number;
    consecutiveEarned: number;
    monthlyKingEarned: number;
  };
}

export function TaskDashboardV2() {
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [rewardData, setRewardData] = useState<TaskRewardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      // Fetch task progress
      const progressResult = await apiRequestJson<{
        success: boolean;
        data: TaskData;
        error?: { message: string };
      }>(buildApiUrl('/tasks-v2/progress'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (progressResult.success) {
        setTaskData(progressResult.data);
      } else {
        showToast(progressResult.error?.message || '載入失敗', 'error');
      }
      
      // Fetch task rewards
      const rewardResult = await apiRequestJson<{
        success: boolean;
        data: TaskRewardData;
        error?: { message: string };
      }>(buildApiUrl('/tasks-v2/rewards'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (rewardResult.success) {
        setRewardData(rewardResult.data);
      }
      
    } catch (error) {
      console.error('Failed to fetch task data:', error);
      showToast('載入任務資料失敗', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    fetchData(true);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }
  
  if (!taskData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        無法載入任務資料
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      {rewardData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Earned */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="h-5 w-5 text-yellow-600" />
                <span>任務獎勵總計</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {rewardData.summary.totalEarned}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                累計獲得點數
              </p>
            </CardContent>
          </Card>
          
          {/* Monthly King */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <span>推薦王</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">
                {rewardData.summary.monthlyKingCount}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                達成次數（{rewardData.summary.monthlyKingEarned} 點）
              </p>
            </CardContent>
          </Card>
          
          {/* Consecutive Referral */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span>連續推薦達人</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {rewardData.summary.consecutiveCount}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                達成次數（{rewardData.summary.consecutiveEarned} 點）
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              更新中...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新整理
            </>
          )}
        </Button>
      </div>
      
      {/* Task Progress Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly King */}
        <TaskProgressCard
          title="推薦王"
          description="單月內推薦10位會員即可達成，可多次達成"
          currentCount={taskData.monthlyKing.currentCount}
          targetCount={taskData.monthlyKing.targetCount}
          completedCount={taskData.monthlyKing.completedCount}
          progress={taskData.monthlyKing.progress}
          status={taskData.monthlyKing.status}
          reward={1000}
          icon="trophy"
          color="purple"
        />
        
        {/* Consecutive Referral Master */}
        <TaskProgressCard
          title="連續推薦達人"
          description="連續3個月，每月至少推薦1位會員"
          currentCount={taskData.consecutiveReferral.currentCount}
          targetCount={taskData.consecutiveReferral.targetCount}
          completedCount={taskData.consecutiveReferral.completedCount}
          progress={taskData.consecutiveReferral.progress}
          status={taskData.consecutiveReferral.status}
          reward={500}
          icon="trending"
          color="green"
        />
      </div>
      
      {/* Recent Rewards */}
      {rewardData && rewardData.rewards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>最近獲得的任務獎勵</CardTitle>
            <CardDescription>
              最近 50 筆任務獎勵記錄
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rewardData.rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex-1">
                    <p className="font-medium">{reward.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(reward.createdAt).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      +{reward.amount} 點
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Empty State */}
      {rewardData && rewardData.rewards.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>尚未獲得任務獎勵</p>
            <p className="text-sm mt-1">完成任務即可獲得獎勵點數</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
