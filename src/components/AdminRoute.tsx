import type React from 'react';
import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../App';
import { AuthDegradedFrame } from './AuthDegradedFrame';
import { RouteAuthLoading } from './RouteAuthLoading';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isAdmin, isLoadingUser, authState } = useContext(UserContext);

  // 冷啟動 / 整頁重新載入直接進 /admin 時，session 還在解析（isLoadingUser=true、
  // user=null）。此時先顯示 loading，不能當成未登入就導去 /login——否則登入頁的
  // 「已登入自動導向」會把管理員彈到 /dashboard，看不到後台。與 ProtectedRoute 一致。
  if (isLoadingUser && !user) {
    return <RouteAuthLoading />;
  }

  // 暫時性故障（T1-B）：登入狀態未確認≠未登入——停在原頁、畫重試外框，不導 /login。
  if (authState === 'degraded' && !user) {
    return <AuthDegradedFrame />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
