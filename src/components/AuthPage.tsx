import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { PasswordInput } from './ui/password-input';
import { Label } from './ui/label';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { buildApiUrl } from '../utils/apiClient';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { startOtpWindow } from '../utils/otpExpiry';
import { resolvePostLoginAction, classifyLoginError } from '../utils/registrationFlow';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { savePendingReferral } from '../utils/referralInvite';

export function AuthPage() {
  const [step, setStep] = useState(1); // 1: Email, 2: Password/SetPassword
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showToast } = useNotification();
  const supabase = createClient();

  // 邀請連結（/register?ref=CODE）落地時，先把推薦碼記進 localStorage，讓它撐過
  // 註冊漏斗（signup → OTP → 完善資料頁），最後在完善資料頁自動帶入並驗證。
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) savePendingReferral(ref);
  }, [searchParams]);

  // ✅ 清理無效 session（不主動重定向，讓 App.tsx 統一處理）
  useEffect(() => {
    const cleanupInvalidSessions = async () => {
      try {
        // 檢查當前 session 狀態
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          console.log('AuthPage: Found existing session, checking validity...');
          
          // 驗證 session 是否有效
          const response = await fetch(
            buildApiUrl('/auth/profile'),
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          );

          // ✅ 只處理無效 session，不主動重定向
          if (response.status === 410 || response.status === 404 || response.status === 401) {
            console.log('AuthPage: Session is invalid (user deleted or token expired), cleaning up...');
            await supabase.auth.signOut();
            localStorage.removeItem('user');
            localStorage.removeItem('pendingSession');
            setUser(null);
          } else if (response.ok) {
            // ✅ Session 有效，但不主動重定向
            // 讓 App.tsx 的全局邏輯處理重定向
            console.log('AuthPage: Valid session found, letting App.tsx handle redirection');
          }
        }
      } catch (error) {
        console.error('AuthPage: Error checking session validity:', error);
        // 發生錯誤時，保守清除
        await supabase.auth.signOut();
        localStorage.removeItem('user');
        setUser(null);
      }
    };

    cleanupInvalidSessions();
  }, []); // 只在組件掛載時執行一次

  // 如果已登入，導向 dashboard
  useEffect(() => {
    if (user) {
      console.log('AuthPage: User is already logged in, redirecting to dashboard');
      navigate('/dashboard', { replace: true });
    }

    // ✅ 顯示來自其他頁面的提示訊息（不處理自動導向）
    // 導向由 handleLogin 處理（用戶主動登入時）
    
    if (location.state?.message) {
      showToast(location.state.message, location.state.emailVerified ? 'success' : 'info');
      // 清除 state，避免重複顯示
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [user, navigate, location, showToast]);  // ← ✅ 加入 user 依賴

  // 接續一個「註冊到一半、Email 尚未驗證」的帳號。
  //
  // 只由 handleLogin 在「密碼正確、但 GoTrue 回報 email_not_confirmed」時呼叫
  // （GoTrue 先驗密碼，密碼錯只會回 invalid_credentials，不會走到這裡）。
  // 因此重寄驗證碼這個寄信動作永遠需要正確密碼，不會變成無密碼的寄信觸發點。
  // 到這一步身分已由密碼證明，最終再由 Email 驗證碼二次確認。
  const resumeUnverifiedSignup = async (targetEmail: string) => {
    try {
      // 舊驗證碼多半已過期；重寄一次以確保使用者手上有可用的碼。
      // 若因頻率限制等原因失敗，仍照樣導向驗證頁（頁面上有「重新寄送」可補救）。
      await supabase.auth.resend({ type: 'signup', email: targetEmail });
    } catch (error) {
      console.warn('resumeUnverifiedSignup: resend failed, navigating anyway', error);
    }
    startOtpWindow(targetEmail);
    showToast('此帳號尚未完成 Email 驗證，已重新寄送驗證碼', 'info');
    navigate('/auth/verify-otp', { state: { email: targetEmail, otpType: 'signup' } });
  };

  // 步驟 1：檢查 Email 是否存在
  const handleCheckEmail = async () => {
    setErrors({});

    // 前後空白是最常見的貼上失誤，會讓「檢查存在 / 登入 / 註冊」用到不同的字串。
    // 先正規化一次，之後每一步（含步驟 2 的登入 / 註冊）都用同一份乾淨的 email。
    const normalizedEmail = email.trim();

    // 驗證 Email 格式
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrors({ email: '請輸入有效的 Email 格式（例如：example@email.com）' });
      return;
    }

    if (normalizedEmail !== email) {
      setEmail(normalizedEmail);
    }

    setIsLoading(true);

    try {
      const response = await fetch(buildApiUrl('/auth/check-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Response data:', data);

      // 這裡「不」因為未驗證就自動寄驗證碼——那會變成一個「只要知道 email
      // 就能讓系統寄信」的無密碼觸發點，可被輪流打多個已知 email 來耗盡專案的
      // 寄信配額（email 放大攻擊）。復原一律走「密碼優先」：先進入密碼表單，
      // 由 handleLogin 在密碼正確、且 GoTrue 回報 email_not_confirmed 時才接續
      // 驗證（見下方 handleLogin）。GoTrue 是先驗密碼、密碼正確才回報未驗證，
      // 因此寄信永遠需要正確密碼。
      setIsExistingUser(data.exists);
      setStep(2);
    } catch (error) {
      console.error('Error checking email:', error);
      showToast(`檢查 Email 時發生錯誤：${error instanceof Error ? error.message : '未知錯誤'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 步驟 2A：登入（已存在的用戶）
  const handleLogin = async () => {
    setErrors({});

    if (!password) {
      setErrors({ password: '請輸入密碼' });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        console.error('Login error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
          code: error.code
        });

        // 未驗證的帳號不是「密碼錯誤」——它是一個沒走完驗證的註冊，帳號其實
        // 是活的。導回 OTP 驗證接續流程，而不是把人困在登入頁。
        if (classifyLoginError(error) === 'email_not_confirmed') {
          await resumeUnverifiedSignup(email);
          return;
        }

        showToast('Email 或密碼錯誤', 'error');
        return;
      }

      console.log('Login successful, session:', data.session ? 'exists' : 'missing');
      console.log('Access token length:', data.session?.access_token?.length || 0);

      // 取得用戶資料
      const response = await fetch(
        buildApiUrl('/auth/profile'),
        {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );

      console.log('Profile fetch response status:', response.status);

      if (!response.ok) {
        console.error('AuthPage: Failed to fetch profile, status:', response.status);
        const errorText = await response.text();
        console.error('AuthPage: Error response body:', errorText);
        
        // 特殊處理：帳號已被刪除（410）或不存在（404）
        if (response.status === 410 || response.status === 404) {
          console.log('AuthPage: User account deleted or not found, cleaning up...');
          
          // 清除 session
          await supabase.auth.signOut();
          
          showToast('帳號不存在或已被刪除，請重新註冊', 'error');
          setStep(1);
          setEmail('');
          setPassword('');
          setIsLoading(false);
          return;
        }
        
        throw new Error(`Failed to fetch user profile (status: ${response.status})`);
      }

      const profile = await response.json();
      console.log('User profile:', profile);
      console.log('User registrationStep:', profile.registrationStep);

      // ✅ 由單一狀態機（registrationFlow）決定導向與是否登入，
      // 不再在此處各自維護一份 if/else——OTP 驗證頁也用同一份決策。
      const action = resolvePostLoginAction(profile.registrationStep);
      if (action.authenticate) {
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
      }
      if (action.toast) {
        showToast(action.toast.message, action.toast.type);
      }
      navigate(action.route);
    } catch (error) {
      console.error('Error during login:', error);
      showToast('登入失敗，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 步驟 2B：註冊（新用戶）
  const handleSignUp = async () => {
    setErrors({});

    // 驗證密碼（與 ResetPasswordPage 共用同一份政策，見 utils/passwordPolicy）
    const passwordErrors = validatePasswordPolicy(password, confirmPassword);
    if (Object.keys(passwordErrors).length > 0) {
      setErrors(passwordErrors);
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔄 Starting signup process...');
      console.log('Email:', email);
      console.log('Redirect URL:', `${window.location.origin}/auth/callback`);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        const friendlyMessage = translateSignUpError(error);

        // 外洩 / 過弱密碼：顯示在密碼欄位下方，更貼近情境
        if (isWeakPasswordError(error)) {
          setErrors({ password: friendlyMessage });
        }

        showToast(friendlyMessage, 'error');
        return;
      }

      // 開始驗證碼 3 分鐘倒數（與重新寄送共用）
      startOtpWindow(email);

      // 導向 OTP 輸入頁
      navigate('/auth/verify-otp', {
        state: { email, otpType: 'signup' },
      });
    } catch (error) {
      console.error('Error during sign up:', error);
      showToast('註冊失敗，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 判斷是否為 Supabase「密碼已外洩 / 過弱」錯誤
  const isWeakPasswordError = (error: { code?: string; message?: string }) => {
    return (
      error?.code === 'weak_password' ||
      /known to be weak|easy to guess|pwned|leaked/i.test(error?.message ?? '')
    );
  };

  // 將 Supabase 註冊錯誤翻成友善的中文提示
  const translateSignUpError = (error: { code?: string; message?: string }) => {
    if (isWeakPasswordError(error)) {
      return '此密碼曾出現在資料外洩名單中，容易被猜到，請改用其他密碼。';
    }

    const message = error?.message ?? '';

    if (error?.code === 'user_already_exists' || /already registered|already exists/i.test(message)) {
      return '此電子郵件已經註冊過，請改用登入。';
    }
    if (error?.code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
      return '操作過於頻繁，請稍後再試。';
    }
    if (/invalid.*email|email.*invalid/i.test(message)) {
      return '電子郵件格式不正確，請重新輸入。';
    }

    // 其他未對應的錯誤，回傳通用提示
    return '註冊失敗，請稍後再試。';
  };

  // 忘記密碼 → 導向 OTP 密碼重設流程
  const handleForgotPassword = () => {
    navigate('/forgot-password', { state: { email } });
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {step === 1 && '歡迎使用 Uknow'}
            {step === 2 && isExistingUser && '登入帳號'}
            {step === 2 && !isExistingUser && '設定密碼'}
          </CardTitle>
          <CardDescription>
            {step === 1 && '請輸入您的 Email'}
            {step === 2 && isExistingUser && '歡迎回來'}
            {step === 2 && !isExistingUser && '建立您的新帳號'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 步驟 1：輸入 Email */}
          {step === 1 && (
            <form
              className="space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleCheckEmail();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={getInputErrorClass(!!errors.email)}
                  aria-required="true"
                  aria-invalid={!!errors.email || undefined}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  autoFocus
                />
                <FieldError id="email-error" error={errors.email} />
              </div>

              <Button
                type="submit"
                disabled={!email}
                loading={isLoading}
                className="w-full"
                data-testid="auth-continue-button"
              >
                {isLoading ? '檢查中...' : '繼續'}
              </Button>
            </form>
          )}

          {/* 步驟 2A：登入 */}
          {step === 2 && isExistingUser && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              {/* 顯示 Email */}
              <div className="bg-muted p-3 rounded space-y-1">
                <Label className="text-sm text-muted-foreground">Email</Label>
                <p>{email}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">密碼</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  className={getInputErrorClass(!!errors.password)}
                  autoFocus
                />
                <FieldError error={errors.password} />
                
                {/* ✨ 新增：忘記密碼連結 */}
                <div className="text-right">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-primary hover:underline"
                    data-testid="forgot-password-link"
                  >
                    忘記密碼？
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setPassword('');
                    setErrors({});
                  }}
                  className="flex-1"
                  data-testid="auth-back-button"
                >
                  上一步
                </Button>
                <Button
                  type="submit"
                  disabled={!password}
                  loading={isLoading}
                  className="flex-1"
                  data-testid="auth-login-button"
                >
                  {isLoading ? '登入中...' : '登入'}
                </Button>
              </div>
            </form>
          )}

          {/* 步驟 2B：註冊（設定密碼） */}
          {step === 2 && !isExistingUser && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleSignUp();
              }}
            >
              {/* 顯示 Email */}
              <div className="bg-muted p-3 rounded space-y-1">
                <Label className="text-sm text-muted-foreground">Email</Label>
                <p>{email}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">設定密碼</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  className={getInputErrorClass(!!errors.password)}
                  autoFocus
                />
                <FieldError error={errors.password} />
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">確認密碼</Label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次輸入密碼"
                  className={getInputErrorClass(!!errors.confirmPassword)}
                />
                <FieldError error={errors.confirmPassword} />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setPassword('');
                    setConfirmPassword('');
                    setErrors({});
                  }}
                  className="flex-1"
                  data-testid="auth-back-button"
                >
                  上一步
                </Button>
                <Button
                  type="submit"
                  disabled={!password || !confirmPassword}
                  loading={isLoading}
                  className="flex-1"
                  data-testid="auth-signup-button"
                >
                  {isLoading ? '註冊中...' : '註冊'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}