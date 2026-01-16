import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Users, User, Ticket, Copy, ChevronDown, ChevronRight, Eye } from 'lucide-react@0.487.0';

/**
 * ✅ 推薦成員接口（包含推薦碼信息）
 */
interface ReferralMember {
  userId: string;
  userName: string;
  userReferralCode: string | null;  // ✅ 被推薦者的推薦碼
  listingId: string | null;        // 可能還沒創建刊登
  listingName: string | null;      // 可能還沒創建刊登
  serviceType: string | null;
  city: string | null;
  activeUntil: string | null;
  isActive: boolean;
  referrer?: {                     // 二代、三代的推薦人信息
    userId: string;
    userName: string;
    userReferralCode: string | null;  // ✅ 推薦人的推薦碼
    listingId: string | null;
    listingName: string | null;
  } | null;
  createdAt: string;
}

/**
 * ✅ 推薦樹接口（以用戶為根，移除 myListing）
 */
interface ReferralTree {
  firstGeneration: ReferralMember[];
  secondGeneration: ReferralMember[];
  thirdGeneration: ReferralMember[];
}

interface ReferralTreeViewProps {
  referralTree: ReferralTree;
}

export function ReferralTreeView({ referralTree }: ReferralTreeViewProps) {
  const navigate = useNavigate();
  const [expandedGenerations, setExpandedGenerations] = useState<{[key: number]: boolean}>({
    1: true,   // 一代默认展开
    2: false,  // 二代默认收起
    3: false   // 三代默认收起
  });
  
  const { firstGeneration, secondGeneration, thirdGeneration } = referralTree;
  
  // 計算各代的有效數量（非已失效）
  const firstGenActiveCount = firstGeneration.filter(r => r.isActive).length;
  const secondGenActiveCount = secondGeneration.filter(r => r.isActive).length;
  const thirdGenActiveCount = thirdGeneration.filter(r => r.isActive).length;
  
  const totalCount = firstGeneration.length + secondGeneration.length + thirdGeneration.length;
  const activeCount = firstGenActiveCount + secondGenActiveCount + thirdGenActiveCount;
  
  // 切换指定代的展开状态
  const toggleGeneration = (gen: number) => {
    setExpandedGenerations(prev => ({
      ...prev,
      [gen]: !prev[gen]
    }));
  };
  
  const renderReferralCard = (member: ReferralMember, level: 1 | 2 | 3) => {
    const levelColors = {
      1: 'border-l-green-600 bg-green-50',
      2: 'border-l-purple-600 bg-purple-50',
      3: 'border-l-orange-600 bg-orange-50'
    };
    
    return (
      <div 
        key={member.userId}
        className={`p-3 border-l-4 border rounded-lg transition-all duration-200 ${levelColors[level]} ${!member.isActive ? 'opacity-50' : ''}`}
      >
        <div className="space-y-1">
          {/* 第 1 行：被推薦者的使用者名字 */}
          <div className="flex items-center gap-2">
            <User className={`h-4 w-4 shrink-0 ${!member.isActive ? 'text-gray-400' : 'text-blue-600'}`} />
            <p className={`font-medium truncate ${!member.isActive ? 'text-gray-400' : ''}`}>
              {member.userName}
            </p>
          </div>
          
          {/* 第 2 行：被推薦者的推薦碼 */}
          <div className="flex items-center gap-2">
            <Ticket className={`h-4 w-4 shrink-0 ${!member.isActive ? 'text-gray-400' : 'text-purple-600'}`} />
            <p className={`text-sm font-mono truncate ${!member.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
              {member.userReferralCode || '暫無推薦碼'}
            </p>
          </div>
          
          {/* 第 3 行：推薦人資訊（僅二代和三代顯示）*/}
          {level > 1 && member.referrer && (
            <div className="flex items-center gap-2">
              <Users className={`h-4 w-4 shrink-0 ${!member.isActive ? 'text-gray-400' : 'text-green-600'}`} />
              <p className={`text-sm truncate ${!member.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
                {member.referrer.userName} - {member.referrer.userReferralCode || '暫無推薦碼'}
              </p>
            </div>
          )}
        </div>
        
        {/* 已失效標籤 */}
        {!member.isActive && (
          <div className="mt-2 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded inline-block">
            已失效
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-4">
      {/* 无数据状态 */}
      {totalCount === 0 ? (
        <div className="text-center py-8 border rounded-lg">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">尚未有推薦人</p>
          <p className="text-sm text-muted-foreground mt-2">
            分享您的推薦碼給好友吧！
          </p>
        </div>
      ) : (
        <>
          {/* ========== 一代推薦 ========== */}
          <div className="border rounded-lg">
            <div 
              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-between"
              onClick={() => toggleGeneration(1)}
            >
              <div className="flex items-center gap-3">
                {expandedGenerations[1] ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600 text-white">一代</Badge>
                  <span className="font-medium">{firstGeneration.length} 人</span>
                  {firstGenActiveCount < firstGeneration.length && (
                    <span className="text-sm text-muted-foreground">
                      ({firstGenActiveCount} 個有效)
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {expandedGenerations[1] && (
              <div className="border-t bg-muted/20 p-4">
                {firstGeneration.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    尚未有一代推薦
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] md:max-h-[560px] overflow-y-auto pr-2">
                    {firstGeneration.map(member => renderReferralCard(member, 1))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========== 二代推薦 ========== */}
          <div className="border rounded-lg">
            <div 
              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-between"
              onClick={() => toggleGeneration(2)}
            >
              <div className="flex items-center gap-3">
                {expandedGenerations[2] ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-600 text-white">二代</Badge>
                  <span className="font-medium">{secondGeneration.length} 人</span>
                  {secondGenActiveCount < secondGeneration.length && (
                    <span className="text-sm text-muted-foreground">
                      ({secondGenActiveCount} 個有效)
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {expandedGenerations[2] && (
              <div className="border-t bg-muted/20 p-4">
                {secondGeneration.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    尚未有二代推薦
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] md:max-h-[560px] overflow-y-auto pr-2">
                    {secondGeneration.map(member => renderReferralCard(member, 2))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========== 三代推薦 ========== */}
          <div className="border rounded-lg">
            <div 
              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-between"
              onClick={() => toggleGeneration(3)}
            >
              <div className="flex items-center gap-3">
                {expandedGenerations[3] ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-600 text-white">三代</Badge>
                  <span className="font-medium">{thirdGeneration.length} 人</span>
                  {thirdGenActiveCount < thirdGeneration.length && (
                    <span className="text-sm text-muted-foreground">
                      ({thirdGenActiveCount} 個有效)
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {expandedGenerations[3] && (
              <div className="border-t bg-muted/20 p-4">
                {thirdGeneration.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    尚未有三代推薦
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] md:max-h-[560px] overflow-y-auto pr-2">
                    {thirdGeneration.map(member => renderReferralCard(member, 3))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}