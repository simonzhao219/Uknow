// 密碼政策的前端入口。
//
// 背景：註冊（AuthPage）與重設密碼（ResetPasswordPage）各自複製了一份一模一樣的
// `validatePassword`，兩份會各自漂移——改了一處忘了另一處，就會出現「註冊擋得住、
// 重設卻放行」這種不對稱的破口。規則本體收斂在 `@password-policy`
// （supabase/functions/_shared/password-policy.ts）：Email 邀請的設定密碼由後端
// 照同一份擋，三處只有一份規則。

import { describePasswordRequirements, passwordPolicyMessage } from '@password-policy';

export { describePasswordRequirements };

// 以字串索引簽章表示，方便直接餵給元件的 `errors` 狀態（{ [key: string]: string }）。
// 只會出現 `password` / `confirmPassword` 兩個鍵，且僅在有錯誤時才寫入。
export type PasswordFieldErrors = Record<string, string>;

/**
 * 驗證密碼與（可選的）確認密碼，回傳欄位錯誤物件（無錯誤時為空物件）。
 *
 * @param pwd            密碼
 * @param confirmPwd     確認密碼
 * @param options.requireConfirmation
 *   是否要求「兩次輸入一致」。註冊 / 重設密碼皆需要（預設 true）；
 *   登入只需檢查密碼是否有填，不走這裡。
 */
export function validatePasswordPolicy(
  pwd: string,
  confirmPwd: string,
  options: { requireConfirmation?: boolean } = {},
): PasswordFieldErrors {
  const { requireConfirmation = true } = options;
  const errors: PasswordFieldErrors = {};

  const passwordError = passwordPolicyMessage(pwd);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (requireConfirmation) {
    if (!confirmPwd) {
      errors.confirmPassword = '請再次輸入密碼以確認';
    } else if (pwd !== confirmPwd) {
      errors.confirmPassword = '兩次輸入的密碼不一致，請重新確認';
    }
  }

  return errors;
}
