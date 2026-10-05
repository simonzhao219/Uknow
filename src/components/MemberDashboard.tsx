import { useContext } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { StatCardGrid } from './ui/stat-card-grid';
import { UserContext } from '../App';
import { Users, Settings, User, CheckSquare, Gift, Info, ArrowLeft } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useFeatures } from '../contexts/FeatureContext';
import { useNotification } from './notifications/NotificationContext';
import { useSubscription } from '../hooks/useSubscription';
import { useUserListing } from '../hooks/useUserListing';
import { useReferralData } from '../hooks/useReferralData';
import { useTaskData } from '../hooks/useTaskData';
import { useRewardData } from '../hooks/useRewardData';
import { SubscriptionStatusCard } from './subscription/SubscriptionStatusCard';
import { MyQrEntry } from './referral/MyQrEntry';
import { LINE_OFFICIAL_ACCOUNT_HANDLE } from '../utils/constants';
import { formatTwDate } from '../utils/twDate';
import { canRequestWithdrawal } from '../utils/withdrawalValidation';
import { computeKingRounds } from '../utils/kingProgress';
import {
  DashboardStatCard,
  StatCardAction,
  StatCardError,
  StatValue,
} from './dashboard/DashboardStatCard';
import { AttentionCallout, type AttentionItem } from './dashboard/AttentionCallout';
import {
  countAwaitingCollection,
  countExpiring,
  formatExpiringCount,
} from './dashboard/dashboardSummary';

/**
 * 會員中心＝狀態總覽，不是導覽選單（ui-ux-guidelines §13；任務／推薦／獎勵的
 * 入口在 BottomNav）。由上到下：需要注意（有事才出現）→ 四張狀態卡 → 我的訂閱
 * → 會員資訊。
 *
 * 資料 hook 一律在這裡各掛一次、以 props 往下傳：「需要注意」與卡片讀同一份
 * 資料，各自掛會變成同頁兩個實例共用一個 dedupe 請求（見 utils/requestDedup.ts）。
 * 全部是既有 API，不新增後端欄位。
 */
export function MemberDashboard() {
  const { user } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const { isFeatureEnabled } = useFeatures();
  const { showInfo } = useNotification();

  const listingEnabled = isFeatureEnabled('serviceProviderManagement');
  const referralEnabled = isFeatureEnabled('referralManagement');
  const taskEnabled = isFeatureEnabled('taskCenter');
  const rewardEnabled = isFeatureEnabled('rewardSystem');

  const { subscriptionData, isLoading } = useSubscription();
  const {
    listing,
    loading: listingLoading,
    error: listingError,
  } = useUserListing({ enabled: listingEnabled });
  const referral = useReferralData();
  const task = useTaskData();
  const reward = useRewardData();

  // 刊登三態要分清楚：讀取中／讀取失敗／確定沒有刊登。只有第三種才顯示建立
  // CTA，否則會對已經有刊登的人喊「尚未刊登」。
  const hasNoListing = listingEnabled && !listingLoading && !listingError && listing === null;

  const expiring = countExpiring(referral.overview?.attention);
  const expiringText = formatExpiringCount(expiring);
  const awaitingCount = countAwaitingCollection(reward.withdrawals);
  const rewardsData = reward.rewardsData;
  const canWithdraw =
    rewardEnabled &&
    !!rewardsData &&
    canRequestWithdrawal({
      availableRewards: rewardsData.availableRewards,
      hasWithdrawnToday: rewardsData.hasWithdrawnToday,
      subscriptionStatus: subscriptionData?.status ?? null,
      referralProgramJoined: user?.referralProgramJoined,
    });

  const attentionItems: AttentionItem[] = [];
  if (referralEnabled && expiring.count > 0) {
    attentionItems.push({
      key: 'expiring',
      to: '/referrals',
      label: `推薦網絡 ${expiringText} 位即將到期`,
    });
  }
  if (rewardEnabled && awaitingCount > 0) {
    attentionItems.push({
      key: 'awaiting',
      to: '/rewards',
      label: `${awaitingCount} 筆提領待查收`,
    });
  }

  // 刊登可見性只有後端真有的兩種（規格書 §11）：會籍有效＝上架中（正常態不加徽章）、
  // 會籍失效＝已隱藏。失效會員多半被 RequireMembershipRoute 導去續約，這裡是
  // 頁面開著時剛好到期的邊界。停權也會讓刊登下架（public_listings），但停權帳號
  // 被 RequireMembershipRoute 擋在會員區外，進不到這頁，所以不另判。
  const listingHidden = subscriptionData?.status === 'expired';
  const memberUntil = subscriptionData?.activeUntil
    ? formatTwDate(subscriptionData.activeUntil)
    : null;

  // 後端 /tasks 目前只有推薦王；以 type 取而不是取第一個，日後多了任務不會換錯卡。
  const currentTask = task.tasks.find((t) => t.type === 'monthly_king');
  // current 是本月累計新推薦數；與任務中心同一套換算成「本輪 x / y＋本月已完成 N 次」，
  // 避免滿一輪後這裡顯示 17 / 8、任務中心卻是 1 / 8。
  const rounds = currentTask ? computeKingRounds(currentTask.current, currentTask.target) : null;

  const handleShowProfileInfo = () => {
    showInfo('修改會員資料', '會員資料一經註冊後無法自行修改。', [
      '如需更改基本資料，請透過 LINE 聯繫客服：',
      `📱 LINE 官方帳號：${LINE_OFFICIAL_ACCOUNT_HANDLE}`,
    ]);
  };

  const listingLabel = () => {
    if (listingLoading) return '刊登：讀取中';
    if (listingError) return '刊登：暫時無法取得刊登狀態';
    if (!listing) return '刊登：尚未建立刊登，立即刊登';
    return [
      `刊登：${listing.name}`,
      memberUntil && `會籍至 ${memberUntil}`,
      listingHidden && '已隱藏',
    ]
      .filter(Boolean)
      .join('，');
  };

  const referralLabel = () => {
    if (referral.loading) return '推薦網絡：讀取中';
    if (referral.error || !referral.overview) return '推薦網絡：暫時無法取得推薦資料';
    const parts = [`推薦網絡：${referral.overview.summary.totalReferrals} 位`];
    if (expiring.count > 0) parts.push(`${expiringText} 位即將到期`);
    return parts.join('，');
  };

  const taskLabel = () => {
    if (task.isLoading) return '本月任務：讀取中';
    if (task.error) return '本月任務：暫時無法取得任務進度';
    if (!currentTask || !rounds) return '本月任務：目前沒有任務';
    const parts = [
      `本月任務：${currentTask.title}本輪推薦 ${rounds.currentRoundCount} / ${currentTask.target} 位`,
    ];
    if (rounds.roundsThisMonth > 0) parts.push(`本月已完成 ${rounds.roundsThisMonth} 次`);
    if (currentTask.completed) parts.push('本月已達標');
    return parts.join('，');
  };

  const rewardLabel = () => {
    if (reward.isLoading) return '可提領點數：讀取中';
    if (reward.error || !rewardsData) return '可提領點數：暫時無法取得點數';
    const parts = [`可提領點數：${rewardsData.availableRewards.toLocaleString()} P`];
    if (awaitingCount > 0) parts.push(`待查收 ${awaitingCount} 筆`);
    if (canWithdraw) parts.push('申請提領');
    return parts.join('，');
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

      <AttentionCallout items={attentionItems} />

      {/* 四張狀態卡：每張一個主數字或主狀態，數字一律 --foreground（§12.5），
          語義由徽章承擔；手機 2×2、桌機一列（StatCardGrid 依張數自動排）。 */}
      <StatCardGrid>
        {listingEnabled && (
          <DashboardStatCard
            to={hasNoListing ? '/service-providers/create' : '/service-providers'}
            title="刊登"
            icon={Settings}
            ariaLabel={listingLabel()}
            loading={listingLoading}
          >
            {listingError ? (
              <StatCardError>暫時無法取得刊登狀態</StatCardError>
            ) : listing ? (
              <>
                <p className="truncate text-lg font-semibold text-foreground">{listing.name}</p>
                {isLoading ? null : (
                  <>
                    {memberUntil && (
                      <p className="text-xs text-muted-foreground">會籍至 {memberUntil}</p>
                    )}
                    {listingHidden && <Badge variant="secondary">已隱藏</Badge>}
                  </>
                )}
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-foreground">尚未建立刊登</p>
                <StatCardAction>立即刊登</StatCardAction>
              </>
            )}
          </DashboardStatCard>
        )}

        {referralEnabled && (
          <DashboardStatCard
            to="/referrals"
            title="推薦網絡"
            icon={Users}
            ariaLabel={referralLabel()}
            loading={referral.loading}
          >
            {referral.error || !referral.overview ? (
              <StatCardError>暫時無法取得推薦資料</StatCardError>
            ) : (
              <>
                <StatValue>{referral.overview.summary.totalReferrals}</StatValue>
                <p className="text-xs text-muted-foreground">位</p>
                {expiring.count > 0 && (
                  <Badge variant="warning-subtle">{expiringText} 位即將到期</Badge>
                )}
              </>
            )}
          </DashboardStatCard>
        )}

        {taskEnabled && (
          <DashboardStatCard
            to="/tasks"
            title="本月任務"
            icon={CheckSquare}
            ariaLabel={taskLabel()}
            loading={task.isLoading}
          >
            {task.error ? (
              <StatCardError>暫時無法取得任務進度</StatCardError>
            ) : currentTask && rounds ? (
              <>
                <p className="text-xs text-muted-foreground">本輪推薦</p>
                <StatValue>
                  {rounds.currentRoundCount} / {currentTask.target}
                  <span className="ml-1 text-base font-medium text-muted-foreground">位</span>
                </StatValue>
                {/* 進度填色用品牌色 brand（重點與進度）、軌道灰階（§12.5，同 task/ProgressBar）。 */}
                <div className="h-2 overflow-hidden rounded-full bg-muted-foreground/20">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${Math.min(100, Math.round(rounds.roundProgressPct))}%` }}
                  />
                </div>
                {rounds.roundsThisMonth > 0 && (
                  <p className="text-xs text-muted-foreground">
                    本月已完成 {rounds.roundsThisMonth} 次
                  </p>
                )}
                {currentTask.completed && <Badge variant="success-subtle">本月已達標</Badge>}
              </>
            ) : (
              // 空態不是錯誤：用一般文字，不借錯誤態的樣式。
              <p className="text-base font-semibold text-foreground">目前沒有任務</p>
            )}
          </DashboardStatCard>
        )}

        {rewardEnabled && (
          <DashboardStatCard
            to="/rewards"
            title="可提領點數"
            icon={Gift}
            ariaLabel={rewardLabel()}
            loading={reward.isLoading}
          >
            {reward.error || !rewardsData ? (
              <StatCardError>暫時無法取得點數</StatCardError>
            ) : (
              <>
                <StatValue>
                  {rewardsData.availableRewards.toLocaleString()}
                  <span className="ml-1 text-base font-medium text-muted-foreground">P</span>
                </StatValue>
                {awaitingCount > 0 && (
                  <Badge variant="warning-subtle">待查收 {awaitingCount} 筆</Badge>
                )}
                {canWithdraw && <StatCardAction>申請提領</StatCardAction>}
              </>
            )}
          </DashboardStatCard>
        )}
      </StatCardGrid>

      <SubscriptionStatusCard subscriptionData={subscriptionData} isLoading={isLoading} />

      {/* 會員基本資訊：不會變的靜態資料，放在狀態之後 */}
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
          {/* 推薦碼與「我的 QR」的唯一入口——與推薦管理頁共用同一顆，狀態/邏輯/
              呈現由元件本身保證一致。這裡是四欄資訊卡的一格，外框交給 grid，
              所以不給 className（推薦管理頁在那邊自己加一層 bordered row）。 */}
          <MyQrEntry />
        </CardContent>
      </Card>
    </div>
  );
}
