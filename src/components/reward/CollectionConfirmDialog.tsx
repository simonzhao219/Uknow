import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { AlertTriangle } from 'lucide-react';
import { formatTimestamp } from '../../utils/referralFormatter';

interface CollectionConfirmDialogProps {
  withdrawal: {
    id: string;
    amount: number;
    requestedAt: string;
    processedAt: string;
  };
  onNext: () => void;
  onCancel: () => void;
}

/**
 * 查收確認對話框 - 第一步
 * 顯示警告訊息和聯絡客服資訊
 */
export function CollectionConfirmDialog({ withdrawal, onNext, onCancel }: CollectionConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="h-5 w-5" />
            確認查收提醒 - 步驟 1/3
          </CardTitle>
          <CardDescription>
            請仔細閱讀以下重要資訊
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 警告訊息 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-yellow-800">
              ⚠️ 請務必確認已收到款項
            </p>
            <p className="text-sm text-yellow-700">
              一旦確認查收，操作不可逆轉
            </p>
          </div>

          {/* 提領資訊 */}
          <div className="bg-gray-50 border rounded-lg p-4 space-y-2">
            <h4 className="font-medium mb-2">提領資訊</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">提領點數：</span>
                <span className="font-medium">{withdrawal.amount.toLocaleString()}P</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">申請日期：</span>
                <span>{formatTimestamp(withdrawal.requestedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">處理日期：</span>
                <span>{formatTimestamp(withdrawal.processedAt)}</span>
              </div>
            </div>
          </div>

          {/* 客服資訊 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-blue-900 mb-2">如有問題請聯絡客服</h4>
            <div className="space-y-1 text-sm text-blue-800">
              <p>📞 LINE 客服：@uknow</p>
              <p className="text-xs text-blue-600 mt-2">
                請提供以下資訊以便查詢：
              </p>
              <ul className="text-xs text-blue-600 list-disc list-inside space-y-0.5">
                <li>帳號資訊</li>
                <li>申請日期：{formatTimestamp(withdrawal.requestedAt)}</li>
                <li>申請點數：{withdrawal.amount.toLocaleString()}P</li>
                <li>處理日期：{formatTimestamp(withdrawal.processedAt)}</li>
              </ul>
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
              className="flex-1"
            >
              下一步
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}