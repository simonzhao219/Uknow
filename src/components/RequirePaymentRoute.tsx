import React, { useContext, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { UserContext } from '../App';

interface RequirePaymentRouteProps {
  children: React.ReactNode;
}

/**
 * 路由守衛：確保用戶已完成付款才能訪問
 * 
 * 檢查邏輯：
 * 1. 如果未登入 → 不處理（由 ProtectedRoute 處理）
 * 2. 如果已登入但未完成資料填寫 → 導向資料填寫頁面
 * 3. 如果已完成資料但未付款 → 導向付款頁面
 * 4. 如果已付款 → 允許訪問
 */
export function RequirePaymentRoute({ children }: RequirePaymentRouteProps) {
  const { user, isLoggedIn } = useContext(UserContext);
  const navigate = useNavigate();

  console.log('RequirePaymentRoute: Checking payment status -', {
    isLoggedIn,
    hasUser: !!user,
    hasName: !!user?.name,
    hasPhone: !!user?.phone,
    hasBirthDate: !!user?.birthDate,
    hasReferralCode: !!user?.referralCode,
    currentPath: window.location.pathname
  });

  // 使用 useEffect 確保在渲染後執行導航
  useEffect(() => {
    if (!isLoggedIn || !user) {
      console.log('RequirePaymentRoute: No user, skipping payment check');
      return;
    }

    const hasCompleteProfile = !!(user.name && user.phone && user.birthDate);
    const hasPaidMembership = !!user.referralCode;

    console.log('RequirePaymentRoute: Payment check result -', {
      hasCompleteProfile,
      hasPaidMembership
    });

    if (!hasCompleteProfile) {
      console.log('RequirePaymentRoute: User needs to complete profile, redirecting...');
      navigate('/auth/complete-profile', { replace: true });
    } else if (!hasPaidMembership) {
      console.log('RequirePaymentRoute: User needs to pay, redirecting...');
      navigate('/payment/checkout', { replace: true });
    } else {
      console.log('RequirePaymentRoute: User has paid, access granted');
    }
  }, [user, isLoggedIn, navigate]);

  // 如果未登入，不處理（讓 ProtectedRoute 處理）
  if (!isLoggedIn || !user) {
    return <>{children}</>;
  }

  // 檢查付款狀態
  const hasCompleteProfile = !!(user.name && user.phone && user.birthDate);
  const hasPaidMembership = !!user.referralCode;

  // 如果未完成資料，導向資料填寫頁面
  if (!hasCompleteProfile) {
    console.log('RequirePaymentRoute: Rendering Navigate to /auth/complete-profile');
    return <Navigate to="/auth/complete-profile" replace />;
  }

  // 如果未付款，導向付款頁面
  if (!hasPaidMembership) {
    console.log('RequirePaymentRoute: Rendering Navigate to /payment/checkout');
    return <Navigate to="/payment/checkout" replace />;
  }

  // 已付款，允許訪問
  console.log('RequirePaymentRoute: Access granted, rendering children');
  return <>{children}</>;
}
