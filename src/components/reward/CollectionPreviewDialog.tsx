import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { formatTimestamp } from '../../utils/referralFormatter';

interface CollectionPreviewDialogProps {
  withdrawal: {
    id: string;
    amount: number;
    fee: number;
    requestedAt: string;
    processedAt: string;
  };
  pendingRewards: number;
  withdrawnRewards: number;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

/**
 * 查收预览对话框 - 第二步
 * 显示统计数据变化预览
 */
export function CollectionPreviewDialog({ 
  withdrawal, 
  pendingRewards,
  withdrawnRewards,
  onNext, 
  onBack,
  onCancel 
}: CollectionPreviewDialogProps) {
  // ✅ 前端计算查收后的统计数据变化
  const totalDeduction = withdrawal.amount + withdrawal.fee; // 实际从处理中扣除的总额
  const afterPendingRewards = pendingRewards - totalDeduction;
  const afterWithdrawnRewards = withdrawnRewards + totalDeduction;  // ⭐ 改为总额（包含手续费）

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            預覽統計變化 - 步驟 2/3
          </CardTitle>
          <CardDescription>
            確認查收後的點數統計變化
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 提領明細 */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h4 className="font-medium mb-2">提領明細</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">提領點數：</span>
                <span className="font-medium">{withdrawal.amount.toLocaleString()}P</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">手續費：</span>
                <span className="text-muted-foreground">{withdrawal.fee.toLocaleString()}P</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-medium">
                <span>總計扣除：</span>
                <span className="text-red-600">-{totalDeduction.toLocaleString()}P</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>申請日期：</span>
                <span>{formatTimestamp(withdrawal.requestedAt)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>處理日期：</span>
                <span>{formatTimestamp(withdrawal.processedAt)}</span>
              </div>
            </div>
          </div>

          {/* 統計數據變化預覽 */}
          <div className="border-2 border-blue-200 bg-blue-50 p-4 rounded-lg space-y-3">
            <h3 className="font-medium text-blue-900 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              統計數據變化預覽
            </h3>
            
            {/* 處理中Point變化 */}
            <div className="space-y-2">
              <div className="text-sm text-blue-800 font-medium">處理中Point</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                  <div className="text-xs text-muted-foreground mb-1">當前</div>
                  <div className="text-lg font-bold text-blue-600">
                    {pendingRewards.toLocaleString()}P
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                  <div className="text-xs text-muted-foreground mb-1">查收後</div>
                  <div className="text-lg font-bold text-green-600">
                    {afterPendingRewards.toLocaleString()}P
                  </div>
                </div>
              </div>
            </div>

            {/* 已提領Point變化 */}
            <div className="space-y-2">
              <div className="text-sm text-blue-800 font-medium">已提領Point</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                  <div className="text-xs text-muted-foreground mb-1">當前</div>
                  <div className="text-lg font-bold text-blue-600">
                    {withdrawnRewards.toLocaleString()}P
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                  <div className="text-xs text-muted-foreground mb-1">查收後</div>
                  <div className="text-lg font-bold text-purple-600">
                    {afterWithdrawnRewards.toLocaleString()}P
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 重要說明 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              📌 確認查收後，點數將從「處理中」轉為「已提領」，此操作無法撤銷。
            </p>
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
              className="flex-1"
            >
              下一步
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}