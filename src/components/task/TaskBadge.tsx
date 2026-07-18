import React from 'react';

interface TaskBadgeProps {
  type: 'monthly_king';
  progress: number;      // 本月已推薦人數
  target: number;        // 推薦王當月門檻（reward_config，預設 8）
  className?: string;
}

/**
 * 任務成就徽章組件——推薦王，依「本月推薦人數 progress」相對「當月門檻
 * target」分級（門檻由 reward_config 決定，故不寫死數字）：
 * 🔰 見習推薦 - 尚未推薦
 * ⭐ 推薦新星 - 至少 1 人
 * ⭐⭐ 推薦達人 - 達門檻一半
 * ⭐⭐⭐ 推薦王 - 達當月門檻（即已可領取免費續約 1 年）
 */
export function TaskBadge({ progress, target, className = '' }: TaskBadgeProps) {
  const halfway = Math.max(1, Math.ceil(target / 2));
  const getBadgeInfo = () => {
    if (progress >= target) {
      return {
        icon: '⭐⭐⭐',
        name: '推薦王',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-300'
      };
    }
    if (progress >= halfway) {
      return {
        icon: '⭐⭐',
        name: '推薦達人',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-300'
      };
    }
    if (progress >= 1) {
      return {
        icon: '⭐',
        name: '推薦新星',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-300'
      };
    }
    return {
      icon: '🔰',
      name: '見習推薦',
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-300'
    };
  };

  const badge = getBadgeInfo();

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 ${badge.bgColor} ${badge.borderColor} ${className}`}>
      <span className="text-lg">{badge.icon}</span>
      <span className={`text-sm font-medium ${badge.color}`}>
        {badge.name}
      </span>
    </div>
  );
}
