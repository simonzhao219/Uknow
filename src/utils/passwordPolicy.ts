// 密碼政策的單一決策來源。
//
// 背景：註冊（AuthPage）與重設密碼（ResetPasswordPage）各自複製了一份一模一樣的
// `validatePassword`，兩份會各自漂移——改了一處忘了另一處，就會出現「註冊擋得住、
// 重設卻放行」這種不對稱的破口。把規則收斂成純函式，讓政策只有一份、可被單元測試釘死，
// 兩個頁面共用。

// 以字串索引簽章表示，方便直接餵給元件的 `errors` 狀態（{ [key: string]: string }）。
// 只會出現 `password` / `confirmPassword` 兩個鍵，且僅在有錯誤時才寫入。
export type PasswordFieldErrors = Record<string, string>;

/**
 * 列出密碼「還缺什麼」——回傳未滿足的規則描述陣列（全部通過時為空陣列）。
 * 供組成錯誤訊息與（未來）即時提示共用。
 */
export function describePasswordRequirements(pwd: string): string[] {
  const requirements: string[] = [];

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

  return requirements;
}

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

  if (!pwd) {
    errors.password = '請輸入密碼';
  } else {
    const requirements = describePasswordRequirements(pwd);
    if (requirements.length > 0) {
      errors.password = `密碼需包含：${requirements.join('、')}`;
    }
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
