import React, { useContext, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { UserContext } from '../App';
import { Calendar, Trophy, Target, Gift, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { useNotification } from './notifications/NotificationContext';

interface Task {
  id: string;
  type: 'consecutive_referral' | 'monthly_yearly_referral';
  title: string;
  description: string;
  reward: number;
  currentProgress: number;
  maxProgress: number;
  isCompleted: boolean;
  isPending: boolean;
  isAccepted: boolean;
  completedDate?: string;
  details: any;
}

interface PendingReward {
  id: string;
  taskId: string;
  taskTitle: string;
  amount: number;
  completedDate: string;
  status: 'pending' | 'approved' | 'accepted';
}

export function TaskDashboard() {
  const { user } = useContext(UserContext);
  const { showSuccess } = useNotification();
  
  // 模擬任務資料
  const getTasks = (): Task[] => {
    return [
      {
        id: 'task_1',
        type: 'consecutive_referral',
        title: '連續推薦達人',
        description: '連續12個月每月至少成功推薦1個人',
        reward: 1000,
        currentProgress: 8, // 目前連續8個月
        maxProgress: 12,
        isCompleted: false,
        isPending: false,
        isAccepted: false,
        details: {
          consecutiveMonths: 8,
          currentMonth: '2024-08',
          lastReferralDate: '2024-08-15',
          monthlyReferrals: [
            { month: '2024-01', count: 2 },
            { month: '2024-02', count: 1 },
            { month: '2024-03', count: 3 },
            { month: '2024-04', count: 1 },
            { month: '2024-05', count: 2 },
            { month: '2024-06', count: 1 },
            { month: '2024-07', count: 4 },
            { month: '2024-08', count: 1 },
          ]
        }
      },
      {
        id: 'task_2',
        type: 'monthly_yearly_referral',
        title: '年繳推薦王',
        description: '單月成功推薦10個年繳方案',
        reward: 1000,
        currentProgress: 7, // 目前本月7個年繳推薦
        maxProgress: 10,
        isCompleted: false,
        isPending: false,
        isAccepted: false,
        details: {
          currentMonth: '2024-08',
          yearlyReferrals: 7,
          referralUsers: [
            { name: '王小明', date: '2024-08-02' },
            { name: '李美華', date: '2024-08-05' },
            { name: '張志偉', date: '2024-08-10' },
            { name: '陳雅婷', date: '2024-08-12' },
            { name: '林俊傑', date: '2024-08-15' },
            { name: '黃淑芬', date: '2024-08-18' },
            { name: '吳建宏', date: '2024-08-22' }
          ]
        }
      }
    ];
  };

  // 模擬待領取獎勵
  const getPendingRewards = (): PendingReward[] => {
    return [
      {
        id: 'reward_1',
        taskId: 'task_1',
        taskTitle: '連續推薦達人',
        amount: 1000,
        completedDate: '2024-07-01',
        status: 'approved'
      }
    ];
  };

  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>(getPendingRewards());

  const handleAcceptReward = (rewardId: string) => {
    const reward = pendingRewards.find(r => r.id === rewardId);
    setPendingRewards(rewards => 
      rewards.map(r => 
        r.id === rewardId 
          ? { ...r, status: 'accepted' }
          : r
      )
    );
    showSuccess(
      '已成功領取任務獎勵！',
      `${reward?.amount} P 已加入您的帳戶`,
      [
        `任務：${reward?.taskTitle}`,
        `獎勵金額：${reward?.amount} P`,
        '請到 Point 管理查看您的 Point 餘額'
      ]
    );
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };

  const getProgressColor = (progress: number, max: number) => {
    const percentage = (progress / max) * 100;
    if (percentage >= 100) return 'text-green-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-blue-600';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">任務中心</h1>
          <p className="text-muted-foreground">完成推薦任務，獲得額外Point獎勵</p>
        </div>
      </div>

      {/* 待領取獎勵 */}
      {pendingRewards.filter(r => r.status === 'approved').length > 0 && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span>您有 {pendingRewards.filter(r => r.status === 'approved').length} 個任務獎勵待領取！</span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {pendingRewards.filter(r => r.status === 'approved').map(reward => (
                  <AlertDialog key={reward.id}>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="default">
                        領取 {reward.amount} P
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>確認領取任務獎勵</AlertDialogTitle>
                        <AlertDialogDescription>
                          任務：{reward.taskTitle}
                          <br />
                          獎勵金額：{reward.amount} P
                          <br />
                          完成日期：{new Date(reward.completedDate).toLocaleDateString('zh-TW')}
                          <br /><br />
                          確認要領取這個獎勵嗎？領取後Point將立即加入您的帳戶。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleAcceptReward(reward.id)}>
                          確認領取
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ))}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
                {(task.isCompleted || task.isPending) && (
                  <Badge variant={task.isCompleted ? 'default' : 'secondary'}>
                    {task.isCompleted ? '已完成' : '待審核'}
                  </Badge>
                )}
              </div>
              <CardDescription>{task.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* 進度條 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">進度</span>
                  <span className="text-sm font-medium">
                    {task.currentProgress} / {task.maxProgress}
                  </span>
                </div>
                <Progress 
                  value={(task.currentProgress / task.maxProgress) * 100} 
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

              {/* 任務詳情 */}
              {task.type === 'consecutive_referral' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>目前連續 {task.details.consecutiveMonths} 個月成功推薦</span>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    {(() => {
                      // 生成12個連續月份的數據
                      const generateMonths = () => {
                        const months = [];
                        // 找出最早的月份作為起始點
                        const firstMonth = task.details.monthlyReferrals[0]?.month || task.details.currentMonth;
                        const [startYear, startMonth] = firstMonth.split('-').map(Number);
                        
                        for (let i = 0; i < 12; i++) {
                          const monthDate = new Date(startYear, startMonth - 1 + i);
                          const yearStr = monthDate.getFullYear();
                          const monthStr = String(monthDate.getMonth() + 1).padStart(2, '0');
                          const monthKey = `${yearStr}-${monthStr}`;
                          
                          // 檢查這個月是否有推薦記錄
                          const monthData = task.details.monthlyReferrals.find((m: any) => m.month === monthKey);
                          const hasReferral = monthData && monthData.count > 0;
                          
                          months.push({
                            month: monthKey,
                            count: monthData?.count || 0,
                            hasReferral
                          });
                        }
                        return months;
                      };
                      
                      return generateMonths().map((monthData, index) => (
                        <div 
                          key={index} 
                          className={`text-center p-2 border rounded ${monthData.hasReferral ? 'bg-green-100 border-green-300' : 'bg-white'}`}
                        >
                          <div className="text-xs text-muted-foreground">{monthData.month.replace('-', '/')}</div>
                          <div className="text-sm font-medium flex items-center justify-center gap-1">
                            {monthData.hasReferral ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {task.currentProgress < task.maxProgress && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        還需連續 {task.maxProgress - task.currentProgress} 個月完成推薦才能獲得獎勵。
                        若任何一個月沒有成功推薦，將重新計算。
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {task.type === 'monthly_yearly_referral' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span>本月({formatMonth(task.details.currentMonth)})已推薦 {task.details.yearlyReferrals} 個年繳</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm font-medium">最近推薦的人：</div>
                    <div className="grid grid-cols-1 gap-1 text-xs max-h-48 overflow-y-auto">
                      {task.details.referralUsers.slice(-10).reverse().map((user: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-green-50 rounded">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                            <span className="font-medium">{user.name}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {new Date(user.date).toLocaleDateString('zh-TW')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {task.currentProgress < task.maxProgress && (
                    <Alert>
                      <Clock className="h-4 w-4" />
                      <AlertDescription>
                        本月還需推薦 {task.maxProgress - task.currentProgress} 個年繳方案即可完成任務。
                        每月會重新計算進度。
                      </AlertDescription>
                    </Alert>
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
            任務說明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-medium">連續推薦達人</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 連續12個月，每月至少成功推薦1個人</li>
                <li>• 若任何一個月沒有成功推薦，將重新計算</li>
                <li>• 完成任務獲得1000P，之後重新計算</li>
                <li>• 推薦成功指推薦的人完成服務者刊登並付費</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium">年繳推薦王</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 單月成功推薦10個年繳方案</li>
                <li>• 每月重新計算，可重複完成</li>
                <li>• 完成任務獲得1000P</li>
                <li>• 年繳推薦指推薦的人選擇年繳訂閱方案</li>
              </ul>
            </div>
          </div>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              完成任務後，獎勵將由平台管理員審核確認。確認後您會收到通知，請記得回來領取獎勵。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}