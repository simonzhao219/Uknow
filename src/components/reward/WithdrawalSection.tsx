import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { StatusCallout } from '../ui/status-callout';
import { CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Eye } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { CollectionConfirmDialog } from './CollectionConfirmDialog';
import { CollectionPreviewDialog } from './CollectionPreviewDialog';
import { CollectionVerifyDialog } from './CollectionVerifyDialog';
import { apiRequestJson, buildApiUrl, ApiError } from '../../utils/apiClient';
import { formatTimestamp } from '../../utils/referralFormatter';
// 型別走契約，不在元件裡手抄一份（plan §2.4）：抄本不會跟著契約長欄位，
// 而多出來的欄位對元件只是「沒讀」，tsc 不會叫——那正是契約要防的靜默漂移。
import type { WithdrawalRecord } from '@contract';

interface WithdrawalSectionProps {
  pendingRewards: number;
  withdrawnRewards: number;
  withdrawals: WithdrawalRecord[];
  onRefresh: () => void;
  subscriptionStatus?: string | null; // 會籍失效時「確認收款」讓位給橫幅的續訂
}

type CollectionStep = null | 'confirm' | 'preview' | 'verify';

export function WithdrawalSection({
  pendingRewards,
  withdrawnRewards,
  withdrawals,
  onRefresh,
  subscriptionStatus,
}: WithdrawalSectionProps) {
  const { showSuccess, showError } = useNotification();

  // ✅ 查收流程狀態
  const [collectionStep, setCollectionStep] = useState<CollectionStep>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRecord | null>(null);

  // 申請提領鈕與它的停用原因在獎勵頁的「可提領」主區（WithdrawalAction）；這裡只剩提領申請。
  const isSubscriptionInvalid = subscriptionStatus === 'expired';

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-warning-subtle-foreground" />;
      case 'awaiting_collection':
        return <Eye className="h-4 w-4 text-muted-foreground" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success-subtle-foreground" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive-subtle-foreground" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">處理中</Badge>;
      case 'awaiting_collection':
        // 與後台 WithdrawalStatusBadge 同色（warning）：同一狀態、同一注意力層級
        return <Badge variant="warning">待查收</Badge>;
      case 'completed':
        return <Badge variant="success-subtle">已完成</Badge>;
      case 'rejected':
        return <Badge variant="destructive">已拒絕</Badge>;
      default:
        return <Badge variant="outline">未知狀態</Badge>;
    }
  };

  // ✅ 點擊「查收」按鈕
  const handleClickCollection = (withdrawal: WithdrawalRecord) => {
    setSelectedWithdrawal(withdrawal);
    setCollectionStep('confirm');
  };

  // ✅ 第一步：確認提示 → 下一步
  const handleConfirmNext = () => {
    setCollectionStep('preview');
  };

  // ✅ 第二步：預覽 → 返回第一步
  const handlePreviewBack = () => {
    setCollectionStep('confirm');
  };

  // ✅ 第二步：預覽確認 → 下一步
  const handlePreviewNext = () => {
    setCollectionStep('verify');
  };

  // ✅ 第三步：驗證 → 返回第二步
  const handleVerifyBack = () => {
    setCollectionStep('preview');
  };

  // ✅ 第三步：身分證驗證 → 確認查收
  const handleVerifyConfirm = async (idNumber: string) => {
    if (!selectedWithdrawal) return;

    try {
      const result = await apiRequestJson<{ success: boolean }>(
        buildApiUrl(`/rewards/withdrawals/${selectedWithdrawal.id}/confirm`),
        {
          method: 'POST',
          body: JSON.stringify({ idNumber }),
        },
      );

      if (result.success) {
        showSuccess('收款確認成功！', '獎勵明細已更新');
        setCollectionStep(null);
        setSelectedWithdrawal(null);

        // ✅ 刷新數據
        onRefresh();
      } else {
        throw new Error('收款確認失敗');
      }
    } catch (err) {
      console.error('確認查收錯誤:', err);

      if (err instanceof ApiError) {
        showError('收款確認失敗', err.message);
      } else {
        showError('收款確認失敗', err instanceof Error ? err.message : '請稍後再試');
      }

      throw err; // 拋出錯誤讓 Dialog 保持打開並顯示錯誤
    }
  };

  // ✅ 取消查收流程
  const handleCancelCollection = () => {
    setCollectionStep(null);
    setSelectedWithdrawal(null);
  };

  // 已完成的保留最近幾筆（B7 裁決 (a)）：全部濾掉的話，「管理員代為結案」的
  // 揭露到不了任何會員面前，而且會員查不到自己的提領何時結束——客服情境
  // 「我提領怎麼還沒到」在他自己這一側就沒有答案。只留最近幾筆是資訊密度的
  // 取捨：這裡是申請入口不是歷史帳本。
  const RECENT_COMPLETED = 5;
  const completed = withdrawals
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, RECENT_COMPLETED);
  const activeWithdrawals = [...withdrawals.filter((w) => w.status !== 'completed'), ...completed];
  // 引導鈕一頁一顆（ui-ux-guidelines §12.11，業主裁決 E2）：待查收可能累積好幾筆（每日可
  // 申請一筆），只有最早申請的那筆用引導鈕，其餘次要外框——先處理等最久的那筆。會籍失效時
  // 獎勵頁橫幅的續訂優先（續訂＞加入推薦計畫＞確認收款），確認收款全部讓位成次要。
  // 時間用 Date.parse 比：同一時點可能寫成 Z 或 +00:00，字串字典序不可靠；平手取先出現的。
  const guideCollectionId = isSubscriptionInvalid
    ? undefined
    : withdrawals
        .filter((w) => w.status === 'awaiting_collection')
        .reduce<WithdrawalRecord | null>(
          (earliest, w) =>
            earliest === null || Date.parse(w.requestedAt) < Date.parse(earliest.requestedAt)
              ? w
              : earliest,
          null,
        )?.id;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
            提領申請
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 申請記錄：未完成的在前（待查收、處理中），已完成只留最近幾筆 */}
          <div>
            {activeWithdrawals.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">尚未有進行中的提領申請</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeWithdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(withdrawal.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{withdrawal.amount.toLocaleString()}P</p>
                          {getStatusBadge(withdrawal.status)}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>申請日期：{formatTimestamp(withdrawal.requestedAt)}</p>
                          {withdrawal.processedAt && (
                            <p>處理日期：{formatTimestamp(withdrawal.processedAt)}</p>
                          )}
                        </div>
                        {/* 退件理由是這條審核鏈的終點：看不到理由的人只會重送
                            一模一樣的東西再被退一次。只在 rejected 且真的有
                            理由時渲染——空的「退件原因：」看起來像系統把理由
                            弄丟了，比不顯示更糟。 */}
                        {/* 誠實揭露（規格書 §10.3）：代為結案不能長得像本人查收。 */}
                        {withdrawal.status === 'completed' && withdrawal.completedByAdmin && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            管理員代為結案（逾期未查收由平台確認入帳）
                          </p>
                        )}
                        {withdrawal.status === 'rejected' && withdrawal.note && (
                          <StatusCallout
                            variant="destructive"
                            className="mt-2 rounded-md p-2 text-sm"
                            title="退件原因"
                            description={withdrawal.note}
                          />
                        )}
                      </div>
                    </div>

                    <div className="text-right flex flex-col gap-2">
                      {withdrawal.status === 'awaiting_collection' && (
                        <Button
                          size="sm"
                          tone={withdrawal.id === guideCollectionId ? 'guide' : 'secondary'}
                          onClick={() => handleClickCollection(withdrawal)}
                          className="text-xs"
                        >
                          確認收款
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 查收確認流程 - 第一步 */}
      {collectionStep === 'confirm' && selectedWithdrawal && (
        <CollectionConfirmDialog
          withdrawal={selectedWithdrawal}
          onNext={handleConfirmNext}
          onCancel={handleCancelCollection}
        />
      )}

      {/* 查收預覽流程 - 第二步 */}
      {collectionStep === 'preview' && selectedWithdrawal && (
        <CollectionPreviewDialog
          withdrawal={selectedWithdrawal}
          pendingRewards={pendingRewards}
          withdrawnRewards={withdrawnRewards}
          onBack={handlePreviewBack}
          onNext={handlePreviewNext}
          onCancel={handleCancelCollection}
        />
      )}

      {/* 查收驗證流程 - 第三步 */}
      {collectionStep === 'verify' && (
        <CollectionVerifyDialog
          onBack={handleVerifyBack}
          onConfirm={handleVerifyConfirm}
          onCancel={handleCancelCollection}
        />
      )}
    </>
  );
}
