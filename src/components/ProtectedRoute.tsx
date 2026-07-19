import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { UserContext } from '../App';
import { useFeatures, Features } from '../contexts/FeatureContext';
import { FeatureGate } from './FeatureGate';
import { LoadingScreen } from './LoadingScreen';

interface ProtectedRouteProps {
  /** 作為包裹元件用；不給則以 <Outlet/> 當 layout route 用。 */
  children?: React.ReactNode;
  featureRequired?: keyof Features;
}

/**
 * 登入守衛。可當包裹元件（傳 children）或 layout route（不傳 children，渲染 Outlet）。
 * featureRequired 保留向下相容；新程式建議改用獨立的 <FeatureGate>。
 */
export function ProtectedRoute({ children, featureRequired }: ProtectedRouteProps) {
  const { user, isLoggedIn, isLoadingUser } = useContext(UserContext);

  // 整頁重新載入（例如 PayUni 導回）時 UserContext 會重新從
  // isLoadingUser=true / user=null 開始，session 還在解析中，
  // 這時不能當成「未登入」導去 /login，否則會在 session 解析完成後
  // 又被導回來，造成一瞬間的畫面跳轉閃爍。
  //
  // 但若 user 已經有值（例如分頁重新可見時的背景重新驗證），代表這不是冷啟動，
  // 直接照常渲染，不要把畫面清空成 spinner（stale-while-revalidate）。
  if (isLoadingUser && !user) {
    return <LoadingScreen />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const content = children ?? <Outlet />;
  if (featureRequired) {
    return <FeatureGate feature={featureRequired}>{content}</FeatureGate>;
  }
  return <>{content}</>;
}
