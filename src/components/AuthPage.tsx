import { useState, useContext, useEffect } from 'react';
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
import { clearAuthHint } from '../utils/authHint';
import { signOutWithFallback } from '../utils/signOutWithFallback';
import { fetchProfileForSession } from '../utils/fetchProfile';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { startOtpWindow } from '../utils/otpExpiry';
import {
  resolvePostLoginAction,
  classifyLoginError,
  classifyInviteAcceptError,
  resolveInviteEntry,
  type InviteEntry,
} from '../utils/registrationFlow';
import { isWeakPasswordError, translateSignUpError } from '../utils/authErrors';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import { exceedsPasswordMaxBytes } from '@password-policy';
import { REFERRAL_INVITE_TOKEN_TTL_SECONDS } from '@referral-invite-payload';
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  savePendingInviteToken,
  savePendingReferral,
} from '../utils/referralInvite';
import { useInviteAccept } from '../hooks/useInviteAccept';
import { BreakableEmail } from './common/BreakableEmail';

/** 既有 session 驗證最多等這麼久；逾時視為未登入（邀請入口不能卡在骨架）。 */
const SESSION_CHECK_TIMEOUT_MS = 4_000;

const INVITE_HINT_ID = 'invite-login-hint';

/** 邀請 accept 失敗與入口的提示文案——一律依 code，不顯示後端或 GoTrue 的原文。 */
const INVITE_NOTICES = {
  undecodable: '邀請連結無法辨識，請推薦人再寄一次，或直接註冊',
  invalid_token:
    '邀請連結無效：請回到信件重新點一次連結並確認連結完整（可能被 LINE 或郵件截斷），或請推薦人再寄一次；若你已設定過密碼請直接登入',
  // 不指向「忘記密碼」：後端在查帳號前就判 expired，而第 8 天的空殼多半已被 purge，忘記密碼是靜默死路。
  expired: `邀請連結已過期（${REFERRAL_INVITE_TOKEN_TTL_SECONDS / (24 * 60 * 60)} 天內有效），請推薦人再寄一次；若你已設定過密碼請直接登入`,
  gone: '這份邀請已失效，請推薦人再寄一次；若你已設定過密碼請直接登入',
  already_accepted: '此邀請已完成設定，請用先前設定的密碼登入',
  login_failed: '密碼已設定完成，請用剛設定的密碼登入',
  rate_limited: '嘗試次數過多，請稍後再試',
  temporary: '系統暫時無法完成設定，請稍後再試',
} as const;

/** 邀請 token 的來源：網址的 ?invite，或（只在 /register）同分頁重新整理前記住的那一份。 */
function initialInviteToken(search: URLSearchParams, pathname: string): string | null {
  const fromUrl = search.get('invite');
  if (fromUrl) return fromUrl;
  // 帶 ?ref= 的是另一條（一般推薦連結）入口：不把同分頁殘留的邀請 token 撿回來。
  if (search.has('ref')) return null;
  return pathname === '/register' ? getPendingInviteToken() : null;
}

export function AuthPage() {
  const [step, setStep] = useState(1); // 1: Email, 2: Password/SetPassword
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const { user, setUser, ingestProfile } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showToast } = useNotification();
  const supabase = createClient();

  // --- Email 邀請模式（/register?invite=<token>）---
  // 惰性初始值只做純讀取＋解碼；清網址與寫 sessionStorage 放 mount 時的 effect
  // （用 useEffect：react-router 會忽略首次 render 的 layout effect 裡呼叫的 navigate；
  // 用 router 而非裸 replaceState，useSearchParams 才不會繼續讀到 invite）。
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    initialInviteToken(searchParams, location.pathname),
  );
  const [inviteEntry] = useState<InviteEntry | null>(() =>
    inviteToken ? resolveInviteEntry(inviteToken) : null,
  );
  // 既有 session 驗證的結果；邀請入口要等它（沒登入才帶入 email 與推薦碼）。
  const [sessionState, setSessionState] = useState<'checking' | 'signed_in' | 'signed_out'>(
    'checking',
  );
  // 步驟上方的提示（持久提示與暫時性錯誤共用同一個位置）；換步驟或再次送出即清。
  const [notice, setNotice] = useState<string | null>(() =>
    inviteEntry?.kind === 'undecodable' ? INVITE_NOTICES.undecodable : null,
  );
  // 邀請入口已依 session 結果分流過（只做一次）；用 state 讓骨架與步驟在同一次 render 切換。
  const [inviteEntryResolved, setInviteEntryResolved] = useState(false);
  const inviteAccept = useInviteAccept({ supabase, navigate, showToast, ingestProfile });
  const isInviteMode = inviteToken !== null && inviteEntry?.kind === 'valid';
  const isAwaitingInviteEntry = inviteEntry?.kind === 'valid' && !inviteEntryResolved;

  useEffect(() => {
    if (searchParams.has('invite')) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }
    if (inviteToken && inviteEntry?.kind === 'valid') {
      savePendingInviteToken(inviteToken);
    } else if (inviteEntry?.kind === 'undecodable') {
      clearPendingInviteToken();
      setInviteToken(null);
    }
    // 只在 mount 時處理一次入口。
    // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  }, []);

  // 驗證結果出來後才決定邀請入口：沒登入 → 設定密碼步驟；已登入 → 只提示、交給既有導向。
  useEffect(() => {
    if (inviteEntry?.kind !== 'valid' || sessionState === 'checking' || inviteEntryResolved) {
      return;
    }
    setInviteEntryResolved(true);
    if (sessionState === 'signed_in') {
      clearPendingInviteToken();
      setInviteToken(null);
      showToast('你已登入', 'info');
      return;
    }
    savePendingReferral(inviteEntry.code);
    setEmail(inviteEntry.email);
    setIsExistingUser(false);
    setStep(2);
  }, [inviteEntry, sessionState, showToast, inviteEntryResolved]);

  // 已完成設定／密碼已設好這兩句是中性訊息（不是錯誤）：中性樣式、以 status 宣告。
  // 錯誤用 alert。兩者都靠 live role 宣告、不再搬焦點（role 加聚焦會讓讀報器念兩次）；
  // 帶提示落地時欄位也不 autoFocus，提示在欄位上方、先被讀到。
  const noticeIsNeutral =
    notice === INVITE_NOTICES.already_accepted || notice === INVITE_NOTICES.login_failed;

  const goToStep = (next: number) => {
    setNotice(null);
    setStep(next);
  };

  const leaveInviteMode = () => {
    clearPendingInviteToken();
    setInviteToken(null);
  };

  // 邀請連結（/register?ref=CODE）落地時，先把推薦碼記進 localStorage，讓它撐過
  // 註冊漏斗（signup → OTP → 完善資料頁），最後在完善資料頁自動帶入並驗證。
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) savePendingReferral(ref);
  }, [searchParams]);

  // ✅ 清理無效 session（不主動重定向，讓 App.tsx 統一處理）
  // Email 邀請入口依這個 effect 的結果分流（sessionState 三態＋4 秒逾時＋清理後寫回邀請 token）。
  // T1（登入狀態信任）改這段時必須保留這三件事——見 friction-log 2026-10-27 R2 交接。
  // `/auth/profile` 5xx 等暫時性故障歸 signed_out（不登出、保留邀請 token）。
  useEffect(() => {
    let settled = false;
    const settle = (state: 'signed_in' | 'signed_out') => {
      if (settled) return;
      settled = true;
      setSessionState(state);
    };
    const timeout = setTimeout(() => settle('signed_out'), SESSION_CHECK_TIMEOUT_MS);
    // 清掉過期 session 會觸發 SIGNED_OUT，App.tsx 在那裡清邀請 token（登出要清）；
    // 但這裡的登出只是清理殘留，邀請流程還要撐過重新整理（契約 1），清完再寫回。
    const keepInviteToken = () => {
      if (inviteToken && inviteEntry?.kind === 'valid') savePendingInviteToken(inviteToken);
    };

    const cleanupInvalidSessions = async () => {
      try {
        // 檢查當前 session 狀態
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          settle('signed_out');
        } else {
          console.log('AuthPage: Found existing session, checking validity...');

          // 驗證 session 是否有效（共用 fetchProfile：與 App 啟動判定同 user id 合併成一次請求）
          const result = await fetchProfileForSession(session);

          // ✅ 只處理無效 session，不主動重定向
          if (result.kind === 'unauthorized') {
            console.log(
              'AuthPage: Session is invalid (user deleted or token expired), cleaning up...',
            );
            await signOutWithFallback(supabase.auth);
            keepInviteToken();
            // signOut 網路失敗時 SIGNED_OUT 不一定觸發：無效 session 的首繪提示自己清。
            clearAuthHint();
            localStorage.removeItem('user');
            localStorage.removeItem('pendingSession');
            setUser(null);
            settle('signed_out');
          } else if (result.kind === 'transient') {
            // 暫時性故障：照既有慣例保留 session（不登出），但邀請入口歸 signed_out——
            // 判成 signed_in 會清掉 token、顯示「你已登入」，而 App 其實沒拿到 user。
            settle('signed_out');
          } else {
            // ✅ Session 有效，不主動重定向——讓 App.tsx 的全局邏輯處理重定向
            console.log('AuthPage: Valid session found, letting App.tsx handle redirection');
            settle('signed_in');
          }
        }
      } catch (error) {
        console.error('AuthPage: Error checking session validity:', error);
        settle('signed_out');
        // 發生錯誤時，保守清除
        await signOutWithFallback(supabase.auth);
        keepInviteToken();
        clearAuthHint();
        localStorage.removeItem('user');
        setUser(null);
      }
    };

    cleanupInvalidSessions();
    return () => clearTimeout(timeout);
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
  }, [user, navigate, location, showToast]); // ← ✅ 加入 user 依賴

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
    setNotice(null);

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
      goToStep(2);
    } catch (error) {
      console.error('Error checking email:', error);
      showToast(
        `檢查 Email 時發生錯誤：${error instanceof Error ? error.message : '未知錯誤'}`,
        'error',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 步驟 2A：登入（已存在的用戶）
  const handleLogin = async () => {
    setErrors({});
    setNotice(null);

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
          code: error.code,
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

      // 取得用戶資料（共用 fetchProfile：與 SIGNED_IN 觸發的啟動判定合併成一次請求）
      const result = await fetchProfileForSession(data.session);

      if (result.kind !== 'ok') {
        console.error('AuthPage: Failed to fetch profile:', result);

        // 特殊處理：帳號已被刪除（410）或不存在（404）
        if (result.kind === 'unauthorized' && (result.status === 410 || result.status === 404)) {
          console.log('AuthPage: User account deleted or not found, cleaning up...');

          // 清除 session（連同首繪提示：帳號已不存在）
          await signOutWithFallback(supabase.auth);
          clearAuthHint();

          showToast('帳號不存在或已被刪除，請重新註冊', 'error');
          goToStep(1);
          setEmail('');
          setPassword('');
          setIsLoading(false);
          return;
        }

        throw new Error(`Failed to fetch user profile (${result.kind})`);
      }

      const profile = result.profile;
      console.log('User profile:', profile);
      console.log('User registrationStep:', profile.registrationStep);

      // ✅ 由單一狀態機（registrationFlow）決定導向與是否登入，
      // 不再在此處各自維護一份 if/else——OTP 驗證頁也用同一份決策。
      const action = resolvePostLoginAction(profile.registrationStep);
      if (action.authenticate) {
        setUser(profile);
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

      const { error } = await supabase.auth.signUp({
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

  // 步驟 2B（邀請模式）：從邀請連結設定密碼。帳號已由推薦人的邀請建立，
  // accept 一次完成設密碼與 email 驗證，再以剛設的密碼登入。
  const handleAcceptInvite = async () => {
    if (!inviteToken) return;
    setErrors({});
    setNotice(null);

    const passwordErrors = validatePasswordPolicy(password, confirmPassword);
    if (!passwordErrors.password && exceedsPasswordMaxBytes(password)) {
      // 與後端 accept 同一句（bcrypt 72 位元組上限）。
      passwordErrors.password = '密碼太長，請縮短後再試';
    }
    if (Object.keys(passwordErrors).length > 0) {
      setErrors(passwordErrors);
      return;
    }

    const result = await inviteAccept.submit({ token: inviteToken, email, password });
    if (result.kind === 'signed_in') return;

    if (result.kind === 'accepted_login_failed') {
      leaveInviteMode();
      setIsExistingUser(true);
      setConfirmPassword('');
      goToStep(2);
      setNotice(INVITE_NOTICES.login_failed);
      return;
    }

    const action = classifyInviteAcceptError(result.code, Boolean(email));
    if (action.target === 'stay2B') {
      if (result.code === 'weak_password') {
        setErrors({ password: translateSignUpError({ code: 'weak_password' }) });
      } else {
        setNotice(
          result.code === 'rate_limited' ? INVITE_NOTICES.rate_limited : INVITE_NOTICES.temporary,
        );
      }
      return;
    }

    leaveInviteMode();
    setConfirmPassword('');
    if (action.clearPassword) setPassword('');
    const message =
      result.code === 'already_accepted'
        ? INVITE_NOTICES.already_accepted
        : result.code === 'invalid_token'
          ? INVITE_NOTICES.invalid_token
          : result.code === 'gone'
            ? INVITE_NOTICES.gone
            : INVITE_NOTICES.expired;
    if (action.target === 'to2A') {
      setIsExistingUser(true);
      goToStep(2);
    } else {
      setEmail('');
      setPassword('');
      goToStep(1);
    }
    setNotice(message);
  };

  // 忘記密碼 → 導向 OTP 密碼重設流程
  const handleForgotPassword = () => {
    navigate('/forgot-password', { state: { email } });
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        {/* 邀請入口等 session 驗證時不先閃 Email 步驟的標題（骨架本身有「載入中」名稱）。 */}
        {!isAwaitingInviteEntry && (
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
        )}
        <CardContent className="space-y-4">
          {notice && (
            <p
              role={noticeIsNeutral ? 'status' : 'alert'}
              className={
                noticeIsNeutral
                  ? 'rounded bg-muted p-3 text-sm'
                  : 'rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'
              }
            >
              {notice}
            </p>
          )}

          {/* 邀請入口：等既有 session 驗證結果，期間畫與設定密碼同形的骨架 */}
          {isAwaitingInviteEntry && (
            <output aria-busy="true" aria-label="載入中" className="block space-y-4">
              <div className="h-14 rounded bg-muted animate-pulse" />
              <div className="h-10 rounded bg-muted animate-pulse" />
              <div className="h-10 rounded bg-muted animate-pulse" />
            </output>
          )}

          {/* 步驟 1：輸入 Email */}
          {step === 1 && !isAwaitingInviteEntry && (
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
                  autoFocus={!notice}
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
                {isLoading ? '檢查中...' : '下一步'}
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
                <p>
                  <BreakableEmail email={email} />
                </p>
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
                  autoFocus={!notice}
                />
                <FieldError error={errors.password} />

                {/* ✨ 新增：忘記密碼連結 */}
                <div className="text-right">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="inline-flex items-center text-sm text-primary underline underline-offset-4 pointer-coarse:min-h-[44px]"
                    data-testid="forgot-password-link"
                    aria-describedby={notice ? undefined : INVITE_HINT_ID}
                  >
                    忘記密碼？
                  </button>
                </div>
                {/* 邀請信建立的帳號還沒有密碼：提示改走信中連結或忘記密碼。有持久提示時隱藏，避免兩條指令相反。 */}
                {!notice && (
                  <p id={INVITE_HINT_ID} className="text-xs text-muted-foreground">
                    透過邀請信加入的話，請用信中連結；還沒設定密碼請用忘記密碼
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  tone="secondary"
                  onClick={() => {
                    goToStep(1);
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
                if (isInviteMode) {
                  handleAcceptInvite();
                } else {
                  handleSignUp();
                }
              }}
            >
              {/* 顯示 Email */}
              <div className="bg-muted p-3 rounded space-y-1">
                <Label className="text-sm text-muted-foreground">Email</Label>
                <p>
                  <BreakableEmail email={email} />
                </p>
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
                  autoFocus={!notice}
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

              {isInviteMode ? (
                <div className="space-y-2">
                  <Button
                    type="submit"
                    disabled={!password || !confirmPassword}
                    loading={inviteAccept.isSubmitting}
                    className="w-full"
                    data-testid="auth-signup-button"
                  >
                    {inviteAccept.isSubmitting ? '註冊中...' : '註冊'}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        // 推薦意向不因換信箱失效：pending code 保留。
                        leaveInviteMode();
                        setEmail('');
                        setPassword('');
                        setConfirmPassword('');
                        setErrors({});
                        goToStep(1);
                      }}
                      className="inline-flex items-center text-sm text-primary underline underline-offset-4 pointer-coarse:min-h-[44px]"
                      data-testid="invite-use-other-email"
                    >
                      改用其他 Email 註冊
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      goToStep(1);
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
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
