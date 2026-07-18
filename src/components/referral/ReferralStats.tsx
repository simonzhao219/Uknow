import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { StatCardGrid } from '../ui/stat-card-grid';
import { Users, UserPlus } from 'lucide-react';

interface ReferralStatsProps {
  firstLevelCount: number;
  secondLevelCount: number;
  thirdLevelCount: number;
}

export function ReferralStats({ firstLevelCount, secondLevelCount, thirdLevelCount }: ReferralStatsProps) {
  const totalReferrals = firstLevelCount + secondLevelCount + thirdLevelCount;

  // 用共用的 StatCardGrid：4 張卡在手機以 2×2 全部可見（不再水平捲動），
  // 桌面一列四欄，等寬填滿、左右對稱。
  return (
    <StatCardGrid>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600 shrink-0" />
            <span>總推薦數</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">{totalReferrals}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            所有推薦
          </p>*/}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-green-600 shrink-0" />
            <span>一代</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600">{firstLevelCount}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            直接推薦
          </p>*/}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-purple-600 shrink-0" />
            <span>二代</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-purple-600">{secondLevelCount}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            一代推薦
          </p>*/}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-orange-600 shrink-0" />
            <span>三代</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-orange-600">{thirdLevelCount}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            二代推薦
          </p>*/}
        </CardContent>
      </Card>
    </StatCardGrid>
  );
}