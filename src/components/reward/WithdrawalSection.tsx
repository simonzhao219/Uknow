import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Eye } from 'lucide-react';
import { mockWithdrawals } from '../../data/mockData';
import { useNotification } from '../notifications/NotificationContext';

interface WithdrawalSectionProps {
  availableRewards: number;
  onStartWithdrawal: () => void;
}

export function WithdrawalSection({ availableRewards, onStartWithdrawal }: WithdrawalSectionProps) {
  const { showToast } = useNotification();
  const reservedAmount = 273; // 預留費用
  const actualAvailable = Math.max(0, availableRewards - reservedAmount);
  const maxWithdrawal = Math.floor(actualAvailable / 1000) * 1000;
  const canWithdraw = maxWithdrawal >= 1000;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'awaiting_collection':
        return <Eye className="h-4 w-4 text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">處理中</Badge>;
      case 'awaiting_collection':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">代查收</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">已完成</Badge>;
      case 'rejected':
        return <Badge variant="destructive">已拒絕</Badge>;
      default:
        return <Badge variant="outline">未知狀態</Badge>;
    }
  };

  const handleConfirmCollection = (withdrawalId: string) => {
    showToast('已確認查收匯款！', 'success');
    // 這裡可以添加實際的查收確認邏輯
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Point提領與申請記錄
        </CardTitle>
        <CardDescription>
          管理您的Point提領申請
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 提領按鈕區域 */}
        <div className="border-b pb-4">
          <Button 
            onClick={onStartWithdrawal}
            className="w-full"
            size="lg"
            disabled={!canWithdraw}
          >
            申請Point提領
          </Button>
          
          {!canWithdraw && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              可提領Point不足1000，無法申請提領
            </p>
          )}
        </div>

        {/* 申請記錄 */}
        <div>
          <h3 className="font-medium mb-4">申請記錄</h3>
          
          {mockWithdrawals.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">尚未有提領申請記錄</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mockWithdrawals.map((withdrawal) => (
                <div 
                  key={withdrawal.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(withdrawal.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">${withdrawal.amount}</p>
                        {getStatusBadge(withdrawal.status)}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>申請時間：{withdrawal.appliedAt}</p>
                        {withdrawal.processedAt && (
                          <p>處理時間：{withdrawal.processedAt}</p>
                        )}
                        {(withdrawal.status === 'completed' || withdrawal.status === 'awaiting_collection') && (
                          <p className="text-green-600">
                            實際入帳：${withdrawal.actualAmount}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      手續費 ${withdrawal.fee}
                    </p>
                    {withdrawal.status === 'pending' && (
                      <p className="text-xs text-muted-foreground">
                        預計3-5個工作天
                      </p>
                    )}
                    {withdrawal.status === 'awaiting_collection' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleConfirmCollection(withdrawal.id)}
                        className="text-xs"
                      >
                        查收
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


      </CardContent>
    </Card>
  );
}