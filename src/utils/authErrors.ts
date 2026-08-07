/**
 * Supabase Auth 錯誤 → 使用者看得懂的中文訊息。
 *
 * 為什麼抽出來:這組映射原本硬編在 `AuthPage.tsx` 與 `ResetPasswordPage.tsx`
 * 裡,**沒有任何單元測試**,唯一防線是 8 條 e2e 情境——最貴的那一層
 * (見 docs/plans/friction-log.md 2026-08-07 的 e2e 去重盤點)。
 * 而且 `isWeakPasswordError` 在兩個檔案各寫了一份,兩份會各自漂移。
 *
 * 設計要點:**每一條都同時比對 `code` 與 `message` 正則**。Supabase 的
 * error code 在不同版本/端點上不一定給得齊(舊版只有訊息文字),只認 code
 * 會在升級後靜默失效——退回通用的「請稍後再試」,使用者於是反覆重試一個
 * 永遠不會成功的密碼。訊息正則是 code 缺席時的後備,不是冗餘。
 */

export interface AuthErrorLike {
  code?: string;
  message?: string;
}

/** 密碼外洩 / 過弱:客戶端政策放行但 Supabase 擋下。 */
export const WEAK_PASSWORD_MESSAGE = '此密碼曾出現在資料外洩名單中，容易被猜到，請改用其他密碼。';

/** 新密碼與舊密碼相同(僅重設密碼流程會遇到)。 */
export const SAME_PASSWORD_MESSAGE = '新密碼不能與舊密碼相同，請改用其他密碼。';

export function isWeakPasswordError(error: AuthErrorLike | null | undefined): boolean {
  return (
    error?.code === 'weak_password' ||
    /known to be weak|easy to guess|pwned|leaked/i.test(error?.message ?? '')
  );
}

export function isSamePasswordError(error: AuthErrorLike | null | undefined): boolean {
  return (
    error?.code === 'same_password' ||
    /should be different from the old password|different from the old/i.test(error?.message ?? '')
  );
}

/**
 * 註冊錯誤的翻譯。順序有意義:外洩密碼先判,因為它同時可能帶著別的訊息;
 * 其餘互斥。認不出來的一律回通用提示,不把英文原文丟給使用者。
 */
export function translateSignUpError(error: AuthErrorLike | null | undefined): string {
  if (isWeakPasswordError(error)) return WEAK_PASSWORD_MESSAGE;

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

  return '註冊失敗，請稍後再試。';
}
