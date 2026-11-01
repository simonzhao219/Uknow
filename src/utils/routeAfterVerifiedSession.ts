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
 * 要求重新登入；404（帳號資料異常）帶去 /login 顯示說明；暫時性錯誤帶去會員中心，
 * 由守衛的重試外框接手（T1-B）——不再一律送去完善資料頁（老會員會被送進註冊流程）。
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
    switch (result.kind) {
      case 'ok':
        // 先回灌 App 的登入狀態（首繪提示在導頁前寫好），再導向下一步。
        ingestProfile?.(result.profile);
        navigate(nextRouteForStep(result.profile.registrationStep), { replace: true });
        break;
      // 401／410（410 /profile 實際不會回，與 fetchProfile 分類一致）：要求重新登入。
      case 'unauthorized':
        showToast('驗證成功，但登入狀態異常，請重新登入', 'error');
        navigate('/login', { replace: true });
        break;
      // 404＝帳號資料異常（W4-11）：不回灌、不登出；/login 顯示異常說明（AuthPage）。
      case 'missing':
        navigate('/login', { replace: true });
        break;
      // 暫時性錯誤：不能把已完成註冊的人送進註冊頁——交給會員中心守衛的重試外框（T1-B §2.4）。
      case 'transient':
        navigate('/dashboard', { replace: true });
        break;
      default:
        result satisfies never;
    }
  } catch {
    navigate('/dashboard', { replace: true });
  }
}
