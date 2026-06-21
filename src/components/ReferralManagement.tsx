import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';
import { ReferralStats } from './referral/ReferralStats';
import { ReferralTreeView } from './referral/ReferralTreeView';
import { ReferralDebugger } from './debug/ReferralDebugger';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useReferralData } from '../hooks/useReferralData';

export function ReferralManagement() {
  const handleBack = useBackNavigation();
  usePageRestoration();

  const { referralData, loading, error, refetch } = useReferralData();

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
        <CardContent>
          {!referralData ||
          (referralData.referralTree.firstGeneration.length === 0 &&
            referralData.referralTree.secondGeneration.length === 0 &&
            referralData.referralTree.thirdGeneration.length === 0) ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">尚無推薦紀錄</p>
              <p className="text-sm text-muted-foreground mt-2">分享您的推薦碼，開始建立推薦網絡</p>
            </div>
          ) : (
            <ReferralTreeView referralTree={referralData.referralTree} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
