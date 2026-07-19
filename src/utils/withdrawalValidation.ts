// 提領流程的驗證與金額計算的單一決策來源。
//
// 背景：提領是「送出後無法修改」的金流動作，最需要被釘死的就是——能提多少、
// 金額級距、銀行帳號與身分證格式這幾道守門。過去這些規則全埋在 WithdrawalProcess
// 這個大型元件裡、且沒有任何單元測試；金額上限（含每日 8000 上限）、餘額邊界
// （1015）這種一算錯就出金流事故的邏輯，只被 happy path E2E 掃過一次。
//
// 這個模組把純計算 / 純驗證抽出來，讓每個邊界都能被單元測試覆蓋；後端
// （supabase/functions/api/withdrawals.ts）仍是最終真相來源，前端這層是即時回饋。

export const MIN_WITHDRAWAL = 1000; // 最低提領 Point
export const WITHDRAWAL_FEE = 15; // 每次提領手續費
export const DAILY_WITHDRAWAL_LIMIT = 8000; // 每次 / 每日提領上限
export const WITHDRAWAL_MULTIPLE = 1000; // 提領必須為此值的倍數
/** 帳戶至少要有這麼多 Point 才可能提領（最低提領 + 手續費）。 */
export const MIN_REQUIRED_BALANCE = MIN_WITHDRAWAL + WITHDRAWAL_FEE; // 1015

export const BANK_ACCOUNT_MIN_DIGITS = 10;
export const BANK_ACCOUNT_MAX_DIGITS = 16;

/** 台灣身分證字號格式：1 個大寫英文字母 + 性別碼(1/2) + 8 位數字。 */
export const ID_NUMBER_PATTERN = /^[A-Z][12]\d{8}$/;

/** 把可能為 undefined/NaN 的點數安全轉成非負整數。 */
function safePoints(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 扣掉手續費後「可以拿去換提領額度」的 Point（不小於 0）。 */
export function computeWithdrawablePoints(availableRewards: number): number {
  return Math.max(0, safePoints(availableRewards) - WITHDRAWAL_FEE);
}

/**
 * 最大可提領 Point = min( floor(可提領 / 1000) * 1000, 每日上限 8000 )。
 * 例：available 20000 → 可提領 19985 → 19000，但被每日上限壓到 8000。
 */
export function computeMaxWithdrawal(availableRewards: number): number {
  const withdrawable = computeWithdrawablePoints(availableRewards);
  return Math.min(
    Math.floor(withdrawable / WITHDRAWAL_MULTIPLE) * WITHDRAWAL_MULTIPLE,
    DAILY_WITHDRAWAL_LIMIT,
  );
}

/** 依餘額判斷是否「有機會」提領（最大提領額度是否達到最低門檻）。 */
export function canWithdrawFromBalance(availableRewards: number): boolean {
  return computeMaxWithdrawal(availableRewards) >= MIN_WITHDRAWAL;
}

/**
 * 驗證提領金額（字串輸入）。回傳錯誤訊息字串，或 null（通過）。
 * 判斷順序刻意與後端一致：未填 → 低於最低 → 非倍數 → 超過上限。
 */
export function validateWithdrawalAmount(
  amount: string,
  maxWithdrawal: number,
): string | null {
  if (!amount) {
    return '請輸入提領Point';
  }

  const amountNum = parseInt(amount, 10) || 0;

  if (amountNum < MIN_WITHDRAWAL) {
    return `最低提領Point為 ${MIN_WITHDRAWAL.toLocaleString()}P`;
  }
  if (amountNum % WITHDRAWAL_MULTIPLE !== 0) {
    return '提領Point必須為 1000 的倍數';
  }
  if (amountNum > maxWithdrawal) {
    return `提領Point不能超過 ${maxWithdrawal.toLocaleString()}P`;
  }

  return null;
}

/**
 * 驗證收款銀行帳號。回傳錯誤訊息字串，或 null（通過）。
 * 允許輸入含連字號；實際位數以去掉連字號後的純數字計算（10–16 位）。
 */
export function validateBankAccount(bankAccount: string): string | null {
  if (!bankAccount.trim()) {
    return '請輸入收款銀行帳號';
  }

  if (!/^[\d-]+$/.test(bankAccount)) {
    return '銀行帳號只能包含數字和連字號';
  }

  const accountDigits = bankAccount.replace(/-/g, '');

  if (accountDigits.length < BANK_ACCOUNT_MIN_DIGITS) {
    return `銀行帳號至少需要${BANK_ACCOUNT_MIN_DIGITS}位數字`;
  }
  if (accountDigits.length > BANK_ACCOUNT_MAX_DIGITS) {
    return `銀行帳號不能超過${BANK_ACCOUNT_MAX_DIGITS}位數字`;
  }
  if (!/^\d+$/.test(accountDigits)) {
    return '請輸入有效的銀行帳號';
  }

  return null;
}

/** 身分證字號格式是否正確（大小寫不敏感、前後空白忽略）。 */
export function isValidIdNumberFormat(idNumber: string): boolean {
  return ID_NUMBER_PATTERN.test(idNumber.trim().toUpperCase());
}
