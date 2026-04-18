import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean; // ADMIN 또는 SUB_ADMIN 만
  requireMasterAdmin?: boolean; // ADMIN 만
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAdmin = false,
  requireMasterAdmin = false
}) => {
  const { user, userData, loading, setLoginModalOpen } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const isMaster = user?.email?.toLowerCase().trim().startsWith('bizpeer@');

  if (!user) {
    // 아예 로그인이 안 된 경우 (Auth 없음)
    setTimeout(() => setLoginModalOpen(true), 100);
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // 마스터 계정은 무조건 통과
  if (isMaster) {
    return <>{children}</>;
  }

  if (!userData) {
    // 로그인은 되었으나 Firestore 프로필(userData)이 아직 없거나 로드되지 않음
    if (requireAdmin || requireMasterAdmin) {
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  if (requireMasterAdmin && !isMaster && userData?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAdmin && userData.role !== 'ADMIN' && userData.role !== 'SUB_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
