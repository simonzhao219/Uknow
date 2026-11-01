// 守衛的 degraded 外框（T1-B §4.1）：ProtectedRoute／AdminRoute 在 authState 為 degraded 時
// 畫這個，而不是導 /login。從 context 取重試狀態，登出走會員主動登出（W4-16，global）。
//
// 焦點：只有「使用者按下重試而成功」時，外框卸載後把焦點交給 <main>（tabIndex=-1，見 App）；
// 事件或自動重試成功不搶焦點（ui-ux §9）。失敗時鈕留在 DOM，焦點自然留在鈕上。
import { useContext } from 'react';
import { UserContext } from '../App';
import { useMemberLogout } from '../hooks/useMemberLogout';
import { AuthDegradedNotice } from './AuthDegradedNotice';

export function AuthDegradedFrame() {
  const { retryAuth, isRetrying = false, failedAgain = false } = useContext(UserContext);
  const signOut = useMemberLogout();

  const handleRetry = async () => {
    await retryAuth?.();
    // 等這一輪 render 完再判斷：外框已卸載＝重試成功、受保護頁已渲染。
    setTimeout(() => {
      if (document.querySelector('[data-testid="auth-degraded"]')) return;
      document.querySelector<HTMLElement>('main')?.focus();
    }, 0);
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <AuthDegradedNotice
        onRetry={() => void handleRetry()}
        onSignOut={signOut}
        isRetrying={isRetrying}
        failedAgain={failedAgain}
      />
    </div>
  );
}
