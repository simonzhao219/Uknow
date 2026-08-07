import { useState } from 'react';
import { useContext } from 'react';
import { UserContext } from '../App';
import { RewardStats } from './reward/RewardStats';
import { WithdrawalSection } from './reward/WithdrawalSection';
import { WithdrawalProcess } from './reward/WithdrawalProcess';
import { RewardHistory } from './reward/RewardHistory';
import { IdVerificationSection } from './reward/IdVerificationSection';
import { Button } from './ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { useRewardData } from '../hooks/useRewardData';
import { useSubscription } from '../hooks/useSubscription';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
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
  const handleBack = useBackNavigation();
  usePageRestoration();
  const { showError } = useNotification();

  const { rewardsData, withdrawals, isLoading, error, refetch, clearAndRefetch } = useRewardData();
  // 訂閱狀態單一來源：與 SubscriptionStatusCard 共用 useSubscription 的
  // 快取，避免與獎勵資料各自維護一份 status 在邊界互相矛盾。
  const { subscriptionData } = useSubscription();
  const subscriptionStatus = subscriptionData?.status ?? null;

  const [showWithdrawalProcess, setShowWithdrawalProcess] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleStartWithdrawal = () => {
    if (subscriptionStatus === 'expired') {
      showError('無法申請提領', '訂閱已失效，無法申請提領。請重新訂閱以恢復服務。');
      return;
    }
    setShowWithdrawalProcess(true);
  };

  const handleSuccessWithdrawal = async () => {
    setShowWithdrawalProcess(false);
    await clearAndRefetch();
    setHistoryRefreshTrigger((prev) => prev + 1);
  };

  if (isLoading) {
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
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
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
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          {/* 只重抓本頁資料，不整頁 reload（reload 會重開整個 SPA：
              重解析 session、清光快取、白畫面閃爍） */}
          <Button onClick={clearAndRefetch}>重新載入</Button>
        </div>
      </div>
    );
  }

  if (showWithdrawalProcess) {
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
            <h1 className="text-3xl font-bold">獎勵回饋</h1>
            <p className="text-muted-foreground">Point提領申請流程</p>
          </div>
        </div>
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
          <h1 className="text-3xl font-bold">獎勵回饋</h1>
          <p className="text-muted-foreground">管理您的Point和提領申請</p>
        </div>
      </div>

      <RewardStats
        availableRewards={rewardsData?.availableRewards || 0}
        pendingRewards={rewardsData?.pendingRewards || 0}
        withdrawnRewards={rewardsData?.withdrawnRewards || 0}
        totalRewards={rewardsData?.totalEarned || 0}
      />

      {/* 只在 rejected 渲染的警示卡——出事的警示不該沉底;平常回 null,不佔版面。 */}
      <IdVerificationSection loadStatus={loadIdStatus} uploadPhotos={uploadIdPhotos} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RewardHistory refreshTrigger={historyRefreshTrigger} />
        <WithdrawalSection
          availableRewards={rewardsData?.availableRewards || 0}
          pendingRewards={rewardsData?.pendingRewards || 0}
          withdrawnRewards={rewardsData?.withdrawnRewards || 0}
          hasWithdrawnToday={rewardsData?.hasWithdrawnToday || false}
          withdrawals={withdrawals}
          onStartWithdrawal={handleStartWithdrawal}
          onRefresh={refetch}
          subscriptionStatus={subscriptionStatus}
          referralProgramJoined={user?.referralProgramJoined}
        />
      </div>
    </div>
  );
}
