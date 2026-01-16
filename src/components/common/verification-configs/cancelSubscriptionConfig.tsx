import React from 'react';
import { ThreeStepConfig } from '../ThreeStepDialog';
import { AlertTriangle, TrendingDown, ArrowRight, XCircle } from 'lucide-react';

interface SubscriptionData {
  status: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
}

/**
 * ✅ 取消訂閱的配置
 * 
 * 使用範例：
 * ```tsx
 * const config = createCancelSubscriptionConfig(subscription);
 * 
 * <ThreeStepDialog
 *   isOpen={showDialog}
 *   config={config}
 *   onClose={handleClose}
 *   onConfirm={handleConfirm}
 * />
 * ```
 */
export function createCancelSubscriptionConfig(subscription: SubscriptionData): ThreeStepConfig {
  // 格式化日期顯示
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '/');
  };

  return {
    title: '取消訂閱',
    
    // ===== 步驟1：警告取消影響 =====
    step1: {
      title: '⚠️ 確認取消訂閱',
      description: '請仔細閱讀以下重要資訊',
      content: (
        <div className="space-y-4">
          {/* 警告訊息 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-red-800">
              ⚠️ 確定要取消訂閱嗎？
            </p>
            <p className="text-sm text-red-700">
              取消訂閱後，您的刊登將在到期日後自動失效。請仔細考慮以下影響：
            </p>
          </div>

          {/* 取消訂閱的影響 */}
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <h4 className="font-medium">取消訂閱的影響</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <span>刊登將在到期日後自動失效</span>
              </li>
              <li className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <span>已累積的點數將<strong className="text-foreground">無法提領</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <span>推薦獎勵將立即停止</span>
              </li>
              <li className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <span>任務進度將被重置</span>
              </li>
            </ul>
          </div>

          {/* 替代方案 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-blue-900">替代方案</h4>
            <p className="text-sm text-blue-800">
              如果您只是暫時不需要服務，可以考慮：
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-blue-800">
              <li>等待當前週期到期後不續訂</li>
              <li>聯繫客服了解其他方案</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-sm text-blue-800">📞 LINE 客服：@uknow</p>
            </div>
          </div>
        </div>
      ),
      nextButtonText: '下一步'
    },
    
    // ===== 步驟2：預覽狀態變化 =====
    step2: {
      title: '📊 預覽下個週期的變化',
      description: '查看取消訂閱後的帳戶狀態變化',
      apiEndpoint: '/subscriptions/preview-cancel',
      content: (previewData) => {
        if (!previewData) {
          return (
            <div className="text-center py-8 text-muted-foreground">
              載入預覽數據中...
            </div>
          );
        }

        // 狀態顯示名稱映射
        const getStatusDisplayName = (status: string) => {
          const statusMap: Record<string, string> = {
            'active': '訂閱中',
            'cancelled': '已取消',
            'grace': '即將失效',
            'expired': '已失效'
          };
          return statusMap[status] || status;
        };

        return (
          <div className="space-y-4">
            {/* 說明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                以下是取消訂閱後，您的帳戶狀態在下個週期的變化：
              </p>
            </div>

            {/* 訂閱狀態變化 */}
            <div className="border-2 border-red-200 bg-red-50 p-4 rounded-lg space-y-4">
              <h3 className="font-medium text-red-900 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                訂閱狀態變化
              </h3>
              
              <div className="space-y-4">
                {/* 狀態變化 */}
                <div>
                  <div className="text-sm text-red-800 font-medium mb-2">訂閱狀態</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white p-3 rounded border border-red-200">
                      <div className="text-xs text-muted-foreground mb-1">當前</div>
                      <div className="text-lg font-bold text-green-600">
                        {getStatusDisplayName(previewData.currentStatus || subscription.status)}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-red-600 shrink-0" />
                    <div className="flex-1 bg-white p-3 rounded border border-red-200">
                      <div className="text-xs text-muted-foreground mb-1">取消後</div>
                      <div className="text-lg font-bold text-gray-600">
                        {previewData.afterCancelStatus || '已取消'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 下個週期變化 */}
                <div>
                  <div className="text-sm text-red-800 font-medium mb-2">下個週期</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white p-3 rounded border border-red-200">
                      <div className="text-xs text-muted-foreground mb-1">當前到期日</div>
                      <div className="text-lg font-bold text-blue-600">
                        {formatDate(previewData.currentPeriodEnd || subscription.currentPeriodEnd)}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-red-600 shrink-0" />
                    <div className="flex-1 bg-white p-3 rounded border border-red-200">
                      <div className="text-xs text-muted-foreground mb-1">取消後</div>
                      <div className="text-lg font-bold text-red-600">
                        {previewData.afterCancelNextPeriod || '不會續訂'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 重要提醒 */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-900">重要提醒：</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-orange-800">
                    <li>取消後，您的刊登將在 <strong>{formatDate(previewData.currentPeriodEnd || subscription.currentPeriodEnd)}</strong> 到期</li>
                    <li>到期後，刊登將自動失效，無法被用戶搜尋到</li>
                    <li>已累積的點數將無法提領</li>
                    <li>取消操作<strong>無法撤銷</strong>，請謹慎考慮</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      },
      nextButtonText: '確認並繼續'
    },
    
    // ===== 步驟3：身分證驗證 =====
    step3: {
      title: '🔐 身分驗證',
      description: '請輸入您註冊時使用的身分證字號',
      warningMessage: '點擊「確認取消訂閱」後，您的訂閱將立即被標記為已取消。此操作無法撤銷。',
      confirmButtonText: '確認取消訂閱'
    }
  };
}
