import React from 'react';
import { X, CheckCircle, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { UserReferralCard } from './UserReferralCard';
import { ProgressBar } from './ProgressBar'; // ✅ 導入統一進度條組件

interface MonthlyKingProgressProps {
  month: string;
  total: number;
  completedCount: number; // 本月已完成次數
  currentProgress: number; // 當前進度 (0-9)
  referrals: Array<{
    userName: string;
    userReferralCode: string;
    createdAt: string;
  }>;
  onClose: () => void;
}

/**
 * 推薦王溢出進度組件
 * 
 * 顯示：
 * - 本月已完成次數（每10人為1次）
 * - 當前進度（剩餘計數）
 * - 所有推薦人列表
 */
export function MonthlyKingProgress({
  month,
  total,
  completedCount,
  currentProgress,
  referrals,
  onClose
}: MonthlyKingProgressProps) {
  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };

  const progressPercentage = (currentProgress / 10) * 100;
  const overallPercentage = (total / 10) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                ⚡ 推薦王任務詳情
              </CardTitle>
              <CardDescription>
                {formatMonth(month)} - 本月推薦進度
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ✅ 統一進度條 - 顯示當前輪次進度 */}
          <ProgressBar
            current={currentProgress}
            target={10}
            title="當前輪次進度"
            showStats={false}
            extraInfo={
              currentProgress < 10 ? (
                <p className="text-blue-700">
                  💡 再推薦 {10 - currentProgress} 人可再獲得 1000P！
                </p>
              ) : (
                <p className="text-green-700">
                  ✅ 已達成本輪目標！完成 10 人推薦
                </p>
              )
            }
          />

          {/* 本月成就 */}
          {completedCount > 0 && (
            <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h3 className="font-medium text-green-900">✨ 本月成就</h3>
              </div>
              
              <div className="space-y-2">
                {Array.from({ length: completedCount }).map((_, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-600" />
                    <span className="text-green-700">
                      第 {index + 1} 次完成 (+1000P)
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {index === 0 ? `第 10 人達成` : `第 ${(index + 1) * 10} 人達成`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 推薦列表 */}
          <div>
            <h3 className="font-medium mb-3 flex items-center gap-2">
              📋 本月推薦列表
              <span className="text-sm text-muted-foreground">({referrals.length} 人)</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2">
              {referrals.map((referral, index) => (
                <div key={index} className="relative">
                  {/* 完成標記（每10人一個標記）*/}
                  {(index + 1) % 10 === 0 && (
                    <div className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full z-10 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      第{(index + 1) / 10}次完成
                    </div>
                  )}
                  
                  <UserReferralCard
                    userName={referral.userName}
                    userReferralCode={referral.userReferralCode}
                    createdAt={referral.createdAt}
                    isCompleted={(index + 1) % 10 === 0}
                    completionBorderColor="border-yellow-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 溢出說明 */}
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <p className="text-yellow-900">
              💡 <strong>溢出機制說明：</strong>
              每推薦滿 10 人即可獲得 1000P，計數器自動扣除 10 人。
              剩餘人數累計至下一輪，下月 1 日歸零重新計算。
            </p>
          </div>

          <div className="flex justify-center pt-4">
            <Button onClick={onClose}>關閉</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}