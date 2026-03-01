import React, { useContext, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { UserContext } from '../App';
import { Calendar, Trophy, Target, Gift, Clock, CheckCircle, AlertTriangle, ArrowLeft, Loader2, Eye, Zap, Sparkles } from 'lucide-react';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useNavigate } from 'react-router-dom';
import { useDataCache } from '../contexts/DataCacheContext'; // ✅ 新增：資料快取
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { formatTimestamp } from '../utils/referralFormatter';

// ✅ 新增：使用正確的格式化工具
import { getTaskBadge, getMotivationText, getProgressColor, getProgressBarStyle } from '../utils/userReferralFormatter';

// ✅ 新增：導入新組件
import { MonthlyCalendarView } from './task/MonthlyCalendarView';
import { MonthlyKingProgress } from './task/MonthlyKingProgress';
import { ClaimRewardDialog } from './task/ClaimRewardDialog';
import { TaskBadge } from './task/TaskBadge';

interface Task {
  id: string;
  type: string;
  title: string;
  description: string;
  target: number;
  current: number;
  completed: boolean;
  reward: number;
  progress: number;
  details: any;
}

/**
 * ✅ 月度推薦記錄（更新格式）
 */
interface MonthlyReferralRecord {
  userId: string;
  userName: string;
  userReferralCode: string;  // ✅ 正確：推薦碼
  listingId: string | null;  // ✅ 可空
  listingName: string | null;
  createdAt: string;
}

/**
 * ✅ 月度進度（更新格式）
 */
interface MonthlyProgress {
  month: string; // "2024-12"
  hasReferral: boolean;
  firstReferral: {
    userName: string;
    userReferralCode: string;
    createdAt: string;
  } | null;
  status: 'completed' | 'missed' | 'pending' | 'future'; // ✅ 新增
  gameMonth: number; // ✅ 新增：遊戲月份序號（1-12）
}

/**
 * ✅ 本月推薦列表（更新格式）
 */
interface CurrentMonthReferrals {
  month: string;
  total: number;
  completedCount: number;     // ✅ 新增：本月已完成次數
  currentProgress: number;    // ✅ 新增：當前進度
  referrals: MonthlyReferralRecord[];
}

/**
 * ✅ 遊戲元數據（新增）
 */
interface GameMeta {
  startMonth: string | null; // ✅ 新增：遊戲開始月份
  currentGameMonth: number;   // ✅ 新增：當前處於遊戲的第幾個月
  isActive: boolean;          // ✅ 新增：遊戲是否進行中
  completedCount: number;     // ✅ 新增：已完月數
  message?: string;           // ✅ 新增：提示訊息（未開始遊戲時）
}

/**
 * 待領取任務獎勵
 * 
 * ✅ 移除 previewData 字段
 * - 不再使用任務達成時緩存的舊數據
 * - 改為在對話框第二步實時調用 GET /rewards/points-preview 獲取最新 SSOT 數據
 */
interface PendingMissionReward {
  id: string;
  type: 'consecutive_referral' | 'monthly_king';
  amount: number;
  achievedAt: string;
  status: 'pending' | 'claimed' | 'expired';
  description: string;
  details: any;
}

export function TaskDashboard() {
  const { user } = useContext(UserContext);
  const { showSuccess, showToast } = useNotification();
  const handleBack = useBackNavigation();
  const navigate = useNavigate();
  const { getCache, setCache, hasCache, clearCache } = useDataCache(); // ✅ 新增：使用資料快取
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // ===== 詳情視圖狀態 =====
  const [showMonthlyCalendar, setShowMonthlyCalendar] = useState(false);
  const [showKingProgress, setShowKingProgress] = useState(false);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgress[]>([]);
  const [currentMonthData, setCurrentMonthData] = useState<CurrentMonthReferrals | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  // ===== 待領取獎勵狀態 =====
  const [pendingRewards, setPendingRewards] = useState<PendingMissionReward[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedReward, setSelectedReward] = useState<PendingMissionReward | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);

  // ✅ 優化：獲取任務資料（使用快取）
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // ✅ 檢查快取
        const cachedTasks = hasCache('tasks') ? getCache('tasks') : null;
        const cachedPending = hasCache('pendingRewards') ? getCache('pendingRewards') : null;
        
        if (cachedTasks && cachedPending) {
          console.log('🎯 TaskDashboard: 使用快取的任務資料');
          setTasks(cachedTasks);
          setPendingRewards(cachedPending);
          setIsLoading(false);
          return;
        }
        
        console.log('🔄 TaskDashboard: 無快取，載入新資料');
        
        // ✅ 並行請求（不互相依賴）
        const [tasksResult, pendingResult] = await Promise.all([
          apiRequestJson<{ success: boolean; data: { tasks: Task[] } }>(
            buildApiUrl('/tasks')
          ),
          apiRequestJson<{ success: boolean; data: PendingMissionReward[] }>(
            buildApiUrl('/tasks/pending-rewards')
          )
        ]);
        
        // 處理任務列表
        if (tasksResult.success) {
          // ✅ 排序任務：推薦王 (monthly_king) 排在連續推薦達人 (consecutive_referral) 之前
          const sortedTasks = (tasksResult.data.tasks || []).sort((a, b) => {
            const order = { 'monthly_king': 1, 'consecutive_referral': 2 };
            return (order[a.type as keyof typeof order] || 999) - (order[b.type as keyof typeof order] || 999);
          });
          
          setTasks(sortedTasks);
          setCache('tasks', sortedTasks); // ✅ 快取任務列表
        } else {
          throw new Error('獲取任務資料失敗');
        }
        
        // 處理待領取獎勵
        if (pendingResult.success) {
          setPendingRewards(pendingResult.data);
          setCache('pendingRewards', pendingResult.data); // ✅ 快取待領取獎勵
        }
      } catch (err) {
        console.error('獲取任務資料錯誤:', err);
        
        if (err instanceof ApiError && err.status === 401) {
          setError('登入已過期，請重新登入');
        } else {
          setError(err instanceof Error ? err.message : '獲取任務資料失敗');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // ===== 獲取待領取獎勵（手動刷新用）=====
  const fetchPendingRewards = async () => {
    try {
      setLoadingPending(true);
      
      const result = await apiRequestJson<{
        success: boolean;
        data: PendingMissionReward[];
      }>(buildApiUrl('/tasks/pending-rewards'));
      
      if (result.success) {
        setPendingRewards(result.data);
        setCache('pendingRewards', result.data); // ✅ 快取待領取獎勵
      }
    } catch (err) {
      console.error('獲取待領取獎勵錯誤:', err);
    } finally {
      setLoadingPending(false);
    }
  };

  // ===== 獲取 12 個月摘要 =====
  const fetchMonthlySummary = async () => {
    try {
      setLoadingMonthly(true);
      
      const result = await apiRequestJson<{
        success: boolean;
        data: MonthlyProgress[];
      }>(buildApiUrl('/tasks/monthly-summary'));
      
      if (result.success) {
        console.log('📊 獲取月度摘要成功:', result.data); // ✅ 添加日誌
        setMonthlyProgress(result.data);
        setShowMonthlyCalendar(true);
      } else {
        console.error('❌ 獲取月度摘要失敗:', result);
        throw new Error('獲取月度摘要失敗');
      }
    } catch (err) {
      console.error('獲取月度摘要錯誤:', err);
      showToast(err instanceof Error ? err.message : '獲取月度摘要失敗', 'error');
    } finally {
      setLoadingMonthly(false);
    }
  };

  // ===== 獲取本月推薦列表 =====
  const fetchCurrentMonthTop = async () => {
    try {
      setLoadingCurrent(true);
      
      const result = await apiRequestJson<{
        success: boolean;
        data: CurrentMonthReferrals;
      }>(buildApiUrl('/tasks/current-month-top?limit=100')); // 獲取全部
      
      if (result.success) {
        console.log('📊 獲取本月推薦成功:', result.data); // ✅ 添加日誌
        setCurrentMonthData(result.data);
        setShowKingProgress(true);
      } else {
        console.error('❌ 獲取本月推薦失敗:', result);
        throw new Error('獲取本月推薦失敗');
      }
    } catch (err) {
      console.error('獲取本月推薦錯誤:', err);
      showToast(err instanceof Error ? err.message : '獲取本月推薦失敗', 'error');
    } finally {
      setLoadingCurrent(false);
    }
  };

  // ===== 領取獎勵 =====
  const handleClaimReward = async (rewardId: string, idNumber: string) => {
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: any;
      }>(buildApiUrl(`/tasks/claim-reward/${rewardId}`), {
        method: 'POST',
        body: JSON.stringify({ idNumber })
      });
      
      if (result.success) {
        showSuccess('領取任務獎勵成功！', '獎勵已加入您的可提領點數');
        setPendingRewards(pendingRewards.filter(r => r.id !== rewardId));
        
        // ✅ 清除快取（任務狀態和待領取獎勵都可能變更）
        clearCache('tasks');
        clearCache('pendingRewards');
        clearCache('rewards'); // 獎勵點數變更，清除 RewardDashboard 快取
        
        setShowClaimDialog(false);
        setSelectedReward(null);
      } else {
        throw new Error('領取獎勵失敗');
      }
    } catch (err) {
      console.error('領取獎勵錯誤:', err);
      throw err; // 讓 Dialog 處理錯誤顯示
    }
  };

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
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
            <h1 className="text-3xl font-bold">任務中心</h1>
            <p className="text-muted-foreground">完成推薦任務，解鎖專屬獎勵！</p>
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
            <h1 className="text-3xl font-bold">任務中心</h1>
            {/*<p className="text-muted-foreground">完成推薦任務，解鎖專屬獎勵！</p>*/}
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 標題 */}
      <div className="flex items-center justify-between">
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
            <h1 className="text-3xl font-bold">任務中心</h1>
            {/*<p className="text-muted-foreground">完成推薦任務，解鎖專屬獎勵！</p>*/}
          </div>
        </div>
      </div>

      {/* ===== 🎁 待領取任務獎勵 ===== */}
      {pendingRewards.length > 0 && (
        <Card className="border-2 border-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50 animate-pulse">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-yellow-600" />
                <CardTitle className="text-xl">🎁 待領取任務獎勵</CardTitle>
              </div>
              <Badge variant="default" className="bg-yellow-600 text-white text-base px-3 py-1">
                {pendingRewards.length} 個待領取
              </Badge>
            </div>
            <CardDescription className="text-base">
              🎉 恭喜！您有 {pendingRewards.length} 個任務獎勵待領取，請盡快領取！
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-3">
            {pendingRewards.map((reward) => (
              <div key={reward.id} className="p-4 bg-white border-2 border-yellow-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* 獎勵標題 */}
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-600 shrink-0" />
                      <p className="font-bold text-lg">{reward.description}</p>
                    </div>
                    
                    {/* 獎勵資訊 */}
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <div className="flex items-center gap-1">
                        <Gift className="h-4 w-4 text-yellow-600" />
                        <span className="text-muted-foreground">獎勵:</span>
                        <span className="font-bold text-yellow-600 text-base">{reward.amount} P</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {formatTimestamp(reward.achievedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 領取按鈕 */}
                  <Button 
                    size="lg"
                    onClick={() => {
                      setSelectedReward(reward);
                      setShowClaimDialog(true);
                    }}
                    className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white gap-2 shrink-0"
                  >
                    <Gift className="h-5 w-5" />
                    立即領取
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ===== 📊 進行中的任務 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tasks.map((task) => {
          const badge = getTaskBadge(task.type as any, task.current);
          const motivationText = getMotivationText(task.progress);
          const progressColor = getProgressColor(task.progress);
          
          return (
            <Card key={task.id} className="relative overflow-hidden border-2 hover:shadow-lg transition-shadow">
              {/* 背景漸變 */}
              <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 ${
                task.type === 'consecutive_referral' 
                  ? 'bg-gradient-to-br from-blue-500 to-purple-500' 
                  : 'bg-gradient-to-br from-orange-500 to-yellow-500'
              } rounded-full -mr-16 -mt-16`}></div>
              
              <CardHeader className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Trophy className="h-6 w-6 text-yellow-500 shrink-0" />
                    <div>
                      <CardTitle className="text-xl">{task.title}</CardTitle>
                      <CardDescription className="mt-1">{task.description}</CardDescription>
                    </div>
                  </div>
                </div>
                
                {/* 成就徽章 */}
                <div className="mt-3">
                  <TaskBadge type={task.type as any} progress={task.current} />
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4 relative">
                {/* 進度條 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">任務進度</span>
                    <span className={`text-sm font-bold ${progressColor}`}>
                      {task.current} / {task.target}
                    </span>
                  </div>
                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${getProgressBarStyle(task.progress)}`}
                      style={{ width: `${Math.min(task.progress, 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {motivationText}
                  </p>
                </div>

                {/* 獎勵資訊 */}
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <div className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-yellow-600" />
                    <span className="text-sm font-medium">任務獎勵</span>
                  </div>
                  <span className="text-lg font-bold text-yellow-600">{task.reward} P</span>
                </div>

                {/* 連續推薦達人詳情 */}
                {task.type === 'consecutive_referral' && task.details && (
                  <div className="space-y-3">
                    {task.details.startMonth && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          開始: {formatMonth(task.details.startMonth)}
                          {task.details.lastActiveMonth && ` · 最後活躍: ${formatMonth(task.details.lastActiveMonth)}`}
                        </span>
                      </div>
                    )}
                    
                    {task.current > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={fetchMonthlySummary}
                        disabled={loadingMonthly}
                        className="w-full gap-2"
                      >
                        {loadingMonthly ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            載入中...
                          </>
                        ) : (
                          <>
                            <Calendar className="h-4 w-4" />
                            查看 12 個月詳情
                          </>
                        )}
                      </Button>
                    )}

                    {task.current === 0 && (
                      <Alert>
                        <Zap className="h-4 w-4" />
                        <AlertDescription>
                        完成第一次推薦後，任務將自動啟動！
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* 推薦王詳情 */}
                {task.type === 'monthly_king' && task.details && (
                  <div className="space-y-3">
                    {task.details.currentMonth && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Target className="h-4 w-4" />
                        <span>
                          本月 ({formatMonth(task.details.currentMonth)}) 已推薦 {task.current} 人
                        </span>
                      </div>
                    )}
                    
                    {task.details.completedMonths > 0 && (
                      <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        累計完成 {task.details.completedMonths} 次推薦王任務
                      </div>
                    )}
                    
                    {task.current > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={fetchCurrentMonthTop}
                        disabled={loadingCurrent}
                        className="w-full gap-2"
                      >
                        {loadingCurrent ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            載入中...
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4" />
                            查看本月推薦詳情
                          </>
                        )}
                      </Button>
                    )}

                    {task.current === 0 && (
                      <Alert>
                        <Zap className="h-4 w-4" />
                        <AlertDescription>
                        完成第一次推薦後，任務將自動啟動！
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 任務說明 */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            任務說明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-medium text-lg flex items-center gap-2">
                ⚡ 推薦王
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 shrink-0">•</span>
                  <span>單月每成功推薦 10 位用戶即可獲得 1000P （可累贈）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 shrink-0">•</span>
                  <span>只計算第 1 代（直接推薦）</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-lg flex items-center gap-2">
                💎 連續推薦達人
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 shrink-0">•</span>
                  <span>連續 12 個月，每月至少成功推薦 1 位用戶</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 shrink-0">•</span>
                  <span>完成任務獲得 1000P，之後重新計算</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 shrink-0">•</span>
                  <span>若任何一個月沒有成功推薦，將重新計算</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 shrink-0">•</span>
                  <span>只計算第 1 代推薦（直接推薦）</span>
                </li>
              </ul>
            </div>
          </div>
          
          <Alert className="border-blue-200 bg-blue-50">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>領取說明：</strong>
              任務完成後，獎勵將出現在「待領取獎勵」區域。
              請完成 3 步驟驗證流程後，獎勵將立即加入您的可提領點數。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* ===== Dialogs ===== */}
      {showMonthlyCalendar && (
        <MonthlyCalendarView
          monthlyProgress={monthlyProgress}
          onClose={() => {
            setShowMonthlyCalendar(false);
            setMonthlyProgress([]);
          }}
        />
      )}

      {showKingProgress && currentMonthData && (
        <MonthlyKingProgress
          month={currentMonthData.month}
          total={currentMonthData.total}
          completedCount={currentMonthData.completedCount}
          currentProgress={currentMonthData.currentProgress}
          referrals={currentMonthData.referrals}
          onClose={() => {
            setShowKingProgress(false);
            setCurrentMonthData(null);
          }}
        />
      )}

      {showClaimDialog && selectedReward && (
        <ClaimRewardDialog
          reward={selectedReward}
          isOpen={showClaimDialog}
          onClose={() => {
            setShowClaimDialog(false);
            setSelectedReward(null);
          }}
          onConfirm={handleClaimReward}
        />
      )}
    </div>
  );
}