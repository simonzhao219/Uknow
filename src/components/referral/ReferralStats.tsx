import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Users, UserPlus, TrendingUp, Gift } from 'lucide-react';

interface ReferralStatsProps {
  firstLevelCount: number;
  secondLevelCount: number;
  thirdLevelCount: number;
}

export function ReferralStats({ firstLevelCount, secondLevelCount, thirdLevelCount }: ReferralStatsProps) {
  const totalReferrals = firstLevelCount + secondLevelCount + thirdLevelCount;
  const totalRewards = totalReferrals * 10;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            總推薦人數
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">{totalReferrals}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-green-600" />
            一等親
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600">{firstLevelCount}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-purple-600" />
            二等親
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-purple-600">{secondLevelCount}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-orange-600" />
            三等親
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-orange-600">{thirdLevelCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}