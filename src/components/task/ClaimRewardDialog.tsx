import React from 'react';
import { ThreeStepDialog } from '../common/ThreeStepDialog';
import { createClaimRewardConfig } from '../common/verification-configs/claimRewardConfig';

/**
 * 待領取任務獎勵
 * 
 * ✅ 移除 previewData 字段
 * - 不再使用任務達成時緩存的舊數據
 * - 改為在對話框第二步實時調用 GET /rewards/points-preview 獲取最新 SSOT 數據
 */
interface PendingMissionReward {
  id: string;
  type: 'consecutive_referral' | 'monthly_king';
  rewardType?: 'free_renewal_year';
  amount: number;
  achievedAt: string;
  status: 'pending' | 'claimed' | 'expired';
  description: string;
  details: any;
}

interface ClaimRewardDialogProps {
  reward: PendingMissionReward | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rewardId: string, idNumber: string) => Promise<void>;
}

/**
 * ✅ 領取任務獎勵 Dialog（重構版）
 * 
 * 使用通用的 ThreeStepDialog 組件
 * 通過配置對象自定義每個步驟的內容
 * 
 * 流程：
 * 1. 第一步：通知領取後不可逆 + 問題聯繫客服
 * 2. 第二步：預覽點數變化（總累積、可提領）- ✅ 實時從 SSOT 獲取最新數據
 * 3. 第三步：輸入身分證驗證身分
 */
export function ClaimRewardDialog({
  reward,
  isOpen,
  onClose,
  onConfirm
}: ClaimRewardDialogProps) {
  if (!reward) return null;

  // ✅ 創建配置
  const config = createClaimRewardConfig(reward);

  // ✅ 最終確認（調用父組件的 onConfirm）
  const handleConfirm = async (idNumber: string) => {
    await onConfirm(reward.id, idNumber);
  };

  // ✅ 移除 defaultPreviewData，確保總是調用 API 獲取最新的 SSOT 數據
  return (
    <ThreeStepDialog
      isOpen={isOpen}
      config={config}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}