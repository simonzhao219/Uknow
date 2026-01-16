import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { AlertTriangle, TrendingDown } from 'lucide-react';

interface CancelConfirmDialogProps {
  onNext: () => void;
  onCancel: () => void;
}

/**
 * 取消訂閱確認對話框 - 步驟 1/3
 * 顯示警告訊息和影響說明
 */
export function CancelConfirmDialog({ onNext, onCancel }: CancelConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            確認取消訂閱 - 步驟 1/3
          </CardTitle>
          <CardDescription>
            請仔細閱讀以下重要資訊
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* 按鈕 */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={onNext}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              下一步
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
