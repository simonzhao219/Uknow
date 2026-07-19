import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { UserContext } from '../App';
import { Users, Settings, User, CheckSquare, Gift, Info, ArrowLeft, Copy, Shield, Share2 } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useFeatures } from '../contexts/FeatureContext';
import { useNotification } from './notifications/NotificationContext';
import { shareReferralInvite } from '../utils/referralInvite';
import { useState } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { SubscriptionStatusCard } from './subscription/SubscriptionStatusCard';
import { JoinReferralProgramDialog } from './referral/JoinReferralProgramDialog';

export function MemberDashboard() {
  const { user, setUser } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const { isFeatureEnabled } = useFeatures();
  const { showToast, showInfo } = useNotification();

  const { subscriptionData, isLoading } = useSubscription();

  const [showJoinReferralDialog, setShowJoinReferralDialog] = useState(false);

  const handleShowProfileInfo = () => {
    showInfo(
      '修改會員資料',
      '會員資料一經註冊後無法自行修改。',
      ['如需更改基本資料，請透過 LINE 聯繫客服：', '📱 LINE 官方帳號：@Uknow']
    );
  };

  const handleCopyReferralCode = () => {
    if (!user?.referralCode) {
      showToast('推薦碼不存在', 'error');
      return;
    }
    const textArea = document.createElement('textarea');
    textArea.value = user.referralCode;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('推薦碼已複製到剪貼板', 'success');
    } catch {
      showToast('複製失敗，請手動複製', 'error');
    }
    document.body.removeChild(textArea);
  };

  const handleJoinReferralSuccess = (referralCode: string, joinedAt: string) => {
    if (user) {
      const updatedUser = { ...user, referralProgramJoined: true, referralProgramJoinedAt: joinedAt };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
              {user?.referralProgramJoined ? (
                <>
                  <p className="font-medium font-mono text-lg tracking-wider text-purple-600">
                    {user?.referralCode || '未生成'}
                  </p>
                  {user?.referralCode && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleCopyReferralCode}
                        title="複製推薦碼"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => shareReferralInvite(user.referralCode!, showToast)}
                        title="分享邀請連結與推薦碼"
                        data-testid="share-referral-button"
                      >
                        <Share2 className="h-4 w-4 mr-1" />
                        分享
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <Button
                  onClick={() => setShowJoinReferralDialog(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  size="sm"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  加入推薦計畫
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 快速操作區域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isFeatureEnabled('serviceProviderManagement') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5 text-blue-600" />
                刊登管理
              </CardTitle>
              <CardDescription>管理已刊登的服務</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/service-providers">查看管理</Link>
              </Button>
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
      <SubscriptionStatusCard
        subscriptionData={subscriptionData}
        isLoading={isLoading}
      />

      <JoinReferralProgramDialog
        open={showJoinReferralDialog}
        onClose={() => setShowJoinReferralDialog(false)}
        onSuccess={handleJoinReferralSuccess}
      />
    </div>
  );
}
