import React from 'react';
import { ThreeStepConfig } from '../ThreeStepDialog';
import { AlertTriangle, ArrowRight, CheckCircle } from 'lucide-react';
import { formatTimestamp } from '../../../utils/referralFormatter';

interface PendingMissionReward {
  id: string;
  type: 'consecutive_referral' | 'monthly_king';
  amount: number;
  achievedAt: string;
  status: 'pending' | 'claimed' | 'expired';
  description: string;
  details: any;
}

/**
 * ✅ 任務獎勵領取的配置
 * 
 * 使用範例：
 * ```tsx
 * const config = createClaimRewardConfig(reward);
 * 
 * <ThreeStepDialog
 *   isOpen={showDialog}
 *   config={config}
 *   onClose={handleClose}
 *   onConfirm={handleConfirm}
 * />
 * ```
 */
export function createClaimRewardConfig(reward: PendingMissionReward): ThreeStepConfig {
  return {
    title: '領取任務獎勵',
    
    // ===== 步驟1：確認領取 =====
    step1: {
      title: '確認領取任務獎勵',
      description: '請仔細閱讀以下說明後再繼續',
      content: (
        <div className="space-y-4">
          {/* 獎勵資訊 */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">🏅 任務名稱</span>
              <span className="font-medium">{reward.description}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">💰 獎勵金額</span>
              <span className="font-bold text-yellow-600">{reward.amount} P</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">📅 達成時間</span>
              <span className="text-sm">{formatTimestamp(reward.achievedAt)}</span>
            </div>
          </div>

          {/* 重要提醒 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium mb-2 text-red-900">⚠️ 重要提醒：</p>
                <ul className="space-y-1 text-sm text-red-800">
                  <li>• 領取後無法撤回</li>
                  <li>• 獎勵將立即加入可提領點數</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ),
      nextButtonText: '下一步'
    },
    
    // ===== 步驟2：預覽點數變化 =====
    step2: {
      title: '📊 領取後點數變化預覽',
      description: '確認以下資訊無誤後，請繼續下一步驗證身分',
      apiEndpoint: '/rewards/points-preview',
      content: (previewData) => {
        if (!previewData) {
          return (
            <div className="text-center py-8 text-muted-foreground">
              載入預覽數據中...
            </div>
          );
        }

        // ✅ 使用後端返回的 SSOT 實際現況點數
        const currentAvailable = previewData.currentAvailable || 0;
        const currentTotal = previewData.currentTotal || 0;
        const afterAvailable = currentAvailable + reward.amount;
        const afterTotal = currentTotal + reward.amount;

        return (
          <div className="space-y-4">
            {/* 說明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                以下是領取任務獎勵後，您的點數變化：
              </p>
            </div>

            {/* 點數變化預覽 */}
            <div className="border-2 border-blue-200 bg-blue-50 p-4 rounded-lg space-y-4">
              <h3 className="font-medium text-blue-900 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                點數變化
              </h3>
              
              <div className="space-y-4">
                {/* 可提領點數變化 */}
                <div>
                  <div className="text-sm text-blue-800 font-medium mb-2">可提領點數</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                      <div className="text-xs text-muted-foreground mb-1">目前</div>
                      <div className="text-lg font-bold text-blue-600">
                        {currentAvailable.toLocaleString()} P
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                    <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                      <div className="text-xs text-muted-foreground mb-1">領取後</div>
                      <div className="text-lg font-bold text-green-600">
                        {afterAvailable.toLocaleString()} P
                      </div>
                    </div>
                  </div>
                </div>

                {/* 總累積點數變化 */}
                <div>
                  <div className="text-sm text-blue-800 font-medium mb-2">總累積點數</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                      <div className="text-xs text-muted-foreground mb-1">目前</div>
                      <div className="text-lg font-bold text-blue-600">
                        {currentTotal.toLocaleString()} P
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                    <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                      <div className="text-xs text-muted-foreground mb-1">領取後</div>
                      <div className="text-lg font-bold text-green-600">
                        {afterTotal.toLocaleString()} P
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 確認提示 */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-900">
                  ✅ 確認後將立即更新您的點數
                </p>
              </div>
            </div>
          </div>
        );
      },
      nextButtonText: '下一步'
    },
    
    // ===== 步驟3：身分證驗證 =====
    step3: {
      title: '🔐 身分驗證',
      description: '為確保帳戶安全，請輸入您的身分證字號',
      warningMessage: '點擊「確認領取」後，獎勵將立即加入您的可提領點數。此操作無法撤銷。',
      confirmButtonText: '確認領取'
    }
  };
}