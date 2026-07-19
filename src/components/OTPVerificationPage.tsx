import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { buildApiUrl } from '../utils/apiClient';
import {
  startOtpWindow,
  getOtpExpiry,
  getSecondsLeft,
  clearOtpWindow,
} from '../utils/otpExpiry';
import { nextRouteForStep } from '../utils/registrationFlow';
import { getPendingOtp, savePendingOtp, clearPendingOtp } from '../utils/otpSession';

export function OTPVerificationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const supabase = createClient();

  // 優先用導頁帶來的 state；若沒有（例如使用者關掉頁面後重開網址／新分頁開啟，
  // router state 已不存在），就從 localStorage 還原待驗證情境，讓中斷的驗證流程
  // 接得回去而不是被踢回登入。
  const { email, otpType } = useMemo<{ email: string; otpType: 'signup' | 'recovery' }>(() => {
    const stateEmail: string | undefined = location.state?.email;
    const stateOtpType: 'signup' | 'recovery' | undefined = location.state?.otpType;
    if (stateEmail) return { email: stateEmail, otpType: stateOtpType ?? 'signup' };
    const pending = getPendingOtp();
    if (pending) return { email: pending.email, otpType: pending.otpType };
    return { email: '', otpType: 'signup' };
  }, [location.state]);

  // 記住目前的待驗證情境，讓之後重開網址時能還原（見上方 useMemo）。
  useEffect(() => {
    if (email) savePendingOtp(email, otpType);
  }, [email, otpType]);

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
      // verifyOtp 成功會「當場建立一個有效 session」並回傳在 data.session——
      // 這正是要讓它直接生效、免去使用者再登入一次的關鍵。過去這裡丟掉了
      // data、改用 setTimeout(500) 等 session 傳播再走 apiRequestJson，而
      // apiRequestJson 一遇 401 就會主動 signOut + 導回登入頁；只要那個等待
      // 有一點點沒到位，剛驗證好的 session 就被自己清掉、逼使用者重登
      //（使用者回報的「再填一次帳密登入」正是這條路徑）。
      const { data, error } = await supabase.auth.verifyOtp({
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

      // 驗證成功，清除倒數與待驗證情境
      clearOtpWindow(email);
      clearPendingOtp();

      if (otpType === 'recovery') {
        navigate('/auth/reset-password', { replace: true });
        return;
      }

      // Signup: 直接用 verifyOtp 當場回傳的 session 決定下一步——不再 setTimeout
      // 等待、也不走會「401 就自我登出」的 apiRequestJson。session 本身已透過
      // supabase-js 的 onAuthStateChange('SIGNED_IN') 讓 App.tsx 全域生效，
      // 這裡只需要讀一次 registrationStep 決定漏斗去向。
      const session = data.session;
      if (!session) {
        // signup 的 verifyOtp 照理一定回 session；真的沒有就保守帶去完善資料頁，
        // 絕不因此把使用者踢回登入（session 沒建立才需要重登，這裡不是）。
        navigate('/auth/complete-profile', { replace: true });
        return;
      }

      try {
        const response = await fetch(buildApiUrl('/auth/profile'), {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.ok) {
          const profile = await response.json();
          // 與 AuthPage 共用同一份「下一步去哪」的決策，避免兩處走針。
          navigate(nextRouteForStep(profile.registrationStep), { replace: true });
        } else if (response.status === 401) {
          // 剛建立的 session 卻被後端拒絕：這是「session 真的不可用」，
          // 才需要重新登入。注意這與舊版的假性 401 不同——舊版是靠
          // getAccessToken()/setTimeout 等 session 傳播，時機沒到就誤判 401；
          // 現在直接用 verifyOtp 當場回傳的 token，不會再有那種假象。
          showToast('驗證成功，但登入狀態異常，請重新登入', 'error');
          navigate('/login', { replace: true });
        } else {
          // 其他非 200（例如 404：profile 列還沒建好）——session 是有效的，
          // 就近帶去完善資料頁繼續註冊流程，而不是把人踢回登入頁。
          navigate('/auth/complete-profile', { replace: true });
        }
      } catch {
        navigate('/auth/complete-profile', { replace: true });
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
