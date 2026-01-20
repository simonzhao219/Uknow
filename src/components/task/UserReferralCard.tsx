import React from 'react';
import { User, Ticket, Calendar } from 'lucide-react';
import { formatTimestamp } from '../../utils/referralFormatter';

interface UserReferralCardProps {
  userName: string;
  userReferralCode: string;
  createdAt: string;
  className?: string;
  isCompleted?: boolean;           // ⭐ 新增：是否為完成任務的卡片
  completionBorderColor?: string;  // ⭐ 新增：完成時的邊框顏色（Tailwind class）
}

/**
 * 用戶推薦卡片組件
 * 
 * 用於顯示被推薦人的基本資訊：
 * - 使用者名稱
 * - 推薦碼
 * - 註冊時間
 * 
 * ⭐ 支援高亮顯示：當 isCompleted=true 時，顯示彩色粗邊框
 * 
 * 範例：
 * ┌─────────────────┐
 * │ 👤 張小明       │  ← 被推薦人名稱
 * │ 🎟️ abc123456    │  ← 被推薦人的推薦碼
 * └─────────────────┘
 * 
 * 不顯示刊登資訊（listingName, city, serviceType）
 */
export function UserReferralCard({
  userName,
  userReferralCode,
  createdAt,
  className = '',
  isCompleted = false,
  completionBorderColor = 'border-yellow-500'
}: UserReferralCardProps) {
  return (
    <div className={`p-3 rounded-lg bg-white hover:shadow-md transition-shadow ${
      isCompleted 
        ? `border-2 ${completionBorderColor}` 
        : 'border'
    } ${className}`}>
      {/* 使用者名稱 */}
      <div className="flex items-center gap-2 mb-2">
        <User className="h-4 w-4 text-blue-600 shrink-0" />
        <p className="font-medium truncate">{userName}</p>
      </div>
      
      {/* 推薦碼 */}
      {/* <div className="flex items-center gap-2 mb-2">
        <Ticket className="h-4 w-4 text-purple-600 shrink-0" />
        <p className="text-sm font-mono text-muted-foreground truncate">
          {userReferralCode}
        </p>
      </div> */}
      
      {/* 時間戳 */}
      <div className="flex items-center gap-2">
        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          {formatTimestamp(createdAt)}
        </p>
      </div>
    </div>
  );
}