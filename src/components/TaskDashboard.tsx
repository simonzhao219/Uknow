import React, { useContext, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { UserContext } from '../App';
import { Calendar, Trophy, Target, Gift, Clock, CheckCircle, AlertTriangle, ArrowLeft, Loader2, Eye, X } from 'lucide-react';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useNavigate } from 'react-router-dom';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { formatReferee, formatReferrer, formatTimestamp } from '../utils/referralFormatter';
import { MonthlyProgressGrid } from './task/MonthlyProgressGrid';
import { CurrentMonthList } from './task/CurrentMonthList';

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
 * 月度推薦記錄
 */
interface MonthlyReferralRecord {
  listingId: string;
  userId: string;
  userName: string;
  listingName: string;
  city?: string;
  serviceType?: string;
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  createdAt: string;
}

/**
 * 月度進度（連續推薦達人用）
 */
interface MonthlyProgress {
  month: string;
  hasReferral: boolean;
  firstReferral: {
    listingId: string;
    userName: string;
    listingName: string;
    createdAt: string;
  } | null;
}

/**
 * 本月前N筆（推薦王用）
 */
interface CurrentMonthReferrals {
  month: string;
  total: number;
  referrals: MonthlyReferralRecord[];
}

export function TaskDashboard() {
  const { user } = useContext(UserContext);
  const { showSuccess, showToast } = useNotification();
  const handleBack = useBackNavigation();
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // ===== 任務詳情狀態 =====
  const [expandedTask, setExpandedTask] = useState<'consecutive' | 'monthly_king' | null>(null);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgress[]>([]);
  const [currentMonthReferrals, setCurrentMonthReferrals] = useState<CurrentMonthReferrals | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  // 獲取任務資料
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // ✅ 使用統一的 API 請求工具
        const result = await apiRequestJson<{ success: boolean; data: { tasks: Task[] } }>(
          buildApiUrl('/tasks')
        );
        
        if (result.success) {
          setTasks(result.data.tasks || []);
        } else {
          throw new Error('獲取任務資料失敗');
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

    fetchTasks();
  }, []);

  // ===== 新增：獲取月度摘要（連續推薦達人）=====
  const fetchMonthlySummary = async () => {
    try {
      setLoadingMonthly(true);
      
      const result = await apiRequestJson<{
        success: boolean;
        data: MonthlyProgress[];
      }>(buildApiUrl('/tasks/monthly-summary'));
      
      if (result.success) {
        setMonthlyProgress(result.data);
        setExpandedTask('consecutive');
      } else {
        throw new Error('獲取月度摘要失���');
      }
    } catch (err) {
      console.error('獲取月度摘要錯誤:', err);
      
      if (err instanceof ApiError && err.status === 401) {
        showToast('登入已過期，請重新登入', 'error');
      } else {
        showToast(err instanceof Error ? err.message : '獲取月度摘要失敗', 'error');
      }
    } finally {
      setLoadingMonthly(false);
    }
  };

  // ===== 新增：獲取本月前10筆（推薦王）=====
  const fetchCurrentMonthTop = async () => {
    try {
      setLoadingCurrent(true);
      
      const result = await apiRequestJson<{
        success: boolean;
        data: CurrentMonthReferrals;
      }>(buildApiUrl('/tasks/current-month-top?limit=10'));
      
      if (result.success) {
        setCurrentMonthReferrals(result.data);
        setExpandedTask('monthly_king');
      } else {
        throw new Error('獲取本月推薦失敗');
      }
    } catch (err) {
      console.error('獲取本月推薦錯誤:', err);
      
      if (err instanceof ApiError && err.status === 401) {
        showToast('登入已過期，請重新登入', 'error');
      } else {
        showToast(err instanceof Error ? err.message : '獲取本月推薦失敗', 'error');
      }
    } finally {
      setLoadingCurrent(false);
    }
  };

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'text-green-600';
    if (progress >= 70) return 'text-yellow-600';
    return 'text-blue-600';
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
            <p className="text-muted-foreground">完成推薦任務，獲得額外Point獎勵</p>
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
            <p className="text-muted-foreground">完成推薦任務，獲得額外Point獎勵</p>
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
            <p className="text-muted-foreground">完成推薦任務，獲得額外Point獎勵</p>
          </div>
        </div>
      </div>

      {/* 任務概覽 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tasks.map((task) => (
          <Card key={task.id} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-lg">{task.title}</CardTitle>
                </div>
                {task.completed && (
                  <Badge variant="default">已完成</Badge>
                )}
              </div>
              <CardDescription>{task.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* 進度條 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">進度</span>
                  <span className={`text-sm font-medium ${getProgressColor(task.progress)}`}>
                    {task.current} / {task.target}
                  </span>
                </div>
                <Progress 
                  value={task.progress} 
                  className="h-2"
                />
              </div>

              {/* 獎勵資訊 */}
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium">任務獎勵</span>
                </div>
                <span className="text-sm font-bold text-yellow-600">{task.reward} P</span>
              </div>

              {/* 連續推薦達人詳情 */}
              {task.type === 'consecutive_referral' && task.details && (
                <div className="space-y-3">
                  {task.details.startMonth && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        開始月份：{formatMonth(task.details.startMonth)}
                        {task.details.lastActiveMonth && ` · 最後活躍：${formatMonth(task.details.lastActiveMonth)}`}
                      </span>
                    </div>
                  )}
                  
                  {/* ===== 新增：查看月度進度按鈕 ===== */}
                  {task.current > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        查看12個月推薦進度
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchMonthlySummary()}
                        disabled={loadingMonthly}
                      >
                        {loadingMonthly ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            載入中
                          </>
                        ) : (
                          <>
                            <Calendar className="h-4 w-4 mr-1" />
                            查看月度進度
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {task.current === 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        完成第一次推薦後，任務將自動啟動。連續12個月每月至少推薦1位用戶即可完成任務。
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {task.current > 0 && task.current < task.target && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        還需連續 {task.target - task.current} 個月完成推薦才能獲得獎勵。
                        若任何一個月沒有成功推薦，將重新計算。
                      </AlertDescription>
                    </Alert>
                  )}

                  {task.current >= task.target && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-600">
                        恭喜！您已達成任務目標，系統將在每月1日自動結算並發放獎勵。
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* ===== 新增：月度進度展開區域（使用新組件）===== */}
                  {expandedTask === 'consecutive' && monthlyProgress.length > 0 && (
                    <MonthlyProgressGrid
                      monthlyProgress={monthlyProgress}
                      onClose={() => {
                        setExpandedTask(null);
                        setMonthlyProgress([]);
                      }}
                    />
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
                        本月({formatMonth(task.details.currentMonth)})已推薦 {task.current} 個用戶
                      </span>
                    </div>
                  )}
                  
                  {/* ===== 新增：查看本月推薦按鈕 ===== */}
                  {task.details.currentMonth && task.current > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        查看本月推薦的用戶詳情
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchCurrentMonthTop()}
                        disabled={loadingCurrent}
                      >
                        {loadingCurrent ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            載入中
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-1" />
                            查看詳情
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {task.details.completedMonths > 0 && (
                    <div className="text-sm text-green-600">
                      累計完成 {task.details.completedMonths} 次推薦王任務
                    </div>
                  )}

                  {task.current === 0 && (
                    <Alert>
                      <Clock className="h-4 w-4" />
                      <AlertDescription>
                        完成第一次推薦後，任務將自動啟動。單月推薦10位用戶即可完成任務。
                      </AlertDescription>
                    </Alert>
                  )}

                  {task.current > 0 && task.current < task.target && (
                    <Alert>
                      <Clock className="h-4 w-4" />
                      <AlertDescription>
                        本月還需推薦 {task.target - task.current} 個用戶即可完成任務。
                        每月會重新計算進度。
                      </AlertDescription>
                    </Alert>
                  )}

                  {task.current >= task.target && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-600">
                        恭喜！您已達成本月目標，系統將在每月1日自動結算並發放獎勵。
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* ===== 新增：本月推薦列表展開區域（使用新組件）===== */}
                  {expandedTask === 'monthly_king' && currentMonthReferrals && (
                    <CurrentMonthList
                      data={currentMonthReferrals}
                      onClose={() => {
                        setExpandedTask(null);
                        setCurrentMonthReferrals(null);
                      }}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 任務說明 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            任���說明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-medium">連續推薦達人</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 連續12個月，每月至少成功推薦1位用戶</li>
                <li>• 若任何一個月沒有成功推薦，將重新計算</li>
                <li>• 完成任務獲得1000P，之後重新計算</li>
                <li> 推薦成功指推薦的用戶完成服務者刊登並付費</li>
                <li>• 只計算第1代推薦（直接推薦）</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium">推薦王</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 單月成功推薦10位用戶</li>
                <li>• 每月重新計算，可重複完成</li>
                <li>• 完成任務獲得1000P</li>
                <li>• 只計算第1代推薦（直接推薦）</li>
                <li>• 系統每月1日自動結算並發放獎勵</li>
              </ul>
            </div>
          </div>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              完成任務後，系統將在每月1日自動結算並發放獎勵到您的帳戶。
              獎勵會自動加入可提領點數，請到獎勵回饋頁面查看。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}