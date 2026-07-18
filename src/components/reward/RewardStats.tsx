import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { StatCardGrid } from '../ui/stat-card-grid';
import { Award, Wallet, TrendingUp, Clock } from 'lucide-react';

interface RewardStatsProps {
  totalRewards: number;
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
}

export function RewardStats({
  totalRewards,
  availableRewards,
  pendingRewards,
  withdrawnRewards
}: RewardStatsProps) {
  // 用共用的 StatCardGrid：欄數綁定卡片數、等寬填滿、左右對稱。
  // 目前只顯示 2 張卡（處理中／已提領已停用）。
  return (
    <StatCardGrid>
      <Card>
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <Award className="h-4 w-4 md:h-5 md:w-5 text-orange-600 shrink-0" />
            <span className="truncate">總累積</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-orange-600">{totalRewards}P</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <Wallet className="h-4 w-4 md:h-5 md:w-5 text-green-600 shrink-0" />
            <span className="truncate">可提領</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-green-600">{availableRewards}P</div>
        </CardContent>
      </Card>

      {/* 停用中：處理中／已提領。若日後恢復四格，改為 grid-cols-2 md:grid-cols-4 即可
      <Card>
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <Clock className="h-4 w-4 md:h-5 md:w-5 text-blue-600 shrink-0" />
            <span className="truncate">處理中</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-blue-600">{pendingRewards}P</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-purple-600 shrink-0" />
            <span className="truncate">已提領</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-purple-600">{withdrawnRewards}P</div>
        </CardContent>
      </Card> */}
    </StatCardGrid>
  );
}
