import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import {
  startOtpWindow,
  getOtpExpiry,
  getSecondsLeft,
  clearOtpWindow,
} from '../utils/otpExpiry';
import { nextRouteForStep } from '../utils/registrationFlow';

export function OTPVerificationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const supabase = createClient();

  const email: string = location.state?.email ?? '';
  const otpType: 'signup' | 'recovery' = location.state?.otpType ?? 'signup';

  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  // 「有效期限」與「重新寄送」共用同一個倒數，以到期時間戳記為準，
  // 重新整理頁面不會重新計算。
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
      return;
    }
    // 沿用已保存的到期時間；若沒有（例如直接進入頁面）才建立一個新的倒數。
    const existing = getOtpExpiry(email);
    setExpiresAt(existing ?? startOtpWindow(email));
  }, [email, navigate]);

  // 每秒重新渲染以更新剩餘秒數顯示。
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = expiresAt ? getSecondsLeft(expiresAt) : 0;
  // 引用 nowTick 以確保倒數每秒刷新。
  void nowTick;

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleVerify = async (code: string) => {
    if (isVerifying || code.length !== 6) return;
    setIsVerifying(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: otpType,
      });

      if (error) {
        const isExpiredOrInvalid =
          error.message.toLowerCase().includes('expired') ||
          error.message.toLowerCase().includes('invalid');
        showToast(
          isExpiredOrInvalid ? '驗證碼錯誤或已過期，請重新寄送' : error.message,
          'error'
        );
        setOtp('');
        return;
      }

      // 驗證成功，清除倒數狀態
      clearOtpWindow(email);

      if (otpType === 'recovery') {
        navigate('/auth/reset-password', { replace: true });
        return;
      }

      // Signup: give session time to propagate, then route by registrationStep
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        const result = await apiRequestJson<{
          success: boolean;
          data: { registrationStep: number };
        }>(buildApiUrl('/auth/profile'));
        const step = result.data?.registrationStep ?? 0;
        // 與 AuthPage 共用同一份「下一步去哪」的決策，避免兩處走針。
        navigate(nextRouteForStep(step), { replace: true });
      } catch (profileErr) {
        // New user — profile doesn't exist yet
        if (profileErr instanceof ApiError && profileErr.status === 401) {
          // Auth error: don't proceed silently
          showToast('驗證成功，但登入狀態異常，請重新登入', 'error');
          navigate('/login', { replace: true });
        } else {
          navigate('/auth/complete-profile', { replace: true });
        }
      }
    } catch {
      showToast('驗證失敗，請稍後再試', 'error');
      setOtp('');
    } finally {
      setIsVerifying(false);
    }
  };

  const isOtpExpired = expiresAt !== null && secondsLeft <= 0;

  const handleResend = async () => {
    // 驗證碼到期後才可重新寄送（與有效期限共用同一個倒數）。
    if (!isOtpExpired || isResending) return;
    setIsResending(true);

    try {
      if (otpType === 'signup') {
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
      }
      showToast('驗證碼已重新寄出，請查看信箱', 'success');
      // 寄出新驗證碼，重新開始 3 分鐘倒數。
      setExpiresAt(startOtpWindow(email));
      setOtp('');
    } catch {
      showToast('重新寄送失敗，請稍後再試', 'error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {otpType === 'recovery' ? '重設密碼驗證' : '驗證您的 Email'}
          </CardTitle>
          <CardDescription>
            驗證碼已寄送至{' '}
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OTP Input */}
          <div className="flex flex-col items-center gap-3">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={(val) => {
                setOtp(val);
                if (val.length === 6) handleVerify(val);
              }}
              disabled={isVerifying || isOtpExpired}
              aria-label="驗證碼，請輸入 6 位數字"
              data-testid="otp-input-group"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>

            {/* Expiry countdown */}
            <div role="status" aria-live="polite" aria-atomic="true" className="text-sm">
              {isOtpExpired ? (
                <span className="text-destructive">驗證碼已過期，請重新寄送</span>
              ) : (
                <span className="text-muted-foreground">
                  驗證碼有效期限：
                  <span className="font-mono tabular-nums">{formatSeconds(secondsLeft)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Manual verify button (fallback if auto-submit fails) */}
          <Button
            onClick={() => handleVerify(otp)}
            disabled={otp.length !== 6 || isOtpExpired}
            loading={isVerifying}
            className="w-full"
          >
            {isVerifying ? '驗證中...' : '送出驗證碼'}
          </Button>

          {/* Resend */}
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={handleResend}
              disabled={!isOtpExpired}
              loading={isResending}
              className="text-sm"
              data-testid="otp-resend-button"
            >
              {isOtpExpired
                ? '重新寄送驗證碼'
                : `重新寄送（${secondsLeft} 秒後可用）`}
            </Button>
          </div>

          {/* Back to login */}
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
        </CardContent>
      </Card>
    </div>
  );
}
