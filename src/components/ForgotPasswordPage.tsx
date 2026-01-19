import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';

export function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isEditing, setIsEditing] = useState(false);

  const navigate = useNavigate();
  const { showToast } = useNotification();
  const supabase = createClient();

  // ✅ 從前一頁帶過來的 email（如果有的話）
  const prefilledEmail = location.state?.email || '';
  const errorMessage = location.state?.message || '';

  // ✅ 初始化時自動填入
  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
      setIsEditing(false); // 顯示灰色區塊
    } else {
      setIsEditing(true); // 顯示輸入框
    }
    
    // 如果有錯誤訊息，顯示 toast
    if (errorMessage) {
      showToast(errorMessage, 'error');
    }
  }, [prefilledEmail, errorMessage, showToast]);

  const handleSubmit = async () => {
    setErrors({});

    // 驗證 Email 格式
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ email: '請輸入有效的 Email 格式（例如：example@email.com）' });
      return;
    }

    setIsLoading(true);

    try {
      console.log('ForgotPassword: Sending reset email to:', email);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=password-reset`,
      });

      if (error) {
        console.error('ForgotPassword: Error sending reset email:', error);
        showToast('發送密碼重設信失敗，請稍後再試', 'error');
        return;
      }

      console.log('ForgotPassword: Reset email sent successfully');

      // ✅ 安全性：即使 Email 不存在也顯示成功（避免洩漏用戶信息）
      // 導向驗證頁面（重用 EmailVerificationPending）
      navigate('/auth/verify-reset-email', {
        state: {
          email,
          sentAt: Date.now(), // 用於計算冷卻時間
        },
      });
    } catch (error) {
      console.error('ForgotPassword: Exception:', error);
      showToast('系統錯誤，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">忘記密碼</CardTitle>
          <CardDescription>
            輸入您的 Email，我們將寄送密碼重設連結給您
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ✅ 顯示模式：灰色區塊（從登入頁帶過來的 email）*/}
          {!isEditing && email ? (
            <>
              <div className="bg-muted p-3 rounded space-y-1">
                <Label className="text-sm text-muted-foreground">Email</Label>
                <p className="font-medium">{email}</p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="flex-1"
                >
                  更改 Email
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 mr-2"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.928l3-2.647z"
                        />
                      </svg>
                      發送中...
                    </>
                  ) : (
                    '發送重設連結'
                  )}
                </Button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3 h-3 inline mr-1" />
                  返回登入
                </button>
              </div>
            </>
          ) : (
            /* ✅ 編輯模式：輸入框（直接訪問或點擊「更改 Email」）*/
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="your@email.com"
                  className={getInputErrorClass(!!errors.email)}
                  autoFocus
                />
                <FieldError error={errors.email} />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  返回登入
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading || !email}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 mr-2"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.928l3-2.647z"
                        />
                      </svg>
                      發送中...
                    </>
                  ) : (
                    '發送重設連結'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}