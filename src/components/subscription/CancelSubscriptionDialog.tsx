import React from 'react';
import { ThreeStepDialog } from '../common/ThreeStepDialog';
import { createCancelSubscriptionConfig } from '../common/verification-configs/cancelSubscriptionConfig';

interface SubscriptionData {
  status: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
}

interface CancelSubscriptionDialogProps {
  subscription: SubscriptionData;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (idNumber: string) => Promise<void>;
}

/**
 * ✅ 取消訂閱 Dialog（重構版）
 * 
 * 使用通用的 ThreeStepDialog 組件
 * 通過配置對象自定義每個步驟的內容
 * 
 * 流程：
 * 1. 第一步：警告取消影響（刊登失效、推薦獎勵不受影響等）
 * 2. 第二步：預覽狀態變化（訂閱中 → 已取消、自動續訂關閉）
 * 3. 第三步：身分證驗證
 */
export function CancelSubscriptionDialog({
  subscription,
  isOpen,
  onClose,
  onConfirm
}: CancelSubscriptionDialogProps) {
  // ✅ 創建配置
  const config = createCancelSubscriptionConfig(subscription);

  // ✅ 最終確認（調用父組件的 onConfirm）
  const handleConfirm = async (idNumber: string) => {
    await onConfirm(idNumber);
  };

  return (
    <ThreeStepDialog
      isOpen={isOpen}
      config={config}
      onClose={onClose}
      onConfirm={handleConfirm}
      defaultPreviewData={subscription}
    />
  );
}