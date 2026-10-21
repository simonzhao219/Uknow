import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { StatusCallout } from './ui/status-callout';
import { Gift, ArrowLeft, Loader2, Eye, Trophy } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useRetryFocus } from '../hooks/useRetryFocus';
import { useTaskData } from '../hooks/useTaskData';
import { UserContext } from '../App';
import { LoadErrorCallout } from './common/LoadErrorCallout';
import { PendingRewardsSection } from './task/PendingRewardsSection';
import { TaskGuide } from './task/TaskGuide';
import { TaskMedals } from './task/TaskMedals';
import { MonthlyKingProgress } from './task/MonthlyKingProgress';
import { computeKingRounds } from '../utils/kingProgress';
import { referralJoinState } from '../utils/myQrTabPreference';

/**
 * 任務中心的資訊層次（ui-ux-guidelines §13、plan.md §4 第 13 點）：
 * 待領取的獎勵置頂（可領＝綠框、領不了＝黃框）→ 任務卡 → 任務說明。
 * 任務卡只有一塊淡底主區：主數字是「本輪 x / 門檻」，四顆徽章就是進度條；本月已推薦人數
 * 與已完成次數降為一行小字。任務只有推薦王一個，且輪次滾動（滿 8 人顯示 8/8，第 9 人才
 * 歸零重點），所以沒有「達標就收起」的卡——達標的資訊收成「已完成 N 次」一行。
 */
export function TaskDashboard() {
  const handleBack = useBackNavigation();

  const {
    tasks,
    pendingRewards,
    currentMonthData,
    isLoading,
    loadingCurrent,
    error,
    fetchCurrentMonthTop,
    handleClaimReward,
    handleClaimAllRewards,
    refetch,
  } = useTaskData();

  // 領免費續約 credit 的可領性：帳號須正常（未停權）且會籍有效（active）。
  // 兩個訊號都直接讀 UserContext.user（/profile 回傳 accountStatus 與
  // suspended，App 已對 /profile 掛 focus-revalidation），不必另開請求。
  // 與後端 claim_referral_king_reward 同一把尺：停權優先擋、再擋到期。
  // 失效會員平常進不了本頁（路由守衛導去結帳），這是頁面開著時剛好到期的邊界。
  const { user } = useContext(UserContext);
  const claimBlocked =
    user?.suspended === true ? 'suspended' : user?.accountStatus === 'expired' ? 'expired' : null;

  // 「已付費、未加入推薦計畫」是正式狀態：任務照計，只多一行說明（碼不能出示或分享）。
  // 還不知道（會員資料未取得）不畫成未加入。
  const notJoined = referralJoinState(user) === 'not-joined';

  const [showKingProgress, setShowKingProgress] = useState(false);

  // 重試後的焦點落點（§9）：失敗回錯誤框、成功到標題。
  const { errorRef, headingRef, retry } = useRetryFocus({
    loading: isLoading,
    failed: Boolean(error),
  });

  const handleViewCurrentMonthTop = async () => {
    const data = await fetchCurrentMonthTop();
    if (data) setShowKingProgress(true);
  };

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
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold outline-none">
          任務中心
        </h1>
        <p className="text-muted-foreground">完成推薦任務，解鎖專屬獎勵！</p>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {header}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {header}
        <LoadErrorCallout
          ref={errorRef}
          title="暫時無法取得任務資料"
          description={error}
          onRetry={() => retry(refetch)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {header}

      <PendingRewardsSection
        pendingRewards={pendingRewards}
        onClaimReward={handleClaimReward}
        onClaimAll={handleClaimAllRewards}
        blocked={claimBlocked}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          {tasks.map((task) => {
            // 進度以「當前輪」呈現（3-B 多輪）：主數字與徽章都吃本輪人數。
            const rounds = computeKingRounds(task.current, task.target);
            const roundFull = task.current > 0 && rounds.currentRoundCount === task.target;

            return (
              <Card key={task.id}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Trophy className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-xl">{task.title}</CardTitle>
                      <CardDescription>{task.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* 本頁唯一的淡底主區（重點與進度，§12.3）：主數字＋徽章 */}
                  <div className="rounded-lg bg-brand-subtle p-3 text-brand-subtle-foreground">
                    <p className="text-xs">本輪推薦</p>
                    <p
                      data-testid="round-progress"
                      className="text-3xl font-bold leading-tight tabular-nums"
                    >
                      {rounds.currentRoundCount} / {task.target}
                      <span className="ml-1 text-base font-medium">位</span>
                      {roundFull && <span className="ml-2 text-sm font-medium">已滿一輪</span>}
                    </p>
                    <p className="mt-1 text-xs">
                      {`本月已推薦 ${task.current} 人${
                        rounds.roundsThisMonth > 0 ? `，已完成 ${rounds.roundsThisMonth} 次` : ''
                      }`}
                    </p>
                    <TaskMedals
                      className="mt-3"
                      roundCount={rounds.currentRoundCount}
                      target={task.target}
                    />
                    {notJoined && (
                      <div className="mt-3 text-xs">
                        <p>尚未加入推薦計畫，推薦碼目前不能出示或分享。</p>
                        <Link
                          to="/referrals"
                          className="inline-flex items-center font-medium underline underline-offset-2 pointer-coarse:min-h-11"
                        >
                          前往推薦管理加入
                        </Link>
                      </div>
                    )}
                  </div>

                  <StatusCallout
                    variant="neutral"
                    icon={Gift}
                    title={
                      <>
                        任務獎勵 <span className="font-semibold">{task.reward.label}</span>
                      </>
                    }
                  />

                  {task.details?.totalCredits > 0 && (
                    <p className="text-sm text-muted-foreground">
                      累計獲得 {task.details.totalCredits} 張免費續約
                    </p>
                  )}

                  {task.current > 0 ? (
                    <Button
                      tone="secondary"
                      size="sm"
                      onClick={handleViewCurrentMonthTop}
                      loading={loadingCurrent}
                      className="w-full gap-2"
                    >
                      {loadingCurrent ? (
                        '載入中...'
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          查看本月推薦詳情
                        </>
                      )}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      完成第一次推薦後，任務將自動啟動！
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          <TaskGuide />
        </div>
      </div>

      {showKingProgress && currentMonthData && (
        <MonthlyKingProgress
          month={currentMonthData.month}
          total={currentMonthData.total}
          completedCount={currentMonthData.completedCount}
          currentProgress={currentMonthData.currentProgress}
          referrals={currentMonthData.referrals}
          target={currentMonthData.target}
          onClose={() => setShowKingProgress(false)}
        />
      )}
    </div>
  );
}
