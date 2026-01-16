import React from 'react';

interface ProgressBarProps {
  /**
   * 當前進度數值
   */
  current: number;
  
  /**
   * 目標數值
   */
  target: number;
  
  /**
   * 進度條標題
   */
  title?: string;
  
  /**
   * 是否顯示統計文字（已完成/斷續）
   */
  showStats?: boolean;
  
  /**
   * 斷續數量（僅當 showStats=true 時有效）
   */
  missedCount?: number;
  
  /**
   * 自定義額外統計資訊（可選）
   * 例如：「🎉 超越目標 20%！」或「💡 再推薦 3 人可再獲得 1000P！」
   */
  extraInfo?: React.ReactNode;
}

/**
 * 統一的進度條組件 ⭐
 * 
 * 用於「連續推薦達人」和「推薦王」的進度顯示
 * 採用藍紫色漸變樣式，視覺統一
 */
export function ProgressBar({
  current,
  target,
  title = '整體進度',
  showStats = false,
  missedCount = 0,
  extraInfo
}: ProgressBarProps) {
  // 計算百分比
  const percentage = Math.min(Math.round((current / target) * 100), 100);
  
  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg">
      {/* 標題和數值 */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">{title}</span>
        <span className="text-2xl font-bold text-blue-600">
          {current} / {target}
        </span>
      </div>
      
      {/* 進度條 */}
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      
      {/* 統計文字 */}
      {showStats && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-green-600">✓ 已完成: {current} 個月</span>
          {missedCount > 0 && <span className="text-red-600">✗ 斷續: {missedCount} 個月</span>}
        </div>
      )}
      
      {/* 額外資訊 */}
      {extraInfo && (
        <div className="mt-2 text-sm">
          {extraInfo}
        </div>
      )}
    </div>
  );
}
