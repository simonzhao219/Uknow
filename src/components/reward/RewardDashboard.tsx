/**
 * Reward Dashboard Component
 * 
 * Main dashboard for rewards
 * Shows summary statistics and navigation to schedules/history
 * 
 * @component RewardDashboard
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  Coins,
  TrendingUp,
  Calendar,
  Gift,
  Loader2
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';
import { RewardScheduleView } from './RewardScheduleView';
import { RewardHistory } from './RewardHistory';

interface RewardSummary {
  currentBalance: number;
  totalEarned: number;
  totalTransactions: number;
  byGeneration: {
    gen1: number;
    gen2: number;
    gen3: number;
  };
  pendingRewards: {
    amount: number;
    count: number;
  };
}

export function RewardDashboard() {
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchSummary();
  }, []);
  
  const fetchSummary = async () => {
    setIsLoading(true);
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data: RewardSummary;
        error?: { message: string };
      }>(buildApiUrl('/rewards-v2/summary'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (result.success) {
        setSummary(result.data);
      } else {
        showToast(result.error?.message || '載入失敗', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
      showToast('載入摘要失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }
  
  if (!summary) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        無法載入獎勵資訊
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Balance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-yellow-600" />
              <span>當前餘額</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {summary.currentBalance}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              可用點數
            </p>
          </CardContent>
        </Card>
        
        {/* Total Earned */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span>累計獲得</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {summary.totalEarned}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              共 {summary.totalTransactions} 筆交易
            </p>
          </CardContent>
        </Card>
        
        {/* Pending Rewards */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-orange-600" />
              <span>待發放</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {summary.pendingRewards.amount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {summary.pendingRewards.count} 筆排程
            </p>
          </CardContent>
        </Card>
        
        {/* Total from Referrals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-purple-600" />
              <span>推薦獎勵</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {summary.byGeneration.gen1 + summary.byGeneration.gen2 + summary.byGeneration.gen3}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              三代總計
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Generation Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>各代獎勵統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-600"></div>
                <span className="font-medium">第一代</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {summary.byGeneration.gen1}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                直接推薦獎勵
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-purple-600"></div>
                <span className="font-medium">第二代</span>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {summary.byGeneration.gen2}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                間接推薦獎勵
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-orange-600"></div>
                <span className="font-medium">第三代</span>
              </div>
              <div className="text-2xl font-bold text-orange-600">
                {summary.byGeneration.gen3}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                第三層推薦獎勵
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Tabs for Schedules and History */}
      <Tabs defaultValue="schedules" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="schedules">
            <Calendar className="h-4 w-4 mr-2" />
            獎勵排程
          </TabsTrigger>
          <TabsTrigger value="history">
            <Gift className="h-4 w-4 mr-2" />
            歷史記錄
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="schedules" className="mt-6">
          <RewardScheduleView />
        </TabsContent>
        
        <TabsContent value="history" className="mt-6">
          <RewardHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
