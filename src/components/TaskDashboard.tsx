import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Target, Gift, ArrowLeft, Loader2, Eye, Zap, Trophy } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useTaskData } from '../hooks/useTaskData';
import { PendingRewardsSection } from './task/PendingRewardsSection';
import { TaskGuide } from './task/TaskGuide';
import { MonthlyKingProgress } from './task/MonthlyKingProgress';
import { TaskBadge } from './task/TaskBadge';
import { getMotivationText, getProgressColor, getProgressBarStyle } from '../utils/userReferralFormatter';

function formatMonth(monthStr: string) {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  return `${year}年${month}月`;
}

export function TaskDashboard() {
  const handleBack = useBackNavigation();

  const {
    tasks,
    pendingRewards,
    currentMonthData,
    isLoading,
    loadingCurrent,
    error,
    fetchCurrentMonthTop,
    handleClaimReward,
  } = useTaskData();

  const [showKingProgress, setShowKingProgress] = useState(false);

  const handleViewCurrentMonthTop = async () => {
    const data = await fetchCurrentMonthTop();
    if (data) setShowKingProgress(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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

  if (error) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">任務中心</h1>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>重新載入</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">任務中心</h1>
            <p className="text-muted-foreground">完成推薦任務，解鎖專屬獎勵！</p>
          </div>
        </div>
      </div>

      <PendingRewardsSection pendingRewards={pendingRewards} onClaimReward={handleClaimReward} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          {tasks.map((task) => {
            const motivationText = getMotivationText(task.progress);
            const progressColor = getProgressColor(task.progress);

            return (
              <Card key={task.id} className="relative overflow-hidden border-2 hover:shadow-lg transition-shadow">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-10 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-full -mr-16 -mt-16" />

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
                  <div className="mt-3">
                    <TaskBadge type="monthly_king" progress={task.current} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 relative">
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
                      />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">{motivationText}</p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-yellow-600" />
                      <span className="text-sm font-medium">任務獎勵</span>
                    </div>
                    <span className="text-lg font-bold text-yellow-600">{task.reward.label}</span>
                  </div>

                  {task.details && (
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
                          累計完成 {task.details.completedMonths} 次推薦王任務
                        </div>
                      )}
                      {task.current > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleViewCurrentMonthTop}
                          loading={loadingCurrent}
                          className="w-full gap-2"
                        >
                          {loadingCurrent ? (
                            '載入中...'
                          ) : (
                            <>
                              <Eye className="h-4 w-4" />
                              查看本月推薦詳情
                            </>
                          )}
                        </Button>
                      ) : (
                        <Alert>
                          <Zap className="h-4 w-4" />
                          <AlertDescription>完成第一次推薦後，任務將自動啟動！</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          <TaskGuide />
        </div>
      </div>

      {showKingProgress && currentMonthData && (
        <MonthlyKingProgress
          month={currentMonthData.month}
          total={currentMonthData.total}
          completedCount={currentMonthData.completedCount}
          currentProgress={currentMonthData.currentProgress}
          referrals={currentMonthData.referrals}
          onClose={() => setShowKingProgress(false)}
        />
      )}
    </div>
  );
}
