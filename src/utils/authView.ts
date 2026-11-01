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
}

export function resolveAuthView({
  authState,
  isFunnel,
  isAdmin,
  isLoggedIn,
  hint,
  pathname,
}: AuthViewInput): AuthView {
  if (authState === undefined) return isLoggedIn ? 'member' : 'guest';

  if (authState === 'authenticated') return isFunnel && !isAdmin ? 'funnel' : 'member';

  // 已確認未登入：提示可能因暫時性錯誤而保留，但頁首照訪客版。漏斗路由
  // （OTP 驗證前）只放 logo（E2）。
  if (authState === 'anonymous') return isFunnelRoute(pathname) ? 'placeholder' : 'guest';

  // unknown（與 PR-A 期間的 degraded）：判定前依提示猜。
  if (hint?.kind === 'member') return 'member-pending';
  if (hint?.kind === 'funnel') return 'funnel';
  return isFunnelRoute(pathname) ? 'placeholder' : 'guest';
}
