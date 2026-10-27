import { useState } from 'react';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { RewardStats } from './reward/RewardStats';
import { WithdrawalAction } from './reward/WithdrawalAction';
import { WithdrawalSection } from './reward/WithdrawalSection';
import { WithdrawalProcess } from './reward/WithdrawalProcess';
import { RewardHistory } from './reward/RewardHistory';
import { IdVerificationSection } from './reward/IdVerificationSection';
import { Button } from './ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useRewardData } from '../hooks/useRewardData';
import { useRetryFocus } from '../hooks/useRetryFocus';
import { useSubscription } from '../hooks/useSubscription';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import { StatusCallout } from './ui/status-callout';
import { LoadErrorCallout } from './common/LoadErrorCallout';
import type { IdPhotosResponse } from '@contract';

/** 證件狀態的取讀與上傳。抽在元件外，讓 IdVerificationSection 保持可單元測試。 */
async function loadIdStatus() {
  const res = await apiRequestJson<IdPhotosResponse>(buildApiUrl('/rewards/id-photos'));
  return res.data;
}

async function uploadIdPhotos(files: { front?: File; back?: File }) {
  const form = new FormData();
  if (files.front) form.append('idCardFront', files.front);
  if (files.back) form.append('idCardBack', files.back);

  // 走原生 fetch 而非 apiRequestJson：後者會設 Content-Type: application/json，
  // 而 multipart 需要瀏覽器自己帶 boundary（同 WithdrawalProcess 的上傳路徑）。
  const { getAccessToken } = await import('../utils/auth');
  const token = await getAccessToken();
  if (!token) throw new Error('請先登入');

  const res = await fetch(buildApiUrl('/rewards/upload-id-photos'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('照片上傳失敗');
}

export function RewardDashboard() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const handleBack = useBackNavigation();
  usePageRestoration();
  const { showError } = useNotification();

  const { rewardsData, withdrawals, isLoading, error, refetch, clearAndRefetch } = useRewardData();
  // 訂閱狀態單一來源：與 SubscriptionStatusCard 共用 useSubscription 的
  // 快取，避免與獎勵資料各自維護一份 status 在邊界互相矛盾。
  const { subscriptionData } = useSubscription();
  const subscriptionStatus = subscriptionData?.status ?? null;

  // 重試後的焦點落點（§9）：失敗回錯誤框、成功到標題。
  const { errorRef, headingRef, retry } = useRetryFocus({
    loading: isLoading,
    failed: Boolean(error),
  });

  const [showWithdrawalProcess, setShowWithdrawalProcess] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleStartWithdrawal = () => {
    if (subscriptionStatus === 'expired') {
      showError('無法申請提領', '訂閱已失效，無法申請提領。請續訂以恢復服務。');
      return;
    }
    setShowWithdrawalProcess(true);
  };

  const handleSuccessWithdrawal = async () => {
    setShowWithdrawalProcess(false);
    await clearAndRefetch();
    setHistoryRefreshTrigger((prev) => prev + 1);
  };

  const header = (subtitle?: string) => (
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
          獎勵回饋
        </h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {header()}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {header()}
        {/* 只重抓本頁資料，不整頁 reload（reload 會重開整個 SPA：重解析 session、清光快取、白畫面閃爍） */}
        <LoadErrorCallout
          ref={errorRef}
          title="暫時無法取得獎勵資料"
          description={error}
          onRetry={() => retry(clearAndRefetch)}
        />
      </div>
    );
  }

  if (showWithdrawalProcess) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {header('Point提領申請流程')}
        <WithdrawalProcess
          availableRewards={rewardsData?.availableRewards || 0}
          pendingRewards={rewardsData?.pendingRewards || 0}
          onSuccess={handleSuccessWithdrawal}
          onCancel={() => setShowWithdrawalProcess(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {header('管理您的Point和提領申請')}

      {/* 失效會員看得到這一頁（路由的 allowExpired），因為規格 §5 承諾點數
          「保留不歸零」——看不到的承諾等於不存在。但要一眼看出自己現在的
          狀態與唯一出路，所以續約提示常駐在最上方、不可關閉；提領被擋的
          細節由「可提領」主區內的 WithdrawalAction 說明，這裡不重複。 */}
      {subscriptionStatus === 'expired' && (
        <StatusCallout
          data-testid="expired-renewal-banner"
          variant="warning"
          title="您的會籍已到期"
          description={
            <>
              <span className="font-medium">Point 全數保留不會歸零</span>
              ，但續訂後才能提領。
            </>
          }
          action={
            <Button
              tone="guide"
              container="warning"
              size="sm"
              onClick={() => navigate('/payment/checkout')}
            >
              續訂
            </Button>
          }
        />
      )}

      {/* 可提領＝本頁唯一的淡底主區，申請提領鈕收進這張卡（提領停用的原因與 P3′ 的引導連結
          也在卡內）。 */}
      <RewardStats
        availableRewards={rewardsData?.availableRewards || 0}
        totalRewards={rewardsData?.totalEarned || 0}
        action={
          <WithdrawalAction
            availableRewards={rewardsData?.availableRewards || 0}
            hasWithdrawnToday={rewardsData?.hasWithdrawnToday || false}
            subscriptionStatus={subscriptionStatus}
            referralProgramJoined={user?.referralProgramJoined}
            onStartWithdrawal={handleStartWithdrawal}
          />
        }
      />

      {/* 只在 rejected 渲染的警示卡——出事的警示不該沉底;平常回 null,不佔版面。 */}
      <IdVerificationSection loadStatus={loadIdStatus} uploadPhotos={uploadIdPhotos} />

      {/* DOM 與手機順序一致：主區 → 提領申請 → 獎勵明細（進行中的事在前）；桌機才用 order
          維持原本的明細在左、提領在右。 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:order-2">
          <WithdrawalSection
            pendingRewards={rewardsData?.pendingRewards || 0}
            withdrawnRewards={rewardsData?.withdrawnRewards || 0}
            withdrawals={withdrawals}
            onRefresh={refetch}
            subscriptionStatus={subscriptionStatus}
          />
        </div>
        <div className="lg:order-1">
          <RewardHistory refreshTrigger={historyRefreshTrigger} />
        </div>
      </div>
    </div>
  );
}
