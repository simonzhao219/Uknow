import React, { useContext, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { UserContext } from '../App';

interface RequirePaymentRouteProps {
  children: React.ReactNode;
}

/**
 * 路由守衛：確保用戶完成註冊流程才能訪問會員功能
 * 
 * 註冊步驟檢查：
 * - registrationStep = 0 或不存在 → 導向 /auth/complete-profile（填寫個人資料）
 * - registrationStep = 1 → 導向 /payment/checkout（付款頁面）
 * - registrationStep = 2 → 導向 /payment/result（付款結果頁面，等待用戶確認）
 * - registrationStep = 3 → 允許訪問會員功能
 */
export function RequirePaymentRoute({ children }: RequirePaymentRouteProps) {
  const { user, isLoggedIn } = useContext(UserContext);
  const navigate = useNavigate();

  // 使用 useEffect 確保在渲染後執行導航
  useEffect(() => {
    if (!isLoggedIn || !user) {
      return;
    }

    const step = user.registrationStep ?? 0;

    // ✅ 根據 registrationStep 決定導向
    if (step === 0) {
      navigate('/auth/complete-profile', { replace: true });
    } else if (step === 1) {
      navigate('/payment/checkout', { replace: true });
    } else if (step === 2) {
      // ✅ Step 2：付款成功，等待用戶確認（顯示付款結果頁面）
      // 需要從 profile 中獲取訂單號
      if (user.lastTradeNo) {
        navigate(`/payment/result?tradeNo=${user.lastTradeNo}`, { replace: true });
      } else {
        // 如果沒有訂單號，回到付款頁面
        navigate('/payment/checkout', { replace: true });
      }
    } else if (step === 3) {
      // ✅ 允許訪問
    } else {
      // 未知步驟，導向完善資料頁面
      navigate('/auth/complete-profile', { replace: true });
    }
  }, [user, isLoggedIn, navigate]);

  // 如果未登入，不處理（讓 ProtectedRoute 處理）
  if (!isLoggedIn || !user) {
    return <>{children}</>;
  }

  const step = user.registrationStep ?? 0;

  // ✅ 根據 registrationStep 決定是否允許訪問或重定向
  if (step === 0) {
    return <Navigate to="/auth/complete-profile" replace />;
  }

  if (step === 1) {
    return <Navigate to="/payment/checkout" replace />;
  }

  if (step === 2) {
    if (user.lastTradeNo) {
      return <Navigate to={`/payment/result?tradeNo=${user.lastTradeNo}`} replace />;
    } else {
      return <Navigate to="/payment/checkout" replace />;
    }
  }

  if (step === 3) {
    // 已完成註冊，允許訪問
    return <>{children}</>;
  }

  // 未知步驟，導向完善資料頁面
  return <Navigate to="/auth/complete-profile" replace />;
}