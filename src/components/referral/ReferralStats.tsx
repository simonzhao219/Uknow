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

  // 手機：瘦身成單列四欄精簡條，把黃金版位讓給推薦樹（不再用 2×2 大卡占版面）。
  const compact = [
    { label: '總推薦', value: totalReferrals, color: 'text-blue-600' },
    { label: '一代', value: firstLevelCount, color: 'text-green-600' },
    { label: '二代', value: secondLevelCount, color: 'text-purple-600' },
    { label: '三代', value: thirdLevelCount, color: 'text-orange-600' },
  ];

  return (
    <>
      <Card className="sm:hidden">
        <CardContent className="grid grid-cols-4 divide-x divide-border px-0 py-3">
          {compact.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-0.5 px-1">
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 桌面 / 平板：維持四張卡 */}
      <div className="hidden sm:block">
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
      </div>
    </>
  );
}