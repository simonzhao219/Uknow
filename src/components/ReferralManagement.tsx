import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';
import { ReferralStats } from './referral/ReferralStats';
import { ReferralTreeView } from './referral/ReferralTreeView';
import { InviteFriendButton } from './referral/InviteFriendButton';
import { MyQrButton } from './referral/MyQrButton';
import { ReferralCodeWithCopy } from './referral/ReferralCodeWithCopy';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useReferralData } from '../hooks/useReferralData';

export function ReferralManagement() {
  const handleBack = useBackNavigation();
  usePageRestoration();

  const {
    overview,
    loading,
    isValidating,
    error,
    refetch,
    sort,
    setSort,
    loadChildren,
    searchNetwork,
  } = useReferralData();

  // 標題列三態共用一份：載入中、錯誤態也找得到「我的 QR」（出示驗證碼不必等推薦網絡）。
  const header = (
    <div className="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="shrink-0"
        aria-label="返回上一頁"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0">
        <h1 className="text-3xl font-bold">推薦管理</h1>
      </div>
      <MyQrButton className="ml-auto shrink-0" />
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {header}
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
        {header}
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-destructive-subtle-foreground mb-4">{error}</p>
              <Button onClick={refetch}>重試</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {header}

      <ReferralStats
        firstLevelCount={overview?.summary.firstGenCount || 0}
        secondLevelCount={overview?.summary.secondGenCount || 0}
        thirdLevelCount={overview?.summary.thirdGenCount || 0}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            我的推薦網絡
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 推薦碼列：推薦碼＋複製、邀請好友／加入推薦計畫——與會員中心共用同兩顆
              （同一個元件、同一份狀態來源），這裡只給 bordered row 的外框。
              加入成功後 refetch：會員狀態由元件自己重抓，推薦網絡是本頁的事。 */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <ReferralCodeWithCopy />
            <InviteFriendButton className="ml-auto shrink-0" onJoined={refetch} />
          </div>

          <ReferralTreeView
            overview={overview}
            sort={sort}
            onSortChange={setSort}
            loadChildren={loadChildren}
            searchNetwork={searchNetwork}
            isValidating={isValidating}
          />
        </CardContent>
      </Card>
    </div>
  );
}
