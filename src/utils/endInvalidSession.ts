// 無效 session 的系統清理（T1-B auth-transient-resilience §2.5，業主裁決 W4-13）。
//
// 只在「確認 session 真的無效」時呼叫（/profile 401／410、apiClient 兩層確認後仍 401）。
// 與使用者主動登出不同：
// - `scope:'local'`：無效 token 在伺服器端本來就沒用，global 只會順手撤銷其他裝置上
//   仍有效的 session（主動登出才用 global，見 signOutWithFallback）。
// - 只清本機：首繪提示＋帳號相關的 storage 鍵（clearAccountLocalState，與登出同一份清單）。
// - **不**導頁、**不**動 React state、**不**清邀請 token——呼叫端各自處置（bootstrap 清自己的
//   hint state、AuthPage 保留邀請 token、apiClient 發 session 過期事件）。
// 不得 import App（appShell.test 守衛）。
import { clearAuthHint } from './authHint';
import { clearAccountLocalState } from './clearAccountLocalState';

type LocalSignOutAuth = {
  signOut(opts?: { scope?: 'global' | 'local' | 'others' }): Promise<unknown>;
};

export async function endInvalidSession({
  auth,
  storage,
}: {
  auth: LocalSignOutAuth;
  storage?: Storage | null;
}): Promise<void> {
  try {
    await auth.signOut({ scope: 'local' });
  } catch {
    // 本機登出不打網路；真的失敗也照樣清本機狀態。
  }
  clearAuthHint(storage);
  clearAccountLocalState(storage);
}
