import React from 'react';

interface TaskBadgeProps {
  type: 'monthly_king';
  progress: number;
  className?: string;
}

/**
 * 任務成就徽章組件——推薦王：
 * 🔰 見習推薦 - 0 次
 * ⭐ 推薦新星 - 完成1次
 * ⭐⭐ 推薦達人 - 完成5次
 * ⭐⭐⭐ 推薦王 - 完成10次
 */
export function TaskBadge({ progress, className = '' }: TaskBadgeProps) {
  const getBadgeInfo = () => {
    if (progress >= 10) {
      return {
        icon: '⭐⭐⭐',
        name: '推薦王',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-300'
      };
    }
    if (progress >= 5) {
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
