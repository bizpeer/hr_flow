import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
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

function App() {
  const { initAuth, userData, companyData, user, loading } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  return (
    <HashRouter>
      <LoginModal />
      <Routes>
        <Route path="/" element={
          !user ? <LandingPage /> : 
          (userData ? <Navigate to={isSuperAdmin ? '/super-admin' : '/dashboard'} replace /> : <LoadingSplash />)
        } />
        <Route path="/login" element={
          user ? <Navigate to={isSuperAdmin ? '/super-admin' : '/dashboard'} replace /> : <Login />
        } />
        <Route path="/subscription-required" element={<SubscriptionRequired />} />
        
        <Route path="/*" element={
          !user ? <Navigate to="/login" replace /> : (
            <div className="flex h-screen bg-slate-50 overflow-hidden relative font-sans">
              {/* Mobile Header */}
              <div className="md:hidden print:hidden flex items-center justify-between bg-slate-900 text-white p-4 fixed top-0 left-0 w-full z-50 shadow-lg border-b border-indigo-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-white italic">HF</div>
                  <div className="text-xl font-black tracking-tight text-white">HR <span className="text-indigo-400">FLOW</span></div>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 hover:bg-slate-800 rounded-xl transition-all active:scale-95"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6 text-indigo-400" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>

              {/* Sidebar (Responsive Drawer) */}
              <div className={`print:hidden fixed inset-y-0 left-0 z-40 w-64 transform transition-all duration-500 ease-in-out premium-shadow 
                ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0`}>
                <Sidebar 
                  userRole={userData?.role || 'MEMBER'} 
                  onItemClick={() => setIsMobileMenuOpen(false)}
                />
              </div>

              {/* Mobile Overlay */}
              {isMobileMenuOpen && (
                <div 
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 md:hidden transition-opacity duration-500" 
                  onClick={() => setIsMobileMenuOpen(false)} 
                />
              )}
              
              {/* Main Content Area */}
              <div className="flex-1 h-full overflow-y-auto mt-[64px] md:mt-0 bg-slate-50 transition-all duration-300">
                <div className="max-w-7xl mx-auto min-h-full">
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
                        <Route path="expense" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />
                        <Route path="board" element={<ProtectedRoute><NoticeBoard userRole={userData?.role || 'MEMBER'} currentUserId={userData?.uid || ''} /></ProtectedRoute>} />

                        <Route path="admin/organization" element={<ProtectedRoute requireMasterAdmin><OrganizationAdmin /></ProtectedRoute>} />
                        <Route path="admin/approvals" element={<ProtectedRoute requireAdmin><AdminApprovals /></ProtectedRoute>} />
                        <Route path="admin/finance-stats" element={<ProtectedRoute requireMasterAdmin><ExpenseAdminDashboard /></ProtectedRoute>} />
                        <Route path="admin/employees" element={<ProtectedRoute requireMasterAdmin><EmployeeManagement /></ProtectedRoute>} />
                        <Route path="admin/salary" element={<ProtectedRoute requireMasterAdmin><SalaryManagement /></ProtectedRoute>} />
                        <Route path="admin/settings" element={<ProtectedRoute requireMasterAdmin><AdminSettings /></ProtectedRoute>} />
                        
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </>
                    )}
                  </Routes>
                </div>
              </div>
            </div>
          )
        } />
      </Routes>
    </HashRouter>
  );
}

export default App;
