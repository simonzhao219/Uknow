import { nextRouteForStep } from './registrationFlow';

/** 已取得有效 session 後的導向決策所需的副作用（注入以便測試）。 */
export interface RouteAfterVerifiedSessionDeps {
  fetchProfile: (accessToken: string) => Promise<Response>;
  navigate: (to: string, options: { replace: true }) => void;
  showToast: (message: string, type: 'error') => void;
}

/**
 * 剛建立 session（OTP 驗證、邀請連結設好密碼後登入）之後決定下一步。
 *
 * 直接用當場拿到的 access token 讀 profile——不走會「401 就自我登出」的
 * apiRequestJson，也不 setTimeout 等 session 傳播。只有後端真的回 401 才
 * 要求重新登入；其他失敗一律就近帶去完善資料頁，絕不把剛驗證好的人踢回登入。
 */
export async function routeAfterVerifiedSession(
  session: { access_token: string } | null | undefined,
  { fetchProfile, navigate, showToast }: RouteAfterVerifiedSessionDeps,
): Promise<void> {
  if (!session) {
    navigate('/auth/complete-profile', { replace: true });
    return;
  }

  try {
    const response = await fetchProfile(session.access_token);
    if (response.ok) {
      const profile = await response.json();
      navigate(nextRouteForStep(profile.registrationStep), { replace: true });
    } else if (response.status === 401) {
      showToast('驗證成功，但登入狀態異常，請重新登入', 'error');
      navigate('/login', { replace: true });
    } else {
      // 例如 404：profile 列還沒建好——session 有效，繼續註冊流程。
      navigate('/auth/complete-profile', { replace: true });
    }
  } catch {
    navigate('/auth/complete-profile', { replace: true });
  }
}
