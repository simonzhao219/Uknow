import { nextRouteForStep } from './registrationFlow';

/** 已取得有效 session 後的導向決策所需的副作用（注入以便測試）。 */
export interface RouteAfterVerifiedSessionDeps {
  fetchProfile: (accessToken: string) => Promise<Response>;
  navigate: (to: string, options: { replace: true }) => void;
  showToast: (message: string, type: 'error') => void;
}

export async function routeAfterVerifiedSession(
  _session: { access_token: string } | null | undefined,
  _deps: RouteAfterVerifiedSessionDeps,
): Promise<void> {
  void nextRouteForStep;
}
