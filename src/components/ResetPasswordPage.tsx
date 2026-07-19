import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { PasswordInput } from './ui/password-input';
import { Label } from './ui/label';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { validatePasswordPolicy } from '../utils/passwordPolicy';

// 判斷是否為 Supabase「密碼已外洩 / 過弱」錯誤（與 AuthPage 一致）。
// 客戶端政策擋不掉外洩密碼——那要靠 Supabase 的 pwned 名單，只有送出後才知道。
function isWeakPasswordError(error: { code?: string; message?: string }) {
  return (
    error?.code === 'weak_password' ||
    /known to be weak|easy to guess|pwned|leaked/i.test(error?.message ?? '')
  );
}

// 判斷是否為「新密碼與舊密碼相同」的錯誤。
function isSamePasswordError(error: { code?: string; message?: string }) {
  return (
    error?.code === 'same_password' ||
    /should be different from the old password|different from the old/i.test(
      error?.message ?? '',
    )
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const navigate = useNavigate();
  const { showToast, showSuccess } = useNotification();
  const supabase = createClient();

  // 檢查是否有有效的 recovery session
  useEffect(() => {
    const checkSession = async () => {
      console.log('ResetPassword: Checking for valid recovery session...');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('ResetPassword: No session found, redirecting to forgot password');
        showToast('驗證已過期，請重新申請密碼重設', 'error');
        navigate('/forgot-password', { replace: true });
        return;
      }

      console.log('ResetPassword: Valid session found for user:', session.user.id);
    };

    checkSession();
  }, [supabase, navigate, showToast]);

  const handleSubmit = async () => {
    setErrors({});

    // 與 AuthPage 共用同一份密碼政策（見 utils/passwordPolicy）
    const validationErrors = validatePasswordPolicy(password, confirmPassword);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      console.log('ResetPassword: Updating password...');

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error('ResetPassword: Error updating password:', error);

        // 外洩 / 過弱密碼：客戶端政策放行、但 Supabase 擋下——顯示在密碼欄位下方，
        // 而不是誤導性的通用「請稍後再試」（後者會讓人以為是系統問題而反覆重試）。
        if (isWeakPasswordError(error)) {
          const message = '此密碼曾出現在資料外洩名單中，容易被猜到，請改用其他密碼。';
          setErrors({ password: message });
          showToast(message, 'error');
          return;
        }

        // 新密碼與舊密碼相同。
        if (isSamePasswordError(error)) {
          const message = '新密碼不能與舊密碼相同，請改用其他密碼。';
          setErrors({ password: message });
          showToast(message, 'error');
          return;
        }

        showToast('密碼重設失敗，請稍後再試', 'error');
        return;
      }

      console.log('ResetPassword: ✅ Password updated successfully');

      // 成功後顯示通知
      showSuccess(
        '密碼重設成功！',
        '您的密碼已成功更新',
        ['請使用新密碼登入']
      );

      // 導向登入頁面
      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: {
            message: '密碼已成功重設！請使用新密碼登入。',
            passwordReset: true,
          },
        });
      }, 2000);
    } catch (error) {
      console.error('ResetPassword: Exception:', error);
      showToast('系統錯誤，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">設定新密碼</CardTitle>
          <CardDescription>請輸入您的新密碼</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 密碼輸入 */}
          <div className="space-y-2">
            <Label htmlFor="password">新密碼</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入新密碼"
              className={getInputErrorClass(!!errors.password)}
              autoFocus
            />
            <FieldError error={errors.password} />

            {/* ✅ 重用 AuthPage 的密碼要求提示 */}
            <div className="bg-muted p-3 rounded text-sm space-y-1">
              <p className="font-medium">密碼必須包含：</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>至少 8 個字元</li>
                <li>至少一個大寫字母（A-Z）</li>
                <li>至少一個小寫字母（a-z）</li>
                <li>至少一個數字（0-9）</li>
              </ul>
            </div>
          </div>

          {/* 確認密碼 */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">確認新密碼</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="再次輸入新密碼"
              className={getInputErrorClass(!!errors.confirmPassword)}
            />
            <FieldError error={errors.confirmPassword} />
          </div>

          {/* 提交按鈕 */}
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !password || !confirmPassword}
            className="w-full"
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
                更新中...
              </>
            ) : (
              '確認並重設密碼'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
