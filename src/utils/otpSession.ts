// 待驗證的 OTP 情境（email + 類型）持久化。
//
// 為什麼需要這個：OTPVerificationPage 過去只從 React Router 的 `location.state`
// 取得 email 與 otpType。一旦使用者在驗證碼頁按了重新整理（或分享/重開網址），
// router state 就消失，頁面因為 `!email` 而把人踢回 /login——一條可以接續的
// 流程（註冊驗證、重設密碼驗證）就這樣斷掉。可恢復性契約第 1 條要求「狀態要能
// 撐過重整、不能只存在單次導頁裡」，這個模組把待驗證情境存進 localStorage，
// 讓驗證碼頁在 router state 消失時仍能 rehydrate。
//
// 一次只會有一筆待驗證情境，因此用單一 key 儲存即可。
// email 與 otpType 都不是機敏資料，存在 localStorage 沒有隱私疑慮；
// 驗證碼本身（真正的秘密）永遠不經手這裡。

export type OtpType = 'signup' | 'recovery';

export interface PendingOtp {
  email: string;
  otpType: OtpType;
}

const KEY = 'pending_otp';

/** 寄出（或重新寄出）驗證碼、導向驗證碼頁前呼叫，記住這次要驗證的情境。 */
export function savePendingOtp(email: string, otpType: OtpType): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email, otpType }));
  } catch {
    // 忽略 storage 不可用（例如隱私模式）
  }
}

/** 讀取待驗證情境；沒有、或資料毀損時回傳 null。 */
export function getPendingOtp(): PendingOtp | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOtp>;
    if (
      typeof parsed?.email === 'string' &&
      parsed.email !== '' &&
      (parsed.otpType === 'signup' || parsed.otpType === 'recovery')
    ) {
      return { email: parsed.email, otpType: parsed.otpType };
    }
    return null;
  } catch {
    return null;
  }
}

/** 驗證成功（或放棄流程）時清除。 */
export function clearPendingOtp(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}
