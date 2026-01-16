import React from 'react';

interface TaskBadgeProps {
  type: 'consecutive_referral' | 'monthly_king';
  progress: number;
  className?: string;
}

/**
 * 任務成就徽章組件
 * 
 * 連續推薦達人徽章：
 * 🥉 銅牌達人 - 連續3個月
 * 🥈 銀牌達人 - 連續6個月
 * 🥇 金牌達人 - 連續9個月
 * 💎 鑽石達人 - 連續12個月（完成任務）
 * 
 * 推薦王徽章：
 * ⭐ 推薦新星 - 完成1次
 * ⭐⭐ 推薦達人 - 完成5次
 * ⭐⭐⭐ 推薦王 - 完成10次
 */
export function TaskBadge({ type, progress, className = '' }: TaskBadgeProps) {
  const getBadgeInfo = () => {
    if (type === 'consecutive_referral') {
      if (progress >= 12) {
        return {
          icon: '💎',
          name: '鑽石達人',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-300'
        };
      }
      if (progress >= 9) {
        return {
          icon: '🥇',
          name: '金牌達人',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-300'
        };
      }
      if (progress >= 6) {
        return {
          icon: '🥈',
          name: '銀牌達人',
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-300'
        };
      }
      if (progress >= 3) {
        return {
          icon: '🥉',
          name: '銅牌達人',
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-300'
        };
      }
      return {
        icon: '🌱',
        name: '新手上路',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-300'
      };
    } else {
      // 推薦王
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
    }
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
