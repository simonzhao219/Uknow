// 會員主動登出（T1-B §4.1，W4-16）：頁首頭像選單、degraded 外框、帳號異常說明共用。
//
// 從 Navbar.handleLogout 抽出，行為不變：global 登出（失敗或卡住補本機，signOutWithFallback）、
// 清 context 與首繪提示、清 Supabase auth storage、導首頁。主動登出才用 global；
// 系統判定 session 無效時走 endInvalidSession（本機，W4-13）。
import { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { clearAuthHint } from '../utils/authHint';
import { signOutWithFallback } from '../utils/signOutWithFallback';
import { createClient } from '../utils/supabase/client';

export function useMemberLogout(): () => Promise<void> {
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      // 先清本地狀態（避免 UI 閃爍）。
      setUser(null);
      localStorage.removeItem('user');
      // 首繪提示一併清：signOut 網路失敗時 SIGNED_OUT 不一定觸發，殘留 member
      // 提示會讓下一個在這台裝置登入的人先看到前一人的首字（S11）。
      clearAuthHint();

      const { localOnly } = await signOutWithFallback(createClient().auth);
      if (localOnly) console.error('Logout: global sign-out failed, signed out this device only');

      // 強制清除所有 Supabase auth storage。
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key);
      }

      // 短暫延遲確保 session 清除完成，然後導航。
      await new Promise((resolve) => setTimeout(resolve, 100));
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Logout: unexpected error', error);
      navigate('/', { replace: true });
    }
  }, [setUser, navigate]);
}
