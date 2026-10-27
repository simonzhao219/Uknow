// 密碼政策的單一事實來源：註冊、重設密碼（前端 src/utils/passwordPolicy.ts）與
// Email 邀請的設定密碼（後端 POST /auth/invite/accept）共用同一份規則與訊息。
//
// 與 @contract 同一個模式：檔案物理放在 Deno 側，前端經 `@password-policy` alias
// 讀入——反過來會打破「Deno 只依賴 supabase/functions/**」的邊界。零 import。
//
// 這裡是客戶端可見的規則；Supabase Auth 自己的密碼設定（Dashboard，含外洩密碼檢查）
// 另外在伺服器端把關。規則都過了、Supabase 仍回 weak_password，就只剩「外洩／太常見」。

/** bcrypt 只看前 72 位元組，Supabase Auth 對超過的密碼直接拒絕。 */
export const PASSWORD_MAX_BYTES = 72;

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

/** 密碼欄的錯誤訊息；符合規則時回 null。 */
export function passwordPolicyMessage(pwd: string): string | null {
  if (!pwd) return '請輸入密碼';
  const requirements = describePasswordRequirements(pwd);
  return requirements.length > 0 ? `密碼需包含：${requirements.join('、')}` : null;
}

/** 超過 bcrypt 上限（以 UTF-8 位元組計，中文一字 3 位元組）。 */
export function exceedsPasswordMaxBytes(pwd: string): boolean {
  return new TextEncoder().encode(pwd).length > PASSWORD_MAX_BYTES;
}
