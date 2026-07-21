// 到期前續訂提醒（會員兩態模型，見 0721 移除寬限期）。
//
// 移除寬限期後「到期即失效」——沒有事後緩衝窗，因此把提醒往前移到
// 「到期前」：active 會員距到期日在 30 天內時，於 dashboard 顯示倒數與
// 續訂 CTA，讓使用者在斷崖前完成續訂，避免會員區存取與刊登無預警中斷。

export const RENEWAL_NOTICE_DAYS = 30;

/**
 * 回傳「距到期剩餘天數」——僅在 active 且剩餘天數落在 [0, 30] 時回傳，
 * 否則回 null（expired、無效期、超過門檻、或時鐘偏移導致負值）。
 *
 * 天數以 activeUntil（訂閱到期時點，台灣日終）減 now 進位計算；與舊
 * grace 倒數同語意，只是門檻改為到期「前」30 天。
 */
export function renewalNoticeDaysLeft(
  status: string | undefined,
  activeUntil: string | undefined,
  now: number = Date.now(),
): number | null {
  if (status !== 'active' || !activeUntil) return null;
  const daysLeft = Math.ceil((new Date(activeUntil).getTime() - now) / 86_400_000);
  if (daysLeft < 0 || daysLeft > RENEWAL_NOTICE_DAYS) return null;
  return daysLeft;
}
