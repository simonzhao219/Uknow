import React, { useContext, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { ProfileResponse } from '@contract';
import { UserContext } from '../App';

/** resolveMembershipRedirect 會讀到的 profile 欄位子集（全可選，方便單元測試傳部分物件）。 */
type MembershipProfile = Partial<
  Pick<
    ProfileResponse,
    | 'isAdmin'
    | 'accountStatus'
    | 'paidAwaitingActivation'
    | 'lastTradeNo'
    | 'subscriptionEndDate'
    | 'name'
    | 'phone'
    | 'birthDate'
    | 'registrationStep'
  >
>;

interface RequireMembershipRouteProps {
  children: React.ReactNode;
}

/**
 * 會員資格守衛：以「會籍是否有效」為唯一放行條件。
 *
 * 會籍的唯一事實來源是訂閱的 end_date（後端 user_account_status 推導出
 * accountStatus）。付款開通與任務延長會籍都只是「把 end_date 往後推」的
 * 兩種手段——守衛不需要知道會籍是怎麼來的，一律看 accountStatus。
 *
 * registrationStep 從此降級為「首次註冊漏斗」專用。舊版以 step 當門禁、
 * step===2 一律彈回 /payment/result 的行為已移除——那正是付款成功卻被
 * 永久困在結果頁死循環的根源（訂單卡在 pending 時 step 永遠是 2）。
 *
 * 決策表（由上而下）：
 *   1. isAdmin                       → 放行（管理員可能沒有訂閱）
 *   2. accountStatus active/grace    → 放行
 *   3. paidAwaitingActivation        → /payment/result（開通中，自癒頁）
 *   4. 曾有訂閱（已過期）             → /payment/checkout（續約）
 *   5. step 0 或資料不完整            → /auth/complete-profile（首次漏斗）
 *   6. 其餘（step 1、step 2 但付款失敗）→ /payment/checkout
 */
export function resolveMembershipRedirect(user: MembershipProfile): string | null {
  if (user.isAdmin) return null;
  if (user.accountStatus === 'active' || user.accountStatus === 'grace') return null;

  // 已付款、後端收斂中（PayUni 已回 SUCCESS 但訂閱還沒建好）→ 開通中
  // 頁面會輪詢並在轉 active 時自動進會員中心；絕不能把已付款的人送回
  // 結帳頁造成重複付款。
  if (user.paidAwaitingActivation) {
    return user.lastTradeNo
      ? `/payment/result?tradeNo=${user.lastTradeNo}`
      : '/payment/checkout';
  }

  // 曾是會員、已過期 → 直接續約，不重走註冊漏斗。
  if (user.subscriptionEndDate) return '/payment/checkout';

  const profileComplete = !!(user.name && user.phone && user.birthDate);
  if ((user.registrationStep ?? 0) === 0 || !profileComplete) {
    return '/auth/complete-profile';
  }

  // step 1（資料已填未付款）、或 step 2 但付款失敗（paidAwaitingActivation
  // 為 false）→ 去結帳。舊版把 step 2 一律送去 /payment/result，付款失敗
  // 的人會被困在結果頁。
  return '/payment/checkout';
}

export function RequireMembershipRoute({ children }: RequireMembershipRouteProps) {
  const { user, isLoggedIn } = useContext(UserContext);
  const navigate = useNavigate();

  const redirect = isLoggedIn && user ? resolveMembershipRedirect(user) : null;

  // 停權（profiles.suspended_at，admin 會員管理設定）：擋在會員區之外，
  // 顯示明確訊息——不能導去結帳頁（會造成付了錢也進不來）。
  // 刊登的下架由後端 has_active_subscription() 處理，這裡只管畫面。
  if (isLoggedIn && user?.suspended && !user?.isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3 p-6 border rounded-lg bg-red-50 border-red-200">
        <h2 className="text-xl font-bold text-red-800">帳號已停權</h2>
        <p className="text-sm text-red-700">
          您的帳號目前處於停權狀態，會員功能與刊登已暫停。
          若有疑問請聯繫客服。
        </p>
      </div>
    );
  }

  // 沿用原本 useEffect + render-time Navigate 的雙保險寫法，
  // 但決策表只寫一次（resolveMembershipRedirect）。
  useEffect(() => {
    if (redirect) {
      navigate(redirect, { replace: true });
    }
  }, [redirect, navigate]);

  // 如果未登入，不處理（讓 ProtectedRoute 處理）
  if (!isLoggedIn || !user) {
    return <>{children}</>;
  }

  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
