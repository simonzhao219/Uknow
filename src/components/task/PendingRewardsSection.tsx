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
  /**
   * 不可領取的原因（到期或停權）。有值即停用領取鈕並顯示此原因；
   * null/undefined 表示可領取。「免費續約 1 年」credit 的語意是在既有
   * 會籍後接一年，需帳號正常且會籍有效才能領取——到期不得免費復活、
   * 停權期間不得動用（後端 claim_referral_king_reward 亦會擋，這裡只是
   * 提早收斂 UI、避免走完三步驟對話框才被 403 退回）。
   */
  claimBlockedReason?: string | null;
}

export function PendingRewardsSection({ pendingRewards, onClaimReward, claimBlockedReason = null }: Props) {
  const isBlocked = !!claimBlockedReason;
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
            {isBlocked
              ? `您有待領取的「免費續約 1 年」獎勵，但目前無法領取：${claimBlockedReason}`
              : `🎉 恭喜！您有 ${pendingRewards.length} 個任務獎勵待領取，請盡快領取！`}
          </CardDescription>
        </CardHeader>

        {/* 上限 max-h + overflow-y-auto：即使累積數十筆未領取獎勵，卡片高度
            也被封頂、內部滾動，不會把整頁撐爆。 */}
        <CardContent className="space-y-3 max-h-[28rem] overflow-y-auto">
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
                      <span className="font-bold text-yellow-600 text-base">
                        {reward.rewardType === 'free_renewal_year' ? '免費續約 1 年' : `${reward.amount} P`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{formatTimestamp(reward.achievedAt)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  disabled={isBlocked}
                  title={claimBlockedReason ?? undefined}
                  onClick={() => {
                    setSelectedReward(reward);
                    setShowClaimDialog(true);
                  }}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Gift className="h-5 w-5" />
                  {isBlocked ? '暫無法領取' : '立即領取'}
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
