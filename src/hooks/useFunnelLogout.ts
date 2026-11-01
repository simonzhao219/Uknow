// 註冊中途的登出（T1 auth-state-trust，plan §4.2；D2、D3、E5）。
//
// 頁首「登出」（funnel 版）與結帳頁首購者「登出，稍後再付款」共用：同一導向
// （/login）、同一 toast、同一清理。不清完善資料草稿（D3）——重新登入後由
// resolvePostLoginAction 接回原步驟，所以不需要確認框。

import { useCallback, useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { useNotification } from '../components/notifications/NotificationContext';
import { clearAuthHint } from '../utils/authHint';
import { classifyMembershipGate } from '../utils/registrationFlow';
import { createClient } from '../utils/supabase/client';

export interface FunnelLogout {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
}

const TOAST_DEFAULT = '您已登出，之後用同一帳號登入即可繼續完成註冊';
const TOAST_ACTIVATING = '付款已收到，登入後會自動開通';
const TOAST_LOCAL_ONLY = '已登出此裝置';

export function useFunnelLogout(): FunnelLogout {
  const { user, setUser, hintNext } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const busyRef = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsLoggingOut(true);

    // 已付款待開通：/profile 回來前只有提示時，看提示記的目的地（結果頁）。
    const activating = user ? classifyMembershipGate(user) === 'activating' : hintNext === 'result';

    const supabase = createClient();
    let localOnly = false;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      // supabase-js 在網路錯誤時不清本機 session；不補 local 的話導 /login 後
      // AuthPage 偵測到殘留 session 又把人拉回漏斗頁。
      localOnly = true;
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // 本機清除不會走網路；真的失敗也照樣清狀態、導頁。
      }
    }

    setUser(null);
    localStorage.removeItem('pendingUser');
    clearAuthHint();
    showToast(localOnly ? TOAST_LOCAL_ONLY : activating ? TOAST_ACTIVATING : TOAST_DEFAULT, 'info');
    navigate('/login', { replace: true });

    busyRef.current = false;
    setIsLoggingOut(false);
  }, [user, setUser, hintNext, navigate, showToast]);

  return { logout, isLoggingOut };
}
