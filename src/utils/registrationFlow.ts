// 註冊/登入這條「連續流程」的單一決策來源。
//
// 背景：註冊是一條多步驟流程——
//   建立帳號(未驗證) → Email OTP 驗證 → 完善基本資料 → 付款 → 完成
// 這條流程的每一步若中斷（關掉分頁、重新整理），都必須能「接得回去」，
// 不能變成死巷。過去 AuthPage、OTPVerificationPage 各自維護一份
// 「registrationStep → 下一步該去哪」的 if/else，容易走針、也難測試；
// 而「帳號已建立但 Email 未驗證」這個前置狀態根本不在任何狀態機裡，
// 導致登入時被錯誤地當成「密碼錯誤」而無路可走。
//
// 這個模組把「下一步去哪」與「登入錯誤怎麼分類」收斂成純函式，
// 讓路由決策只有一份、可被單元測試釘死。

/** 註冊流程進度。由後端 effective_registration_step 即時算出（見 migration 0011）。 */
export type RegistrationStep = number | null | undefined;

export interface PostLoginAction {
  /** 登入/驗證成功後應導向的路徑。 */
  route: string;
  /**
   * 是否要把此使用者視為「已通過的登入者」寫入 UserContext。
   * 只有已完成基本資料（step ≥ 1）才設定 user，讓 ProtectedRoute 放行；
   * step 0 的新用戶尚未填資料，先不設 user，交由 CompleteProfile 收尾。
   */
  authenticate: boolean;
  toast?: { message: string; type: 'success' | 'info' };
}

/**
 * registrationStep → 登入後動作的單一決策。
 * AuthPage.handleLogin 與 OTPVerificationPage 都應該用這個，而不是各寫一份。
 *
 * - step 3：註冊完成，進 dashboard 並設定 user。
 * - step 1/2：基本資料已填、待付款/待開通，設定 user 讓路由守衛放行，靜默導向付款。
 * - step 0 / null / 未知：尚未填基本資料，導向完善資料頁（不設 user）。
 */
export function resolvePostLoginAction(step: RegistrationStep): PostLoginAction {
  switch (step) {
    case 3:
      return {
        route: '/dashboard',
        authenticate: true,
        toast: { message: '登入成功！', type: 'success' },
      };
    case 1:
    case 2:
      // 靜默導向：PaymentCheckout 頁面自己會說明，這裡不再彈 toast。
      return { route: '/payment/checkout', authenticate: true };
    case 0:
      return {
        route: '/auth/complete-profile',
        authenticate: false,
        toast: { message: '請完善您的個人資料', type: 'info' },
      };
    default:
      // 未知狀態，保守導向完善資料（與舊行為一致）。
      return {
        route: '/auth/complete-profile',
        authenticate: false,
        toast: { message: '請完善您的個人資料', type: 'info' },
      };
  }
}

/**
 * 純粹「下一步路徑」——OTP 驗證成功後只需要路徑、不需要 setUser 語意時使用。
 */
export function nextRouteForStep(step: RegistrationStep): string {
  return resolvePostLoginAction(step).route;
}

export type LoginErrorKind =
  /** 帳號已建立、密碼正確，但 Email 尚未驗證——可復原，應導回 OTP 驗證。 */
  | 'email_not_confirmed'
  /** 帳密真的錯了。 */
  | 'invalid_credentials'
  /** 其他未分類錯誤。 */
  | 'unknown';

/**
 * 把 Supabase signInWithPassword 的錯誤分類。
 *
 * 關鍵：`email_not_confirmed`（未驗證）長得跟一般登入失敗很像，但語意完全不同——
 * 它代表「這是一個沒走完驗證的註冊」，帳號其實是活的，只是被卡住。過去把所有錯誤
 * 一律說成「Email 或密碼錯誤」，正是把可復原狀態顯示成死巷的根因。
 *
 * 同時吃 `code` 與 `message`，因為不同版本的 gotrue / supabase-js
 * 對這些錯誤的欄位命名不一致。
 */
export function classifyLoginError(
  error: { code?: string; message?: string; error_description?: string } | null | undefined,
): LoginErrorKind {
  if (!error) return 'unknown';

  const code = error.code ?? '';
  const text = `${error.message ?? ''} ${error.error_description ?? ''}`;

  if (code === 'email_not_confirmed' || /email\s+not\s+confirmed|not\s+confirmed/i.test(text)) {
    return 'email_not_confirmed';
  }

  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    /invalid[\s_]+(login\s+)?credentials|invalid[\s_]+grant/i.test(text)
  ) {
    return 'invalid_credentials';
  }

  return 'unknown';
}
