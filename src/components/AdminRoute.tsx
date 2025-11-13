import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../App';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isAdmin } = useContext(UserContext);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}