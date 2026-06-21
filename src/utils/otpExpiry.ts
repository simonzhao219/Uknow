// 驗證碼有效期限與「重新寄送」共用同一個 3 分鐘倒數。
// 每寄出一封驗證碼就重新開始倒數；驗證碼到期後才可重新寄送。
// 倒數狀態以到期時間戳記保存，重新整理頁面不會重新計算。

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
