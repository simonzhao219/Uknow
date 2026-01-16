import React from 'react';
import { ThreeStepDialog } from '../common/ThreeStepDialog';
import { createWithdrawalCollectionConfig } from '../common/verification-configs/withdrawalCollectionConfig';

interface WithdrawalApplication {
  id: string;
  amount: number;
  actualAmount: number;
  fee: number;
  appliedAt: string;
  status: 'processing' | 'awaiting_confirmation' | 'completed';
}

interface WithdrawalCollectionDialogProps {
  withdrawal: WithdrawalApplication;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (withdrawalId: string, idNumber: string) => Promise<void>;
}

/**
 * ✅ 提領查收確認 Dialog（重構版）
 * 
 * 使用通用的 ThreeStepDialog 組件
 * 通過配置對象自定義每個步驟的內容
 * 
 * 流程：
 * 1. 第一步：確認收到款項（顯示金額、手續費、實收金額）
 * 2. 第二步：預覽點數變化（凍結點數減少）
 * 3. 第三步：身分證驗證
 */
export function WithdrawalCollectionDialog({
  withdrawal,
  isOpen,
  onClose,
  onConfirm
}: WithdrawalCollectionDialogProps) {
  // ✅ 創建配置
  const config = createWithdrawalCollectionConfig(withdrawal);

  // ✅ 最終確認（調用父組件的 onConfirm）
  const handleConfirm = async (idNumber: string) => {
    await onConfirm(withdrawal.id, idNumber);
  };

  return (
    <ThreeStepDialog
      isOpen={isOpen}
      config={config}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}
