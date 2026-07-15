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

  console.log('RequirePaymentRoute: Checking registration step -', {
    isLoggedIn,
    hasUser: !!user,
    registrationStep: user?.registrationStep,
    currentPath: window.location.pathname
  });

  // 使用 useEffect 確保在渲染後執行導航
  useEffect(() => {
    if (!isLoggedIn || !user) {
      console.log('RequirePaymentRoute: No user, skipping check');
      return;
    }

    const step = user.registrationStep ?? 0;

    console.log('RequirePaymentRoute: Registration step check -', { step });

    // ✅ 根據 registrationStep 決定導向
    if (step === 0) {
      console.log('RequirePaymentRoute: Step 0, redirecting to /auth/complete-profile');
      navigate('/auth/complete-profile', { replace: true });
    } else if (step === 1) {
      console.log('RequirePaymentRoute: Step 1, redirecting to /payment/checkout');
      navigate('/payment/checkout', { replace: true });
    } else if (step === 2) {
      console.log('RequirePaymentRoute: Step 2, redirecting to /payment/result');
      // ✅ Step 2：付款成功，等待用戶確認（顯示付款結果頁面）
      // 需要從 profile 中獲取訂單號
      if (user.lastTradeNo) {
        navigate(`/payment/result?tradeNo=${user.lastTradeNo}`, { replace: true });
      } else {
        // 如果沒有訂單號，回到付款頁面
        console.warn('RequirePaymentRoute: Step 2 but no lastTradeNo, redirecting to checkout');
        navigate('/payment/checkout', { replace: true });
      }
    } else if (step === 3) {
      console.log('RequirePaymentRoute: Step 3, access granted');
      // ✅ 允許訪問
    } else {
      // 未知步驟，導向完善資料頁面
      console.warn('RequirePaymentRoute: Unknown step, redirecting to /auth/complete-profile');
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
    console.log('RequirePaymentRoute: Rendering Navigate to /auth/complete-profile');
    return <Navigate to="/auth/complete-profile" replace />;
  }

  if (step === 1) {
    console.log('RequirePaymentRoute: Rendering Navigate to /payment/checkout');
    return <Navigate to="/payment/checkout" replace />;
  }

  if (step === 2) {
    console.log('RequirePaymentRoute: Rendering Navigate to /payment/result');
    if (user.lastTradeNo) {
      return <Navigate to={`/payment/result?tradeNo=${user.lastTradeNo}`} replace />;
    } else {
      console.warn('RequirePaymentRoute: Step 2 but no lastTradeNo, redirecting to checkout');
      return <Navigate to="/payment/checkout" replace />;
    }
  }

  if (step === 3) {
    // 已完成註冊，允許訪問
    console.log('RequirePaymentRoute: Access granted, rendering children');
    return <>{children}</>;
  }

  // 未知步驟，導向完善資料頁面
  console.warn('RequirePaymentRoute: Unknown step, redirecting to /auth/complete-profile');
  return <Navigate to="/auth/complete-profile" replace />;
}