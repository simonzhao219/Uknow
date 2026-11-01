// 頁首五版本的單一決策（T1 auth-state-trust，plan §4.1）。純函式，不 import App。

import type { AuthHint } from './authHint';
import { isFunnelRoute } from './registrationFlow';

/** `degraded` 只在 PR-B（暫時性故障不登出）產生；PR-A 期間與 `unknown` 同畫法。 */
export type AuthState = 'unknown' | 'anonymous' | 'authenticated' | 'degraded';

export type AuthView = 'guest' | 'placeholder' | 'member-pending' | 'funnel' | 'member';

export interface AuthViewInput {
  /** undefined：舊的 UserContext mock 沒有這個欄位，回落 isLoggedIn。 */
  authState: AuthState | undefined;
  isFunnel?: boolean;
  isAdmin?: boolean;
  isLoggedIn?: boolean;
  hint: Pick<AuthHint, 'kind'> | null | undefined;
  pathname: string;
  /** getSession() 例外或 10 秒未 resolve（安全出口，F4）。 */
  sessionStalled?: boolean;
}

export function resolveAuthView({
  authState,
  isFunnel,
  isAdmin,
  isLoggedIn,
  hint,
  pathname,
  sessionStalled,
}: AuthViewInput): AuthView {
  if (authState === undefined) return isLoggedIn ? 'member' : 'guest';

  if (authState === 'authenticated') return isFunnel && !isAdmin ? 'funnel' : 'member';

  // 安全出口（F4）：連 session 都讀不到時不讓頁首永遠空白或停在頭像占位。
  if (sessionStalled) return 'guest';

  // 已確認未登入：提示可能因暫時性錯誤而保留，但頁首照訪客版。漏斗路由
  // （OTP 驗證前）只放 logo（E2）。
  if (authState === 'anonymous') return isFunnelRoute(pathname) ? 'placeholder' : 'guest';

  // unknown（與 PR-A 期間的 degraded）：判定前依提示猜。
  if (hint?.kind === 'member') return 'member-pending';
  if (hint?.kind === 'funnel') return 'funnel';
  return isFunnelRoute(pathname) ? 'placeholder' : 'guest';
}

/** 會員外框（BottomNav、main 底部留白、首頁 hasBottomNav）是否出現。 */
export function showsMemberChrome(view: AuthView | undefined): boolean {
  return view === 'member' || view === 'member-pending';
}

/** 讀 context 的 authView；舊的 context mock 沒有這個欄位時依 isLoggedIn 回落（同 resolveAuthView）。 */
export function authViewOrFallback(
  view: AuthView | undefined,
  isLoggedIn: boolean | undefined,
): AuthView {
  return view ?? (isLoggedIn ? 'member' : 'guest');
}
