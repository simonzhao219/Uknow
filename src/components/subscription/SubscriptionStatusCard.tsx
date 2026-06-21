import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CreditCard, AlertTriangle, Loader2 } from 'lucide-react';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';
import type { SubscriptionData } from '../../hooks/useSubscription';

interface Props {
  subscriptionData: SubscriptionData | null;
  isLoading: boolean;
  isProcessing: boolean;
  onConfirmCancel: (idNumber: string) => Promise<void>;
  onResume: () => Promise<void>;
  onMakeup: () => Promise<void>;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:    { label: '訂閱中', color: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  grace:     { label: '寬限期', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  expired:   { label: '已失效', color: 'bg-red-100 text-red-800 border-red-300' },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '/');
}

function calculateGraceDaysLeft(graceStartedAt: string) {
  const daysPassed = Math.floor(
    (Date.now() - new Date(graceStartedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, 60 - daysPassed);
}

export function SubscriptionStatusCard({ subscriptionData, isLoading, isProcessing, onConfirmCancel, onResume, onMakeup }: Props) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const statusInfo = STATUS_MAP[subscriptionData?.status ?? 'cancelled'] ?? STATUS_MAP.cancelled;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-3">
            <CreditCard className="h-5 w-5" />
            <span>我的訂閱</span>
            {subscriptionData?.hasSubscription && (
              <Badge variant="outline" className={`${statusInfo.color} border`}>
                {statusInfo.label}
              </Badge>
            )}
          </CardTitle>

          {!isLoading && subscriptionData?.hasSubscription && (
            <>
              {subscriptionData.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={isProcessing}
                >
                  取消訂閱
                </Button>
              )}
              {subscriptionData.status === 'cancelled' && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={onResume}
                  loading={isProcessing}
                >
                  {isProcessing ? '處理中...' : '恢復訂閱'}
                </Button>
              )}
              {subscriptionData.status === 'grace' && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700"
                  onClick={onMakeup}
                  loading={isProcessing}
                >
                  {isProcessing ? '處理中...' : '立即補繳'}
                </Button>
              )}
              {subscriptionData.status === 'expired' && (
                <Button variant="default" size="sm" asChild>
                  <Link to="/payment/checkout">開始新訂閱</Link>
                </Button>
              )}
            </>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">載入訂閱資訊中...</span>
            </div>
          ) : !subscriptionData?.hasSubscription ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">您尚未訂閱任何服務</p>
              <Button variant="default" asChild>
                <Link to="/payment/checkout">開始訂閱</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptionData.status === 'grace' && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900">扣款失敗，訂閱即將失效</p>
                      {subscriptionData.lastPaymentFailureReason && (
                        <p className="text-sm text-yellow-800 mt-1">
                          上次扣款失敗原因：{subscriptionData.lastPaymentFailureReason}
                        </p>
                      )}
                      {subscriptionData.graceStartedAt && (
                        <p className="text-sm text-yellow-800">
                          請在 {calculateGraceDaysLeft(subscriptionData.graceStartedAt)} 天內完成補繳，否則訂閱將永久失效。
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(subscriptionData.status === 'active' || subscriptionData.status === 'grace') &&
                subscriptionData.nextPaymentDate && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">扣款日期：</span>
                    <span className="font-medium">{formatDate(subscriptionData.nextPaymentDate)}</span>
                  </div>
                )}

              {subscriptionData.currentPeriodStart && subscriptionData.currentPeriodEnd && (
                <div className="text-sm">
                  <span className="text-muted-foreground">訂閱週期：</span>
                  <span className="font-medium">
                    {formatDate(subscriptionData.currentPeriodStart)} ~ {formatDate(subscriptionData.currentPeriodEnd)}
                  </span>
                </div>
              )}

              {(subscriptionData.status === 'active' || subscriptionData.status === 'grace') &&
                subscriptionData.nextPeriodStart && subscriptionData.nextPeriodEnd && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">下個週期：</span>
                    <span className="font-medium">
                      {formatDate(subscriptionData.nextPeriodStart)} ~ {formatDate(subscriptionData.nextPeriodEnd)}
                    </span>
                  </div>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {showCancelDialog && subscriptionData?.hasSubscription && (
        <CancelSubscriptionDialog
          subscription={{
            status: subscriptionData.status!,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            autoRenew: subscriptionData.autoRenew || false,
          }}
          isOpen={showCancelDialog}
          onClose={() => setShowCancelDialog(false)}
          onConfirm={onConfirmCancel}
        />
      )}
    </>
  );
}
