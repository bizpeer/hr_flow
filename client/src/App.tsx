import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceShell } from './components/WorkspaceShell';
import { OrganizationAdmin } from './pages/OrganizationAdmin';
import { ExpenseAdminDashboard } from './pages/ExpenseAdminDashboard';
import { ExpenseForm } from './pages/ExpenseForm';
import { AttendanceDashboard } from './pages/AttendanceDashboard';
import { NoticeBoard } from './pages/NoticeBoard';
import { Login } from './pages/Login';
import { AdminSettings } from './pages/AdminSettings';
import { AdminApprovals } from './pages/AdminApprovals';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginModal } from './components/LoginModal';
import { useAuthStore } from './store/authStore';
import { LeaveApplication } from './pages/LeaveApplication';
import { LoadingSplash } from './components/LoadingSplash';
import { EmployeeManagement } from './pages/EmployeeManagement';
import { SalaryManagement } from './pages/SalaryManagement';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { LandingPage } from './pages/LandingPage';
import { SubscriptionManagement } from './pages/SubscriptionManagement';
import { SubscriptionRequired } from './pages/SubscriptionRequired';
import { ProfileSetup } from './pages/ProfileSetup';
import { OfficialLetters } from './pages/OfficialLetters';
import { Drafting } from './pages/Drafting';

function App() {
  const { initAuth, userData, companyData, user, loading, sessionReady, authError, refreshSession, logout } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [initAuth]);

  if (loading) {
    return <LoadingSplash />;
  }

  const isSuperAdmin = userData?.role === 'SUPER_ADMIN';
  const isExpired = !isSuperAdmin && companyData?.subscriptionStatus === 'EXPIRED';

  if (user && authError) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-md space-y-4 bg-white p-8 rounded-2xl shadow">
      <p role="alert">{authError}</p><button onClick={() => void refreshSession()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg">다시 확인</button>
      <button onClick={() => void logout()} className="ml-3 px-4 py-2">로그아웃</button>
    </div></div>;
  }

  if (user && userData && (userData.mustChangePassword || (!sessionReady && !isExpired))) {
    return <HashRouter><div className="min-h-screen grid place-items-center bg-slate-50 p-6"><p>비밀번호 변경을 완료한 후 업무를 시작할 수 있습니다.</p></div><LoginModal /></HashRouter>;
  }

  if (user && !loading && !userData) {
    return <ProfileSetup />;
  }

  return (
    <HashRouter>
      <LoginModal />
      <Routes>
        <Route path="/" element={
          !user ? <LandingPage /> : 
          (userData ? <Navigate to={isSuperAdmin ? '/super-admin' : '/dashboard'} replace /> : 
           (loading ? <LoadingSplash /> : <Navigate to="/profile-setup" replace />))
        } />
        <Route path="/login" element={
          user ? (userData ? <Navigate to={isSuperAdmin ? '/super-admin' : '/dashboard'} replace /> : <Navigate to="/profile-setup" replace />) : <Login />
        } />
        <Route path="/profile-setup" element={user && !userData ? <ProfileSetup /> : <Navigate to="/" replace />} />
        <Route path="/subscription-required" element={<SubscriptionRequired />} />
        
        <Route path="/*" element={
          !user ? <Navigate to="/login" replace /> : !userData ? <Navigate to="/profile-setup" replace /> : (
            <WorkspaceShell key={`${userData.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} profile={userData} company={companyData}>
                  <Routes>
                    {/* SUPER_ADMIN 전용 */}
                    <Route path="super-admin" element={<ProtectedRoute requireSuperAdmin><SuperAdminDashboard /></ProtectedRoute>} />

                    {/* 구독 관리 (전용) - 블로킹 대상 제외 */}
                    <Route path="subscription" element={<ProtectedRoute requireAdmin><SubscriptionManagement /></ProtectedRoute>} />

                    {/* 일반 사용자 및 블로킹 로직 */}
                    {isExpired ? (
                      <Route path="*" element={<Navigate to="/subscription-required" replace />} />
                    ) : (
                      <>
                        <Route path="/" element={<AttendanceDashboard />} />
                        <Route path="dashboard" element={<AttendanceDashboard />} />
                        <Route path="leave" element={<ProtectedRoute><LeaveApplication /></ProtectedRoute>} />
                        <Route path="drafting" element={<ProtectedRoute><Drafting key={`${userData.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} /></ProtectedRoute>} />
                        <Route path="expense" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />
                        <Route path="documents" element={<ProtectedRoute><OfficialLetters key={`${userData.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} /></ProtectedRoute>} />
                        <Route path="official-letters" element={<ProtectedRoute><OfficialLetters key={`${userData.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} /></ProtectedRoute>} />
                        <Route path="board" element={<ProtectedRoute><NoticeBoard userRole={userData?.role || 'MEMBER'} currentUserId={userData?.uid || ''} /></ProtectedRoute>} />

                        <Route path="admin/organization" element={<ProtectedRoute requireMasterAdmin><OrganizationAdmin /></ProtectedRoute>} />
                        <Route path="admin/approvals" element={<ProtectedRoute requireAdmin><AdminApprovals key={`${userData.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} /></ProtectedRoute>} />
                        <Route path="admin/finance-stats" element={<ProtectedRoute requireMasterAdmin><ExpenseAdminDashboard /></ProtectedRoute>} />
                        <Route path="admin/employees" element={<ProtectedRoute requireMasterAdmin><EmployeeManagement /></ProtectedRoute>} />
                        <Route path="admin/salary" element={<ProtectedRoute requireMasterAdmin><SalaryManagement /></ProtectedRoute>} />
                        <Route path="admin/settings" element={<ProtectedRoute requireMasterAdmin><AdminSettings /></ProtectedRoute>} />
                        
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </>
                    )}
                  </Routes>
            </WorkspaceShell>
          )
        } />
      </Routes>
    </HashRouter>
  );
}

export default App;
