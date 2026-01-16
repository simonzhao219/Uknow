import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { XCircle, ArrowRight, Calendar, AlertTriangle, ArrowLeft } from 'lucide-react';

interface PreviewData {
  currentStatus: string;
  currentPeriodEnd: string;
  afterCancelStatus: string;
  afterCancelNextPeriod: string | null;
}

interface CancelPreviewDialogProps {
  previewData: PreviewData;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

/**
 * 取消訂閱預覽對話框 - 步驟 2/3
 * 顯示取消後的狀態變化預覽
 */
export function CancelPreviewDialog({ 
  previewData, 
  onNext, 
  onBack,
  onCancel 
}: CancelPreviewDialogProps) {
  // 格式化日期顯示
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '/');
  };

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            預覽下個週期的變化 - 步驟 2/3
          </CardTitle>
          <CardDescription>
            查看取消訂閱後的帳戶狀態變化
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      {getStatusDisplayName(previewData.currentStatus)}
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-red-600 shrink-0" />
                  <div className="flex-1 bg-white p-3 rounded border border-red-200">
                    <div className="text-xs text-muted-foreground mb-1">取消後</div>
                    <div className="text-lg font-bold text-gray-600">
                      {previewData.afterCancelStatus}
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
                      {formatDate(previewData.currentPeriodEnd)}
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
                  <li>取消後，您的刊登將在 <strong>{formatDate(previewData.currentPeriodEnd)}</strong> 到期</li>
                  <li>到期後，刊登將自動失效，無法被用戶搜尋到</li>
                  <li>已累積的點數將無法提領</li>
                  <li>取消操作<strong>無法撤銷</strong>，請謹慎考慮</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 按鈕 */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              上一步
            </Button>
            <Button
              onClick={onNext}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              確認並繼續
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
