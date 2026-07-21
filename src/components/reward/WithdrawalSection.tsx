import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Eye } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { CollectionConfirmDialog } from './CollectionConfirmDialog';
import { CollectionPreviewDialog } from './CollectionPreviewDialog';
import { CollectionVerifyDialog } from './CollectionVerifyDialog';
import { apiRequestJson, buildApiUrl, ApiError } from '../../utils/apiClient';
import { formatTimestamp } from '../../utils/referralFormatter';
import {
  MIN_WITHDRAWAL,
  WITHDRAWAL_FEE,
  MIN_REQUIRED_BALANCE,
} from '../../utils/withdrawalValidation';

interface WithdrawalRecord {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
}

interface WithdrawalSectionProps {
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
  hasWithdrawnToday: boolean;
  withdrawals: WithdrawalRecord[];
  onStartWithdrawal: () => void;
  onRefresh: () => void;
  subscriptionStatus?: string | null;  // ✅ 新增：訂閱狀態
  referralProgramJoined?: boolean;     // ✅ 新增：是否加入推薦計畫
}

type CollectionStep = null | 'confirm' | 'preview' | 'verify';

export function WithdrawalSection({ 
  availableRewards,
  pendingRewards,
  withdrawnRewards,
  hasWithdrawnToday, 
  withdrawals,
  onStartWithdrawal,
  onRefresh,
  subscriptionStatus,
  referralProgramJoined  // ✅ 新增
}: WithdrawalSectionProps) {
  const { showToast, showSuccess, showError } = useNotification();
  
  // ✅ 查收流程狀態
  const [collectionStep, setCollectionStep] = useState<CollectionStep>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRecord | null>(null);
  
  // ✅ 提領規則（收斂於 utils/withdrawalValidation，避免與 WithdrawalProcess 漂移）
  const MIN_REQUIRED = MIN_REQUIRED_BALANCE; // 1015P

  // ✅ 判斷是否可以提領
  const isInsufficientBalance = availableRewards < MIN_REQUIRED;
  const hasReachedDailyLimit = hasWithdrawnToday;
  const isSubscriptionInvalid = subscriptionStatus === 'expired';
  const hasNotJoinedReferral = !referralProgramJoined;  // ✅ 新增：未加入推薦計畫
  
  const canWithdraw = !isInsufficientBalance 
    && !hasReachedDailyLimit 
    && !isSubscriptionInvalid
    && !hasNotJoinedReferral;  // ✅ 新增條件
  
  // ✅ 生成提示訊息
  const getDisabledReason = () => {
    // ✅ 最優先檢查是否加入推薦計畫
    if (hasNotJoinedReferral) {
      return '尚未加入推薦計畫，無法申請提領';
    }
    
    // ✅ 檢查訂閱狀態
    if (isSubscriptionInvalid) {
      return '訂閱已失效，無法申請提領。請重新訂閱以恢復服務。';
    }
    
    if (isInsufficientBalance) {
      return `可提領Point不足${MIN_REQUIRED.toLocaleString()}P（最低提領${MIN_WITHDRAWAL.toLocaleString()}P + 手續費${WITHDRAWAL_FEE}P）`;
    }
    if (hasReachedDailyLimit) {
      return '今日已提領過一次，請明天再試';
    }
    return '';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'awaiting_collection':
        return <Eye className="h-4 w-4 text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">處理中</Badge>;
      case 'awaiting_collection':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">待查收</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">已完成</Badge>;
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
          body: JSON.stringify({ idNumber })
        }
      );

      if (result.success) {
        showSuccess('查收確認成功！', '獎勵明細已更新');
        setCollectionStep(null);
        setSelectedWithdrawal(null);
        
        // ✅ 刷新數據
        onRefresh();
      } else {
        throw new Error('確認查收失敗');
      }
    } catch (err) {
      console.error('確認查收錯誤:', err);
      
      if (err instanceof ApiError) {
        showError('確認查收失敗', err.message);
      } else {
        showError('確認查收失敗', err instanceof Error ? err.message : '請稍後再試');
      }
      
      throw err; // 拋出錯誤讓 Dialog 保持打開並顯示錯誤
    }
  };

  // ✅ 取消查收流程
  const handleCancelCollection = () => {
    setCollectionStep(null);
    setSelectedWithdrawal(null);
  };

  // ✅ 過濾掉已完成的提領記錄（用戶看不到）
  const activeWithdrawals = withdrawals.filter(w => w.status !== 'completed');

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Point提領與申請記錄
          </CardTitle>
          <CardDescription>
            管理您的Point提領申請
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 提領按鈕區域 */}
          <div className="border-b pb-4">
            <Button 
              onClick={onStartWithdrawal}
              className="w-full"
              size="lg"
              disabled={!canWithdraw}
            >
              申請Point提領
            </Button>
            
            {!canWithdraw && (
              <p className="text-sm text-muted-foreground mt-2 text-center">
                {getDisabledReason()}
              </p>
            )}
          </div>

          {/* 申請記錄 */}
          <div>
            <h3 className="font-medium mb-4">申請記錄</h3>
            
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
                      </div>
                    </div>
                    
                    <div className="text-right flex flex-col gap-2">
                      {withdrawal.status === 'awaiting_collection' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleClickCollection(withdrawal)}
                          className="text-xs"
                        >
                          查收
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