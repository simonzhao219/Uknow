import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../App';
import { useFeatures, Features } from '../contexts/FeatureContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useNavigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  featureRequired?: keyof Features;
}

export function ProtectedRoute({ children, featureRequired }: ProtectedRouteProps) {
  const { isLoggedIn, isLoadingUser } = useContext(UserContext);
  const { isFeatureEnabled } = useFeatures();
  const navigate = useNavigate();

  // 整頁重新載入（例如 PayUni 導回）時 UserContext 會重新從
  // isLoadingUser=true / user=null 開始，session 還在解析中，
  // 這時不能當成「未登入」導去 /login，否則會在 session 解析完成後
  // 又被導回來，造成一瞬間的畫面跳轉閃爍。
  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // 檢查功能是否啟用
  if (featureRequired && !isFeatureEnabled(featureRequired)) {
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
              <Button onClick={() => navigate('/dashboard')}>
                返回會員中心
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                返回首頁
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}