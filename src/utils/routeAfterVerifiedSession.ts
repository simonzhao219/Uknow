import type { ProfileFetchResult } from './fetchProfile';
import { nextRouteForStep } from './registrationFlow';

export type VerifiedSession = { access_token: string; user?: { id?: string } | null };

/** 已取得有效 session 後的導向決策所需的副作用（注入以便測試）。 */
export interface RouteAfterVerifiedSessionDeps {
  fetchProfile: (session: VerifiedSession) => Promise<ProfileFetchResult>;
  ingestProfile?: (profile: any) => void;
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
  session: VerifiedSession | null | undefined,
  { fetchProfile, ingestProfile, navigate, showToast }: RouteAfterVerifiedSessionDeps,
): Promise<void> {
  if (!session) {
    navigate('/auth/complete-profile', { replace: true });
    return;
  }

  try {
    const result = await fetchProfile(session);
    if (result.kind === 'ok') {
      // 先回灌 App 的登入狀態（首繪提示在導頁前寫好），再導向下一步。
      ingestProfile?.(result.profile);
      navigate(nextRouteForStep(result.profile.registrationStep), { replace: true });
    } else if (result.kind === 'unauthorized' && result.status === 401) {
      showToast('驗證成功，但登入狀態異常，請重新登入', 'error');
      navigate('/login', { replace: true });
    } else {
      // missing（404）與 transient：暫維持帶去完善資料頁；T1-B B6 分流（W4-11）。
      navigate('/auth/complete-profile', { replace: true });
    }
  } catch {
    navigate('/auth/complete-profile', { replace: true });
  }
}
