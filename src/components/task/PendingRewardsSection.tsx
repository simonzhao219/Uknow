import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Trophy, Gift, Clock, Sparkles } from 'lucide-react';
import { ClaimRewardDialog } from './ClaimRewardDialog';
import { formatTimestamp } from '../../utils/referralFormatter';
import type { PendingMissionReward } from '../../hooks/useTaskData';

interface Props {
  pendingRewards: PendingMissionReward[];
  onClaimReward: (rewardId: string, idNumber: string) => Promise<void>;
}

export function PendingRewardsSection({ pendingRewards, onClaimReward }: Props) {
  const [selectedReward, setSelectedReward] = useState<PendingMissionReward | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);

  if (pendingRewards.length === 0) return null;

  return (
    <>
      <Card className="border-2 border-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50 animate-pulse">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-yellow-600" />
              <CardTitle className="text-xl">🎁 待領取任務獎勵</CardTitle>
            </div>
            <Badge variant="default" className="bg-yellow-600 text-white text-base px-3 py-1">
              {pendingRewards.length} 個待領取
            </Badge>
          </div>
          <CardDescription className="text-base">
            🎉 恭喜！您有 {pendingRewards.length} 個任務獎勵待領取，請盡快領取！
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {pendingRewards.map((reward) => (
            <div
              key={reward.id}
              className="p-4 bg-white border-2 border-yellow-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-600 shrink-0" />
                    <p className="font-bold text-lg">{reward.description}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <div className="flex items-center gap-1">
                      <Gift className="h-4 w-4 text-yellow-600" />
                      <span className="text-muted-foreground">獎勵:</span>
                      <span className="font-bold text-yellow-600 text-base">{reward.amount} P</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{formatTimestamp(reward.achievedAt)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={() => {
                    setSelectedReward(reward);
                    setShowClaimDialog(true);
                  }}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white gap-2 shrink-0"
                >
                  <Gift className="h-5 w-5" />
                  立即領取
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {showClaimDialog && selectedReward && (
        <ClaimRewardDialog
          reward={selectedReward}
          isOpen={showClaimDialog}
          onClose={() => {
            setShowClaimDialog(false);
            setSelectedReward(null);
          }}
          onConfirm={onClaimReward}
        />
      )}
    </>
  );
}
