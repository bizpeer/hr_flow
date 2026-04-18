import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean; // ADMIN 또는 SUB_ADMIN 만
  requireMasterAdmin?: boolean; // ADMIN 만
  requireSuperAdmin?: boolean; // SUPER_ADMIN 만
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAdmin = false,
  requireMasterAdmin = false,
  requireSuperAdmin = false
}) => {
  const { user, userData, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const isSuperAdmin = userData?.role === 'SUPER_ADMIN';

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // SUPER_ADMIN은 플랫폼 관리 페이지만 접근 가능
  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // SUPER_ADMIN은 회사별 메뉴에 접근 불필요하므로 자체 대시보드로 리디렉트
  if (isSuperAdmin && !requireSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  if (!userData) {
    if (requireAdmin || requireMasterAdmin) {
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  if (requireMasterAdmin && userData.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAdmin && userData.role !== 'ADMIN' && userData.role !== 'SUB_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
