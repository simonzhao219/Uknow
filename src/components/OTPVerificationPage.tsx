import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';

const OTP_VALID_SECONDS = 180; // 3 minutes
const RESEND_COOLDOWN_SECONDS = 90;

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
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [validSecondsLeft, setValidSecondsLeft] = useState(OTP_VALID_SECONDS);

  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (validSecondsLeft <= 0) return;
    const t = setTimeout(() => setValidSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [validSecondsLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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
        if (step >= 3) {
          navigate('/dashboard', { replace: true });
        } else if (step >= 1) {
          navigate('/payment/checkout', { replace: true });
        } else {
          navigate('/auth/complete-profile', { replace: true });
        }
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

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
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
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setValidSecondsLeft(OTP_VALID_SECONDS);
      setOtp('');
    } catch {
      showToast('重新寄送失敗，請稍後再試', 'error');
    } finally {
      setIsResending(false);
    }
  };

  const isOtpExpired = validSecondsLeft <= 0;

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
                  <span className="font-mono tabular-nums">{formatSeconds(validSecondsLeft)}</span>
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
              disabled={resendCooldown > 0}
              loading={isResending}
              className="text-sm"
            >
              {resendCooldown > 0
                ? `重新寄送（${resendCooldown} 秒後可用）`
                : '重新寄送驗證碼'}
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
