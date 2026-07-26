import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { UserContext } from '../App';
import { Users, Settings, User, CheckSquare, Gift, Info, ArrowLeft } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useFeatures } from '../contexts/FeatureContext';
import { useNotification } from './notifications/NotificationContext';
import { useSubscription } from '../hooks/useSubscription';
import { useUserListing } from '../hooks/useUserListing';
import { SubscriptionStatusCard } from './subscription/SubscriptionStatusCard';
import { InviteFriendButton } from './referral/InviteFriendButton';
import { LINE_OFFICIAL_ACCOUNT_HANDLE, LINE_OFFICIAL_ACCOUNT_URL } from '../utils/constants';

export function MemberDashboard() {
  const { user, setUser } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const { isFeatureEnabled } = useFeatures();
  const { showInfo } = useNotification();

  const { subscriptionData, isLoading } = useSubscription();

  // 刊登不在底部導覽裡，這張卡片是它的主入口——所以要能直接看出「我有沒有
  // 刊登、刊登的是什麼」，而不是只給一個看不出狀態的連結。
  const listingEnabled = isFeatureEnabled('serviceProviderManagement');
  const {
    listing,
    loading: listingLoading,
    error: listingError,
  } = useUserListing({
    enabled: listingEnabled,
  });
  // 三態要分清楚：讀取中／讀取失敗／確定沒有刊登。只有第三種才顯示建立
  // CTA，否則會對已經有刊登的人喊「尚未刊登」。
  const hasNoListing = !listingLoading && !listingError && listing === null;

  const handleShowProfileInfo = () => {
    showInfo('修改會員資料', '會員資料一經註冊後無法自行修改。', [
      '如需更改基本資料，請透過 LINE 聯繫客服：',
      <>
        📱 LINE 官方帳號：
        <a href={LINE_OFFICIAL_ACCOUNT_URL} className="underline">
          {LINE_OFFICIAL_ACCOUNT_HANDLE}
        </a>
      </>,
    ]);
  };

  const handleJoinReferralSuccess = (referralCode: string, joinedAt: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        referralProgramJoined: true,
        referralProgramJoinedAt: joinedAt,
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

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
          <h1 className="text-3xl font-bold">會員中心</h1>
          <p className="text-muted-foreground">歡迎回來，{user?.name}</p>
        </div>
      </div>

      {/* 會員基本資訊 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            會員資訊
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShowProfileInfo}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="會員資料修改說明"
          >
            <Info className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">真實姓名</p>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">聯絡電話</p>
            <p className="font-medium">{user?.phone}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium truncate">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">我的推薦碼</p>
            <div className="flex items-center gap-2">
              {user?.referralProgramJoined && !user?.referralCode ? (
                <p className="font-medium font-mono text-lg tracking-wider text-purple-600">
                  未生成
                </p>
              ) : (
                <>
                  {user?.referralCode ? (
                    <p className="font-medium font-mono text-lg tracking-wider text-purple-600">
                      {user.referralCode}
                    </p>
                  ) : null}
                  {/* 單一「邀請好友」入口：已加入 → 開含 QR 的分享面板；未加入 → 引導加入。 */}
                  <InviteFriendButton
                    joined={!!user?.referralProgramJoined}
                    referralCode={user?.referralCode}
                    memberName={user?.name}
                    onJoinSuccess={handleJoinReferralSuccess}
                  />
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 快速操作區域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {listingEnabled && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5 text-blue-600" />
                刊登管理
              </CardTitle>
              <CardDescription className="truncate">
                {listingLoading
                  ? '讀取刊登狀態…'
                  : listingError
                    ? '暫時無法取得刊登狀態'
                    : listing
                      ? [listing.name, listing.category].filter(Boolean).join('・')
                      : '尚未建立刊登'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasNoListing ? (
                <Button asChild className="w-full">
                  <Link to="/service-providers/create">立即刊登</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" className="w-full">
                  <Link to="/service-providers">查看管理</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {isFeatureEnabled('referralManagement') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-purple-600" />
                推薦管理
              </CardTitle>
              <CardDescription>推薦好友賺Point</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/referrals">推薦管理</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isFeatureEnabled('taskCenter') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckSquare className="h-5 w-5 text-green-600" />
                任務中心
              </CardTitle>
              <CardDescription>完成任務賺Point</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/tasks">任務中心</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isFeatureEnabled('rewardSystem') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="h-5 w-5 text-orange-600" />
                獎勵回饋
              </CardTitle>
              <CardDescription>查看Point收益</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/rewards">Point管理</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 訂閱狀態 */}
      <SubscriptionStatusCard subscriptionData={subscriptionData} isLoading={isLoading} />
    </div>
  );
}
