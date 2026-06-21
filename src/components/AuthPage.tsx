import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { buildApiUrl } from '../utils/apiClient';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { isWeakPasswordError, translateAuthError } from '../utils/authErrors';

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
  const { showToast } = useNotification();
  const supabase = createClient();

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
          if (response.status === 410 || response.status === 404) {
            console.log('AuthPage: Session is invalid (user deleted), cleaning up...');
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

  // 步驟 1：檢查 Email 是否存在
  const handleCheckEmail = async () => {
    setErrors({});

    // 驗證 Email 格式
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ email: '請輸入有效的 Email 格式（例如：example@email.com）' });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(buildApiUrl('/auth/check-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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

      // ✅ 根據 registrationStep 決定導向
      if (!profile.registrationStep || profile.registrationStep === 0) {
        // 新用戶，尚未填寫基本資料
        console.log('AuthPage: New user, redirecting to complete profile');
        showToast('請完善您的個人資料', 'info');
        navigate('/auth/complete-profile');
      } else if (profile.registrationStep === 1 || profile.registrationStep === 2) {
        // ✅ 已填寫基本資料，設定 user（讓 ProtectedRoute 通過）
        console.log('AuthPage: User needs to complete payment');
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
        // ✅ 靜默導向，不顯示 toast（PaymentCheckout 頁面會有說明）
        navigate('/payment/checkout');
      } else if (profile.registrationStep === 3) {
        // 註冊完成，可正常使用
        console.log('AuthPage: User registration complete, redirecting to dashboard');
        setUser(profile);  // ✅ 只有完成註冊才設定 user
        localStorage.setItem('user', JSON.stringify(profile));
        showToast('登入成功！', 'success');
        navigate('/dashboard');
      } else {
        // 未知狀態，預設導向完善資料
        console.warn('AuthPage: Unknown registrationStep:', profile.registrationStep);
        showToast('請完善您的個人資料', 'info');
        navigate('/auth/complete-profile');
      }
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

    // 驗證密碼
    const passwordErrors = validatePassword(password, confirmPassword);
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
        const friendlyMessage = translateAuthError(error, '註冊失敗，請稍後再試。');

        // 外洩 / 過弱密碼：顯示在密碼欄位下方，更貼近情境
        if (isWeakPasswordError(error)) {
          setErrors({ password: friendlyMessage });
        }

        showToast(friendlyMessage, 'error');
        return;
      }

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

  // 密碼驗證
  const validatePassword = (pwd: string, confirmPwd: string) => {
    const errors: { [key: string]: string } = {};

    if (!pwd) {
      errors.password = '請輸入密碼';
    } else {
      const requirements = [];
      
      if (pwd.length < 8) {
        requirements.push('至少 8 個字元');
      }
      if (!/[A-Z]/.test(pwd)) {
        requirements.push('至少一個大寫字母（A-Z）');
      }
      if (!/[a-z]/.test(pwd)) {
        requirements.push('至少一個小寫字母（a-z）');
      }
      if (!/[0-9]/.test(pwd)) {
        requirements.push('至少一個數字（0-9）');
      }

      if (requirements.length > 0) {
        errors.password = `密碼需包含：${requirements.join('、')}`;
      }
    }

    if (!isExistingUser) {
      if (!confirmPwd) {
        errors.confirmPassword = '請再次輸入密碼以確認';
      } else if (pwd !== confirmPwd) {
        errors.confirmPassword = '兩次輸入的密碼不一致，請重新確認';
      }
    }

    return errors;
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
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheckEmail()}
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
                onClick={handleCheckEmail}
                disabled={!email}
                loading={isLoading}
                className="w-full"
              >
                {isLoading ? '檢查中...' : '繼續'}
              </Button>
            </div>
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
                <Input
                  id="password"
                  type="password"
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
                >
                  上一步
                </Button>
                <Button
                  type="submit"
                  disabled={!password}
                  loading={isLoading}
                  className="flex-1"
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
                <Input
                  id="password"
                  type="password"
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
                <Input
                  id="confirmPassword"
                  type="password"
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
                >
                  上一步
                </Button>
                <Button
                  type="submit"
                  disabled={!password || !confirmPassword}
                  loading={isLoading}
                  className="flex-1"
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