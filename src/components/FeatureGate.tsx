import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeatures, type Features } from '../contexts/FeatureContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

/**
 * 單一功能開關守衛：某個 feature 被管理員關閉時，顯示「功能暫時關閉」而非放行。
 *
 * 從原本混在 ProtectedRoute 裡的 featureRequired 抽出，讓「登入/會籍」與「功能
 * 開關」兩種守衛各自單一職責——搭配 layout route 使用（見 App.tsx）。
 */
export function FeatureGate({
  feature,
  children,
}: {
  feature: keyof Features;
  children: React.ReactNode;
}) {
  const { isFeatureEnabled } = useFeatures();
  const navigate = useNavigate();

  if (isFeatureEnabled(feature)) {
    return <>{children}</>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-full">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <CardTitle>功能暫時關閉</CardTitle>
              <CardDescription>此功能目前無法使用</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            很抱歉，您嘗試訪問的功能目前已被管理員關閉。請稍後再試或聯繫客服了解詳情。
          </p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/dashboard')}>返回會員中心</Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              返回首頁
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
