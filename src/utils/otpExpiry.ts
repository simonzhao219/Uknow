// 驗證碼有效期限與「重新寄送」共用同一個 3 分鐘倒數。
// 每寄出一封驗證碼就重新開始倒數；驗證碼到期後才可重新寄送。
// 倒數狀態以到期時間戳記保存，重新整理頁面不會重新計算。
//
// ⚠️ 安全邊界（M3）：這個 3 分鐘倒數純屬「重新寄送」的 UX 節流，只存在
// localStorage，並不 gate 實際驗證。真正的 OTP 有效期、重試次數與寄送
// 速率限制一律由 Supabase Auth 決定（前端直接呼叫 supabase.auth.verifyOtp
// / resend / signUp，不經過本專案的 Edge Function，因此無法在後端加一道
// 有效的節流）。要強化防護請在 Supabase 後台調整：
//   * Auth → Email OTP expiry（建議縮短，例如 10 分鐘內）
//   * Auth → Rate limits（每 email/IP 的寄送與驗證次數）
// 清除 localStorage 或換分頁可繞過此前端倒數，屬預期行為——最終防線在
// Supabase，不在此檔。

export const OTP_VALID_SECONDS = 180; // 3 minutes

const KEY_PREFIX = 'otp_expiry_';

function storageKey(email: string): string {
  return `${KEY_PREFIX}${email}`;
}

/** 寄出（或重新寄出）驗證碼時呼叫，開始一個新的 3 分鐘倒數，回傳到期時間戳記（ms）。 */
export function startOtpWindow(email: string): number {
  const expiresAt = Date.now() + OTP_VALID_SECONDS * 1000;
  try {
    localStorage.setItem(storageKey(email), String(expiresAt));
  } catch {
    // 忽略 storage 不可用（例如隱私模式）
  }
  return expiresAt;
}

/** 讀取已保存的到期時間戳記；若無則回傳 null。 */
export function getOtpExpiry(email: string): number | null {
  try {
    const value = localStorage.getItem(storageKey(email));
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}

/** 清除保存的到期時間戳記。 */
export function clearOtpWindow(email: string): void {
  try {
    localStorage.removeItem(storageKey(email));
  } catch {
    // 忽略
  }
}

/** 依到期時間戳記計算剩餘秒數（不會小於 0）。 */
export function getSecondsLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}
