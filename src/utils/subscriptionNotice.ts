// 到期前續訂提醒（會員兩態模型，見 0721 移除寬限期）。
//
// 移除寬限期後「到期即失效」——沒有事後緩衝窗，因此把提醒往前移到
// 「到期前」：active 會員距到期日在 30 天內時，於 dashboard 顯示倒數與
// 續訂 CTA，讓使用者在斷崖前完成續訂，避免會員區存取與刊登無預警中斷。

import { RENEWAL_NOTICE_DAYS } from '@contract';

// 門檻與推薦網絡的「即將到期」同一個窗，單一來源在契約（@contract）。
export { RENEWAL_NOTICE_DAYS };

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

// 訂閱卡片顯示狀態：把「hasSubscription + status + 是否曾訂閱」收斂成單一
// 判斷，避免元件裡散落三態條件。兩態模型下 hasSubscription === (status
// 為 active)，故 expired 老會員 hasSubscription 為 false——但他「曾訂閱過」
// （activeUntil 有值），該顯示「會籍已失效，續訂以恢復」而非「尚未訂閱」。
export type SubscriptionCardState = 'active' | 'expired-former' | 'none';

/**
 * 我的訂閱卡會不會出現「續訂」引導鈕：已失效的老會員。
 * 會員中心用它決定同頁的「加入推薦計畫」要不要讓位（引導鈕一頁一顆，續訂優先，
 * ui-ux-guidelines §12.11）——與卡片本身用同一個判斷，兩邊不會各算各的。
 *
 * active 且 30 天內到期**暫不**放續訂鈕：結帳頁的 `resolveCheckoutPageRedirect`
 * 會把 active 會員導回會員中心，到期前續訂走不通（規格書 §14 第 7 列）。業主
 * 2026-10-05 裁決先藏鈕、UI/UX 改版完成後再修；修好時把
 * `renewalNoticeDaysLeft(...) !== null` 加回這裡，卡片與讓位會一起恢復。
 */
export function showsRenewalCta(
  data: { hasSubscription: boolean; status?: 'active' | 'expired'; activeUntil?: string } | null,
  now: number = Date.now(),
): boolean {
  return subscriptionCardState(data) === 'expired-former';
}

export function subscriptionCardState(
  data: { hasSubscription: boolean; status?: 'active' | 'expired'; activeUntil?: string } | null,
): SubscriptionCardState {
  if (!data) return 'none';
  if (data.hasSubscription) return 'active';
  // 曾訂閱過（有到期日）但已失效 → 老會員續訂入口，不是「從未訂閱」。
  if (data.status === 'expired' && data.activeUntil) return 'expired-former';
  return 'none';
}
