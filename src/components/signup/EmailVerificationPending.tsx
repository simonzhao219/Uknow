/**
 * Email Verification Pending Page
 * 
 * Shows after Step 1 (Account Creation)
 * Guides user to check their email and verify
 * 
 * @component EmailVerificationPending
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Mail, CheckCircle2, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';

export function EmailVerificationPending() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  
  const email = location.state?.email || '';
  const [isResending, setIsResending] = useState(false);
  
  useEffect(() => {
    if (!email) {
      // If no email provided, redirect to signup
      navigate('/signup?step=0', { replace: true });
    }
  }, [email, navigate]);
  
  const handleResendEmail = async () => {
    setIsResending(true);
    
    // TODO: Implement resend email API
    // For now, just show a toast
    setTimeout(() => {
      showToast('驗證信已重新發送', 'success');
      setIsResending(false);
    }, 2000);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <Mail className="h-10 w-10 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">
              請驗證您的 Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Instructions */}
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                我們已經發送驗證信到：
              </p>
              <p className="text-lg font-medium text-blue-600">
                {email}
              </p>
              <p className="text-sm text-muted-foreground">
                請點擊郵件中的驗證連結以繼續註冊流程
              </p>
            </div>
            
            {/* Steps */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium">檢查您的收件匣</p>
                  <p className="text-sm text-muted-foreground">
                    查看來自 Uknow 的驗證郵件
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium">點擊驗證連結</p>
                  <p className="text-sm text-muted-foreground">
                    連結將會開啟一個新頁面
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium">完成資料填寫</p>
                  <p className="text-sm text-muted-foreground">
                    驗證成功後，繼續完成註冊流程
                  </p>
                </div>
              </div>
            </div>
            
            {/* Info Box */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-medium mb-1">找不到驗證信？</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>請檢查垃圾郵件資料夾</li>
                    <li>確認 Email 地址是否正確</li>
                    <li>等待幾分鐘後再試一次</li>
                    <li>點擊下方「重新發送」按鈕</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={handleResendEmail}
                disabled={isResending}
                variant="outline"
                className="w-full"
              >
                {isResending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    發送中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    重新發送驗證信
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => navigate('/signup?step=0')}
                variant="ghost"
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回註冊頁面
              </Button>
            </div>
            
            {/* Help */}
            <div className="text-center text-sm text-muted-foreground">
              需要協助？
              <button className="ml-1 text-blue-600 hover:underline">
                聯絡客服
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
