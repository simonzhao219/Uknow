/**
 * Reward Schedule View Component
 * 
 * Displays user's reward schedules (pending, completed, voided)
 * Shows timeline and statistics
 * 
 * @component RewardScheduleView
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  Calendar, 
  Clock,
  CheckCircle2,
  XCircle,
  Coins,
  TrendingUp,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface Schedule {
  id: string;
  sourceUserName: string;
  generation: number;
  monthNumber: number;
  amount: number;
  scheduledDate: string;
  issuedDate?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  status: 'Pending' | 'Completed' | 'Void';
}

interface ScheduleData {
  pending: Schedule[];
  completed: Schedule[];
  voided: Schedule[];
  summary: {
    totalScheduled: number;
    pendingCount: number;
    completedCount: number;
    voidedCount: number;
    totalEarned: number;
    totalPending: number;
  };
}

export function RewardScheduleView() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'voided'>('pending');
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchSchedules();
  }, []);
  
  const fetchSchedules = async (showRefreshIndicator = false) => {
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
      
      const result = await apiRequestJson<{
        success: boolean;
        data: ScheduleData;
        error?: { message: string };
      }>(buildApiUrl('/rewards-v2/schedules'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (result.success) {
        setData(result.data);
      } else {
        showToast(result.error?.message || '載入失敗', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      showToast('載入排程失敗', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    fetchSchedules(true);
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }
  
  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          無法載入獎勵排程
        </CardContent>
      </Card>
    );
  }
  
  const { summary } = data;
  
  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Scheduled */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
              <span>總排程數</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {summary.totalScheduled}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              所有獎勵排程
            </p>
          </CardContent>
        </Card>
        
        {/* Pending */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-orange-600" />
              <span>待發放</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {summary.pendingCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              預計獲得 {summary.totalPending} 點
            </p>
          </CardContent>
        </Card>
        
        {/* Completed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span>已發放</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {summary.completedCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              已獲得 {summary.totalEarned} 點
            </p>
          </CardContent>
        </Card>
        
        {/* Voided */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <XCircle className="h-5 w-5 text-gray-600" />
              <span>已作廢</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">
              {summary.voidedCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              已失效排程
            </p>
          </CardContent>
        </Card>
      </div>
      
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
      
      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>獎勵排程</CardTitle>
          <CardDescription>
            查看您的獎勵發放排程
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab Buttons */}
          <div className="flex gap-2 mb-6 border-b">
            <button
              onClick={() => setActiveTab('pending')}
              className={`
                pb-2 px-4 font-medium transition-colors
                ${activeTab === 'pending' 
                  ? 'border-b-2 border-orange-600 text-orange-600' 
                  : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              待發放 ({summary.pendingCount})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`
                pb-2 px-4 font-medium transition-colors
                ${activeTab === 'completed' 
                  ? 'border-b-2 border-green-600 text-green-600' 
                  : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              已發放 ({summary.completedCount})
            </button>
            <button
              onClick={() => setActiveTab('voided')}
              className={`
                pb-2 px-4 font-medium transition-colors
                ${activeTab === 'voided' 
                  ? 'border-b-2 border-gray-600 text-gray-600' 
                  : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              已作廢 ({summary.voidedCount})
            </button>
          </div>
          
          {/* Schedule List */}
          <div className="space-y-3">
            {activeTab === 'pending' && (
              data.pending.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>目前沒有待發放的獎勵</p>
                </div>
              ) : (
                data.pending.map((schedule) => (
                  <ScheduleCard key={schedule.id} schedule={schedule} />
                ))
              )
            )}
            
            {activeTab === 'completed' && (
              data.completed.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>尚未有已發放的獎勵</p>
                </div>
              ) : (
                data.completed.map((schedule) => (
                  <ScheduleCard key={schedule.id} schedule={schedule} />
                ))
              )
            )}
            
            {activeTab === 'voided' && (
              data.voided.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>沒有已作廢的獎勵</p>
                </div>
              ) : (
                data.voided.map((schedule) => (
                  <ScheduleCard key={schedule.id} schedule={schedule} />
                ))
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Schedule Card Component
function ScheduleCard({ schedule }: { schedule: Schedule }) {
  const statusConfig = {
    Pending: {
      color: 'bg-orange-100 text-orange-800 border-orange-300',
      icon: Clock,
      label: '待發放'
    },
    Completed: {
      color: 'bg-green-100 text-green-800 border-green-300',
      icon: CheckCircle2,
      label: '已發放'
    },
    Void: {
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      icon: XCircle,
      label: '已作廢'
    }
  };
  
  const config = statusConfig[schedule.status];
  const Icon = config.icon;
  
  const generationColors = {
    1: 'text-green-600',
    2: 'text-purple-600',
    3: 'text-orange-600'
  };
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center shrink-0
          ${config.color.replace('text-', 'bg-').replace('800', '200')}
        `}>
          <Icon className={`h-5 w-5 ${config.color.split(' ')[0].replace('bg-', 'text-')}`} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium">
              {schedule.sourceUserName}
            </p>
            <Badge variant="outline" className={generationColors[schedule.generation as 1 | 2 | 3]}>
              第{schedule.generation}代
            </Badge>
            <Badge variant="outline">
              第{schedule.monthNumber}月
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />
              <span>{schedule.amount} 點</span>
            </div>
            
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {schedule.status === 'Pending' && (
                <span>預定 {new Date(schedule.scheduledDate).toLocaleDateString('zh-TW')}</span>
              )}
              {schedule.status === 'Completed' && schedule.issuedDate && (
                <span>發放於 {new Date(schedule.issuedDate).toLocaleDateString('zh-TW')}</span>
              )}
              {schedule.status === 'Void' && schedule.voidedAt && (
                <span>作廢於 {new Date(schedule.voidedAt).toLocaleDateString('zh-TW')}</span>
              )}
            </div>
          </div>
          
          {schedule.voidReason && (
            <p className="text-xs text-gray-500 mt-2">
              作廢原因：{schedule.voidReason}
            </p>
          )}
          
          <Badge className={config.color} variant="outline">
            {config.label}
          </Badge>
        </div>
      </div>
    </div>
  );
}
