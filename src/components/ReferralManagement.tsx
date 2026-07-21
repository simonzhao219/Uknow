import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Users, Loader2, Share2 } from 'lucide-react';
import { ReferralStats } from './referral/ReferralStats';
import { ReferralTreeView } from './referral/ReferralTreeView';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useReferralData } from '../hooks/useReferralData';
import { useNotification } from './notifications/NotificationContext';
import { shareReferralInvite } from '../utils/referralInvite';

export function ReferralManagement() {
  const handleBack = useBackNavigation();
  usePageRestoration();

  const { referralData, loading, error, refetch } = useReferralData();
  const { showToast } = useNotification();

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="返回上一頁">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">推薦管理</h1>
          </div>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">載入推薦數據中...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="返回上一頁">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">推薦管理</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={refetch}>重試</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="返回上一頁">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">推薦管理</h1>
        </div>
      </div>

      <ReferralStats
        firstLevelCount={referralData?.summary.firstGenCount || 0}
        secondLevelCount={referralData?.summary.secondGenCount || 0}
        thirdLevelCount={referralData?.summary.thirdGenCount || 0}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            我的推薦網絡
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 推薦碼 + 分享（沿用 Dashboard 的 shareReferralInvite） */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">我的推薦碼</p>
              <p className="truncate font-mono text-base font-semibold tracking-wider">
                {referralData?.userReferralCode || '—'}
              </p>
            </div>
            <Button
              className="ml-auto shrink-0"
              onClick={() => shareReferralInvite(referralData?.userReferralCode || '', showToast)}
              disabled={!referralData?.userReferralCode}
            >
              <Share2 className="mr-2 h-4 w-4" />
              分享
            </Button>
          </div>

          <ReferralTreeView roots={referralData?.roots ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
