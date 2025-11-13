import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { CreditCard, AlertCircle } from 'lucide-react';

interface WithdrawalFormProps {
  availableRewards: number;
  onStartWithdrawal: () => void;
}

export function WithdrawalForm({ availableRewards, onStartWithdrawal }: WithdrawalFormProps) {
  const reservedAmount = 273; // 預留費用
  const actualAvailable = Math.max(0, availableRewards - reservedAmount);
  const maxWithdrawal = Math.floor(actualAvailable / 1000) * 1000;
  const canWithdraw = maxWithdrawal >= 1000;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Point提領
        </CardTitle>
        <CardDescription>
          將您的推薦Point提領到銀行帳戶
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 提領資訊 */}
        <div className="bg-muted p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>可用Point</span>
            <span>{availableRewards}P</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>預留費用</span>
            <span>-{reservedAmount}P</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>實際可提領</span>
            <span>{actualAvailable}P</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>最大提領金額 (1000倍數)</span>
            <span>${maxWithdrawal}</span>
          </div>
        </div>

        {!canWithdraw ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              您的可提領Point不足 1000，無法申請提領。
              請繼續推薦好友增加Point餘額。
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>提領須知：</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>最低提領金額為 $1,000（以1000為倍數）</li>
                  <li>每次提領收取 $15 手續費</li>
                  <li>需完成身分驗證流程</li>
                  <li>處理時間約 3-5 個工作天</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={onStartWithdrawal}
              className="w-full"
              size="lg"
            >
              申請Point提領
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}