import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../App';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isAdmin, isLoadingUser } = useContext(UserContext);

  // 冷啟動 / 整頁重新載入直接進 /admin 時，session 還在解析（isLoadingUser=true、
  // user=null）。此時先顯示 loading，不能當成未登入就導去 /login——否則登入頁的
  // 「已登入自動導向」會把管理員彈到 /dashboard，看不到後台。與 ProtectedRoute 一致。
  if (isLoadingUser && !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}