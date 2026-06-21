import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Target, AlertTriangle } from 'lucide-react';

export function TaskGuide() {
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          任務說明
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-lg flex items-center gap-2">⚡ 推薦王</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-orange-600 shrink-0">•</span>
                <span>單月每成功推薦 10 位用戶即可獲得 1000P （可累贈）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 shrink-0">•</span>
                <span>只計算第 1 代（直接推薦）</span>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="font-medium text-lg flex items-center gap-2">💎 連續推薦達人</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 shrink-0">•</span>
                <span>連續 12 個月，每月至少成功推薦 1 位用戶</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 shrink-0">•</span>
                <span>完成任務獲得 1000P，之後重新計算</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 shrink-0">•</span>
                <span>若任何一個月沒有成功推薦，將重新計算</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 shrink-0">•</span>
                <span>只計算第 1 代推薦（直接推薦）</span>
              </li>
            </ul>
          </div>
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>領取說明：</strong>
            任務完成後，獎勵將出現在「待領取獎勵」區域。
            請完成 3 步驟驗證流程後，獎勵將立即加入您的可提領點數。
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
