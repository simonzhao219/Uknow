import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { mockWithdrawals } from '../../data/mockData';
import { Clock, CheckCircle, Eye } from 'lucide-react';

export function WithdrawalHistory() {
  const pendingWithdrawals = mockWithdrawals.filter(w => w.status === 'pending');
  const awaitingConfirmation = mockWithdrawals.filter(w => w.status === 'awaiting_confirmation');
  const completedWithdrawals = mockWithdrawals.filter(w => w.status === 'completed').slice(0, 3);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">處理中</Badge>;
      case 'awaiting_confirmation':
        return <Badge variant="default">待查收</Badge>;
      case 'completed':
        return <Badge variant="outline">已完成</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleConfirmReceipt = (withdrawalId: string) => {
    alert('已確認收到匯款！');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          提領申請記錄
        </CardTitle>
        <CardDescription>
          追蹤您的獎金提領申請狀態
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="processing" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="processing">處理中 ({pendingWithdrawals.length})</TabsTrigger>
            <TabsTrigger value="awaiting">待查收 ({awaitingConfirmation.length})</TabsTrigger>
            <TabsTrigger value="completed">已完成 ({completedWithdrawals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="processing" className="space-y-4">
            {pendingWithdrawals.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">目前沒有處理中的申請</p>
              </div>
            ) : (
              pendingWithdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">${withdrawal.amount}</p>
                    <p className="text-sm text-muted-foreground">
                      申請時間：{new Date(withdrawal.appliedAt).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  {getStatusBadge(withdrawal.status)}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="awaiting" className="space-y-4">
            {awaitingConfirmation.length === 0 ? (
              <div className="text-center py-8">
                <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">目前沒有待查收的申請</p>
              </div>
            ) : (
              awaitingConfirmation.map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">${withdrawal.amount}</p>
                    <p className="text-sm text-muted-foreground">
                      申請時間：{new Date(withdrawal.appliedAt).toLocaleDateString('zh-TW')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      實收金額：${withdrawal.actualAmount}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => handleConfirmReceipt(withdrawal.id)}>
                    查收
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedWithdrawals.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">目前沒有已完成的申請</p>
              </div>
            ) : (
              completedWithdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">${withdrawal.amount}</p>
                    <p className="text-sm text-muted-foreground">
                      完成時間：{withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleDateString('zh-TW') : '處理中'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      實收金額：${withdrawal.actualAmount}
                    </p>
                  </div>
                  {getStatusBadge(withdrawal.status)}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}