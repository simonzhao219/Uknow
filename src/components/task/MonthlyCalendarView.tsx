import React from 'react';
import { X, CheckCircle, XCircle, Clock, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { UserReferralCard } from './UserReferralCard';
import { ProgressBar } from './ProgressBar'; // ✅ 導入統一進度條組件

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

interface MonthlyCalendarViewProps {
  monthlyProgress: MonthlyProgress[];
  onClose: () => void;
}

/**
 * 12 個月日曆視圖組件（優化版）✅
 * 
 * 從遊戲開始月份起算 12 個月，按照遊戲週期顯示
 * 3x4 網格佈局，每個月顯示 ✓/✗/⏳/🔮 狀態
 */
export function MonthlyCalendarView({ monthlyProgress, onClose }: MonthlyCalendarViewProps) {
  // ✅ 格式化月份顯示（YYYY/MM 格式）
  const formatMonthDisplay = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${year}/${month}`;
  };

  // ✅ 獲取月份狀態（使用後端返回的 status）
  const getMonthStatus = (progress: MonthlyProgress) => {
    switch (progress.status) {
      case 'completed':
        return {
          icon: <CheckCircle className="h-8 w-8 text-green-600" />,
          bgColor: 'bg-green-50',
          borderColor: 'border-green-300',
          label: '已完成'
        };
      case 'missed':
        return {
          icon: <XCircle className="h-8 w-8 text-red-600" />,
          bgColor: 'bg-red-50',
          borderColor: 'border-red-300',
          label: '斷續'
        };
      case 'pending':
        return {
          icon: <Clock className="h-8 w-8 text-blue-600 animate-pulse" />,
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-300',
          label: '進行中'
        };
      case 'future':
      default:
        return {
          icon: <Sparkles className="h-8 w-8 text-gray-400" />,
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          label: '待完成'
        };
    }
  };

  // ✅ 判斷是否為遊戲起始月份
  const isStartMonth = (progress: MonthlyProgress) => {
    return progress.gameMonth === 1;
  };

  // ✅ 檢查是否有數據
  if (monthlyProgress.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                尚未開始遊戲
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-6">
              完成第一次推薦後，「連續推薦達人」遊戲將自動開始
            </p>
            <Button onClick={onClose} className="w-full">
              我知道了
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ✅ 計算統計數據
  const completedCount = monthlyProgress.filter(m => m.hasReferral).length;
  const missedCount = monthlyProgress.filter(m => m.status === 'missed').length;
  const progressPercentage = Math.round((completedCount / 12) * 100);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🗓️ 12個月推薦詳情
              </CardTitle>
              <CardDescription>
                連續推薦達人任務進度 - 從 {formatMonthDisplay(monthlyProgress[0]?.month)} 開始計算
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ✅ 整體進度摘要 - 使用統一進度條組件 */}
          <ProgressBar
            current={completedCount}
            target={12}
            title="整體進度"
            showStats={true}
            missedCount={missedCount}
          />

          {/* ✅ 12 個月網格 */}
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {monthlyProgress.map((progress) => {
              const status = getMonthStatus(progress);
              return (
                <div
                  key={progress.month}
                  className={`p-3 border-2 rounded-lg ${status.bgColor} ${status.borderColor} ${
                    isStartMonth(progress) ? 'ring-2 ring-yellow-400 ring-offset-2' : ''
                  }`}
                >
                  {/* 月份標題 */}
                  <div className="text-center mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{formatMonthDisplay(progress.month)}</p>
                      {isStartMonth(progress) && (
                        <Badge variant="default" className="bg-yellow-500 text-white text-xs px-1 py-0">
                          起始
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">第 {progress.gameMonth} 個月</p>
                    <div className="flex justify-center my-2">
                      {status.icon}
                    </div>
                    <p className="text-xs text-muted-foreground">{status.label}</p>
                  </div>

                  {/* 第一筆推薦 */}
                  {progress.firstReferral && (
                    <div className="mt-3 pt-3 border-t hidden md:block">
                      <UserReferralCard
                        userName={progress.firstReferral.userName}
                        userReferralCode={progress.firstReferral.userReferralCode}
                        createdAt={progress.firstReferral.createdAt}
                        className="text-xs"
                      />
                    </div>
                  )}

                  {!progress.firstReferral && !progress.hasReferral && (
                    <div className="mt-3 pt-3 border-t text-center">
                      <p className="text-xs text-muted-foreground">
                        {status.label === '斷續' ? '⚠️ 未完成推薦' : '等待推薦'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ✅ 關閉按鈕 */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onClose} variant="outline">
              關閉
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}