import { useContext } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';
import { ReferralStats } from './referral/ReferralStats';
import { ReferralTreeView } from './referral/ReferralTreeView';
import { InviteFriendButton } from './referral/InviteFriendButton';
import { UserContext } from '../App';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useReferralData } from '../hooks/useReferralData';

export function ReferralManagement() {
  const handleBack = useBackNavigation();
  usePageRestoration();
  const { user, setUser } = useContext(UserContext);

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

  // 未加入推薦計畫者按「加入推薦計畫」成功後：更新會員狀態並重抓推薦資料（拿到新推薦碼）。
  const handleJoinSuccess = (_referralCode: string, joinedAt: string) => {
    if (user) {
      const updated = { ...user, referralProgramJoined: true, referralProgramJoinedAt: joinedAt };
      setUser(updated);
      localStorage.setItem('user', JSON.stringify(updated));
    }
    refetch();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0"
            aria-label="返回上一頁"
          >
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
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="shrink-0"
          aria-label="返回上一頁"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">推薦管理</h1>
        </div>
      </div>

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
          {/* 推薦碼 + 單一「邀請好友」入口（與會員中心共用同一顆按鈕與面板，行為一致） */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">我的推薦碼</p>
              <p className="truncate font-mono text-base font-semibold tracking-wider text-purple-600">
                {overview?.userReferralCode || '—'}
              </p>
            </div>
            <div className="ml-auto shrink-0">
              <InviteFriendButton
                joined={!!user?.referralProgramJoined}
                referralCode={overview?.userReferralCode}
                memberName={user?.name}
                onJoinSuccess={handleJoinSuccess}
              />
            </div>
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
