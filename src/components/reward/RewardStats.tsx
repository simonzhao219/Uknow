import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Award, Wallet, TrendingUp, Clock } from 'lucide-react';

interface RewardStatsProps {
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
}

export function RewardStats({ availableRewards, pendingRewards, withdrawnRewards }: RewardStatsProps) {
  const totalRewards = availableRewards + pendingRewards + withdrawnRewards

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-orange-600" />
            總累積Point
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-orange-600">{totalRewards}P</div>
          <p className="text-sm text-muted-foreground">推薦累計Point</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-green-600" />
            可提領Point
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600">{availableRewards}P</div>
          <p className="text-sm text-muted-foreground">可申請提領</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-blue-600" />
            處理中Point
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">{pendingRewards}P</div>
          <p className="text-sm text-muted-foreground">申請處理中</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            已提領Point
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-purple-600">{withdrawnRewards}P</div>
          <p className="text-sm text-muted-foreground">歷史提領總額</p>
        </CardContent>
      </Card>
    </div>
  );
}