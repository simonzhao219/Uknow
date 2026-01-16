import React from 'react';
import { ThreeStepConfig } from '../ThreeStepDialog';
import { AlertTriangle, ArrowRight, CheckCircle, DollarSign } from 'lucide-react';

interface WithdrawalApplication {
  id: string;
  amount: number;
  actualAmount: number;
  fee: number;
  appliedAt: string;
  status: 'processing' | 'awaiting_confirmation' | 'completed';
}

/**
 * ✅ 提領查收確認的配置
 * 
 * 使用範例：
 * ```tsx
 * const config = createWithdrawalCollectionConfig(withdrawal);
 * 
 * <ThreeStepDialog
 *   isOpen={showDialog}
 *   config={config}
 *   onClose={handleClose}
 *   onConfirm={handleConfirm}
 * />
 * ```
 */
export function createWithdrawalCollectionConfig(withdrawal: WithdrawalApplication): ThreeStepConfig {
  return {
    title: '確認收到提領款項',
    
    // ===== 步驟1：確認查收 =====
    step1: {
      title: '💰 確認查收提領款項',
      description: '請確認您已收到以下款項',
      content: (
        <div className=\"space-y-4\">
          {/* 提領資訊 */}
          <div className=\"p-4 bg-green-50 border border-green-200 rounded-lg space-y-2\">
            <div className=\"flex items-center justify-between\">
              <span className=\"text-sm text-muted-foreground\">申請金額</span>
              <span className=\"font-medium\">${withdrawal.amount}</span>
            </div>
            <div className=\"flex items-center justify-between\">
              <span className=\"text-sm text-muted-foreground\">手續費</span>
              <span className=\"text-red-600\">-${withdrawal.fee}</span>
            </div>
            <div className=\"h-px bg-green-200 my-2\"></div>
            <div className=\"flex items-center justify-between\">
              <span className=\"text-sm font-medium\">實收金額</span>
              <span className=\"text-2xl font-bold text-green-600\">${withdrawal.actualAmount}</span>
            </div>
            <div className=\"flex items-center justify-between\">
              <span className=\"text-sm text-muted-foreground\">申請時間</span>
              <span className=\"text-sm\">
                {new Date(withdrawal.appliedAt).toLocaleDateString('zh-TW', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit'
                })}
              </span>
            </div>
          </div>

          {/* 重要提醒 */}
          <div className=\"bg-orange-50 border border-orange-200 rounded-lg p-4\">
            <div className=\"flex items-start gap-2\">
              <AlertTriangle className=\"h-4 w-4 text-orange-600 mt-0.5 shrink-0\" />
              <div className=\"flex-1\">
                <p className=\"font-medium mb-2 text-orange-900\">⚠️ 查收前請確認：</p>
                <ul className=\"space-y-1 text-sm text-orange-800\">
                  <li>• 確認已收到 <strong>${withdrawal.actualAmount}</strong> 的匯款</li>
                  <li>• 確認金額無誤後再點擊「確認查收」</li>
                  <li>• 查收後此申請將標記為已完成</li>
                  <li>• 如有問題請立即聯繫客服</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 客服資訊 */}
          <div className=\"bg-blue-50 border border-blue-200 rounded-lg p-3\">
            <p className=\"text-sm text-blue-900\">
              <strong>客服聯繫方式：</strong>
            </p>
            <p className=\"text-sm text-blue-800 mt-1\">
              📞 電話：0800-123-456<br />
              💬 LINE：@uknow
            </p>
          </div>
        </div>
      ),
      nextButtonText: '已收到款項，繼續'
    },
    
    // ===== 步驟2：預覽點數變化 =====
    step2: {
      title: '📊 查收後點數變化預覽',
      description: '確認以下資訊無誤後，請繼續下一步驗證身分',
      apiEndpoint: '/rewards/points-preview',
      content: (previewData) => {
        if (!previewData) {
          return (
            <div className=\"text-center py-8 text-muted-foreground\">
              載入預覽數據中...
            </div>
          );
        }

        return (
          <div className=\"space-y-4\">
            {/* 說明 */}
            <div className=\"bg-blue-50 border border-blue-200 rounded-lg p-3\">
              <p className=\"text-sm text-blue-800\">
                查收確認後，此筆提領申請的點數將從「凍結點數」移轉至「提領歷史」
              </p>
            </div>

            {/* 可提領點數（無變化）*/}
            <div className=\"p-4 bg-gray-50 border-2 border-gray-200 rounded-lg space-y-3\">
              <p className=\"font-medium text-gray-900\">可提領點數</p>
              <div className=\"grid grid-cols-2 gap-4\">
                <div>
                  <p className=\"text-sm text-muted-foreground mb-1\">查收前</p>
                  <p className=\"text-2xl font-bold\">{previewData.currentAvailable || 0} P</p>
                </div>
                <div>
                  <p className=\"text-sm text-muted-foreground mb-1\">查收後</p>
                  <p className=\"text-2xl font-bold text-gray-600\">
                    {previewData.currentAvailable || 0} P
                  </p>
                </div>
              </div>
              <p className=\"text-sm text-muted-foreground\">
                ⚠️ 可提領點數不受影響
              </p>
            </div>

            {/* 凍結點數（減少）*/}
            <div className=\"p-4 bg-orange-50 border-2 border-orange-200 rounded-lg space-y-3\">
              <p className=\"font-medium text-orange-900\">凍結點數</p>
              <div className=\"grid grid-cols-2 gap-4\">
                <div>
                  <p className=\"text-sm text-muted-foreground mb-1\">查收前</p>
                  <p className=\"text-2xl font-bold\">{previewData.frozen || withdrawal.amount} P</p>
                </div>
                <div>
                  <p className=\"text-sm text-muted-foreground mb-1\">查收後</p>
                  <p className=\"text-2xl font-bold text-green-600\">
                    {(previewData.frozen || withdrawal.amount) - withdrawal.amount} P
                  </p>
                </div>
              </div>
              <div className=\"flex items-center gap-2 text-green-600\">
                <ArrowRight className=\"h-4 w-4\" />
                <span className=\"font-medium\">
                  減少 -{withdrawal.amount} P ↓（款項已收）
                </span>
              </div>
            </div>

            {/* 確認提示 */}
            <div className=\"bg-green-50 border border-green-200 rounded-lg p-3\">
              <div className=\"flex items-center gap-2\">
                <CheckCircle className=\"h-4 w-4 text-green-600\" />
                <p className=\"text-sm text-green-900\">
                  ✅ 確認後此筆提領申請將標記為已完成
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
      warningMessage: `點擊「確認查收」後，此筆 $${withdrawal.actualAmount} 的提領申請將標記為已完成。請確認已收到款項後再繼續。`,
      confirmButtonText: '確認查收'
    }
  };
}
