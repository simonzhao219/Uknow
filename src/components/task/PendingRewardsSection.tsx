import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StatusCallout } from '../ui/status-callout';
import { Trophy, Gift, Clock, Sparkles } from 'lucide-react';
import { ClaimRewardDialog } from './ClaimRewardDialog';
import { ThreeStepDialog } from '../common/ThreeStepDialog';
import { createClaimAllRewardsConfig } from '../common/verification-configs/claimRewardConfig';
import { formatTimestamp } from '../../utils/referralFormatter';
import type { PendingMissionReward } from '../../hooks/useTaskData';

interface Props {
  pendingRewards: PendingMissionReward[];
  onClaimReward: (rewardId: string, idNumber: string) => Promise<void>;
  /** 批次領取：驗證一次身分證後一次領完全部待領 credit。未提供則只顯示單筆領取。 */
  onClaimAll?: (idNumber: string) => Promise<void>;
  /**
   * 為什麼現在不能領：`expired`＝會籍失效（黃框＋續訂引導鈕）、`suspended`＝停權（只有原因
   * 文字）；null＝可領。「免費續約 1 年」credit 的語意是在既有會籍後接一年，需帳號正常且
   * 會籍有效才能領取——到期不得免費復活、停權期間不得動用（後端 claim_referral_king_reward
   * 亦會擋，這裡只是提早收斂 UI、避免走完三步驟對話框才被 403 退回）。領不了時領取鈕不出現。
   *
   * 路由守衛（RequireMembershipRoute）本來就會把失效會員導去結帳，這裡是「頁面開著時
   * 剛好到期」的邊界防線。
   */
  blocked?: 'expired' | 'suspended' | null;
}

export function PendingRewardsSection({
  pendingRewards,
  onClaimReward,
  onClaimAll,
  blocked = null,
}: Props) {
  const [selectedReward, setSelectedReward] = useState<PendingMissionReward | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [showClaimAllDialog, setShowClaimAllDialog] = useState(false);

  const count = pendingRewards.length;
  if (count === 0) return null;

  if (blocked) {
    const expired = blocked === 'expired';
    return (
      <StatusCallout
        data-testid="pending-rewards"
        variant="warning"
        title={expired ? '會籍已失效' : '帳號已停權'}
        description={
          expired
            ? `您有 ${count} 個任務獎勵待領取，請先續訂後再領取。`
            : `您有 ${count} 個任務獎勵待領取，帳號已停權，請聯繫客服。`
        }
        action={
          expired ? (
            <div className="flex justify-end">
              {/* 續訂是引導鈕（會籍失效），取黃框的容器色；全頁唯一實心鈕（§12.11） */}
              <Button tone="guide" container="warning" asChild>
                <Link to="/payment/checkout">續訂</Link>
              </Button>
            </div>
          ) : undefined
        }
      />
    );
  }

  // 有多張待領且父層有提供批次 handler 時，才顯示「領取全部」。
  const canClaimAll = !!onClaimAll && count >= 2;

  return (
    <>
      <Card
        data-testid="pending-rewards"
        className="border-2 border-success-border bg-success-subtle text-success-subtle-foreground"
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
              <CardTitle className="text-xl">待領取任務獎勵</CardTitle>
            </div>
            <Badge variant="success" className="px-3 py-1 text-base">
              {count} 個待領取
            </Badge>
          </div>
          <CardDescription className="text-base text-success-subtle-foreground">
            恭喜！您有 {count} 個任務獎勵待領取。
          </CardDescription>

          {canClaimAll && (
            <Button
              size="lg"
              onClick={() => setShowClaimAllDialog(true)}
              tone="secondary"
              container="success"
              className="mt-2 w-full gap-2 sm:w-auto"
            >
              <Gift className="h-5 w-5" />
              一次領取全部（{count} 張）
            </Button>
          )}
        </CardHeader>

        {/* 上限 max-h + overflow-y-auto：即使累積數十筆未領取獎勵，卡片高度
            也被封頂、內部滾動，不會把整頁撐爆。 */}
        <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto">
          {pendingRewards.map((reward) => (
            <div
              key={reward.id}
              className="rounded-lg border-2 border-success-border bg-card p-4 text-foreground shadow-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Trophy
                      className="h-5 w-5 shrink-0 text-success-subtle-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-lg font-bold">{reward.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Gift className="h-4 w-4 text-success-subtle-foreground" aria-hidden="true" />
                      <span className="text-muted-foreground">獎勵:</span>
                      <span className="text-base font-bold text-success-subtle-foreground">
                        {reward.rewardType === 'free_renewal_year'
                          ? '免費續約 1 年'
                          : `${reward.amount} P`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-muted-foreground">
                        {formatTimestamp(reward.achievedAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={() => {
                    setSelectedReward(reward);
                    setShowClaimDialog(true);
                  }}
                  tone="secondary"
                  container="success"
                  className="shrink-0 gap-2"
                >
                  <Gift className="h-5 w-5" />
                  領取獎勵
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

      {showClaimAllDialog && onClaimAll && (
        <ThreeStepDialog
          isOpen={showClaimAllDialog}
          config={createClaimAllRewardsConfig(count)}
          onClose={() => setShowClaimAllDialog(false)}
          onConfirm={onClaimAll}
        />
      )}
    </>
  );
}
