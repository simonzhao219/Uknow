import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CreditCard, Loader2 } from 'lucide-react';
import type { SubscriptionData } from '../../hooks/useSubscription';
import { formatTwDate } from '../../utils/twDate';

interface Props {
  subscriptionData: SubscriptionData | null;
  isLoading: boolean;
}

// 會員兩態模型：付款即訂閱 / 續訂（到期後付款接續）/ 重新訂。
// 一次性年費、無自動扣款——沒有「取消／恢復／補繳／寬限期」，到期即失效。
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:  { label: '訂閱中', color: 'bg-green-100 text-green-800 border-green-300' },
  expired: { label: '已失效', color: 'bg-red-100 text-red-800 border-red-300' },
};

// 一律以台灣日曆日顯示——訂閱效期存的是精確時點（見時間領域重設計），
// 用瀏覽器時區顯示在非台灣時區會差一天。
function formatDate(dateStr: string) {
  return formatTwDate(dateStr);
}

export function SubscriptionStatusCard({ subscriptionData, isLoading }: Props) {
  const statusInfo = STATUS_MAP[subscriptionData?.status ?? 'expired'] ?? STATUS_MAP.expired;

  return (
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

        {!isLoading && subscriptionData?.hasSubscription && subscriptionData.status === 'expired' && (
          <Button variant="default" size="sm" asChild>
            <Link to="/payment/checkout">續訂 / 重新訂閱</Link>
          </Button>
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
            {subscriptionData.currentPeriodStart && subscriptionData.currentPeriodEnd && (
              <div className="text-sm">
                <span className="text-muted-foreground">訂閱週期：</span>
                <span className="font-medium">
                  {formatDate(subscriptionData.currentPeriodStart)} ~ {formatDate(subscriptionData.currentPeriodEnd)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
