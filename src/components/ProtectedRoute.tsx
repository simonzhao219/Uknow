import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../App';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useContext(UserContext);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}