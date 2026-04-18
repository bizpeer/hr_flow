import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CalendarClock, Network, Settings, FileText, CheckSquare, PieChart, BookOpen, LogIn, LogOut, Users, Banknote } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useAuthStore } from '../store/authStore';

interface SidebarProps {
  userRole: 'ADMIN' | 'SUB_ADMIN' | 'EMPLOYEE' | string;
  userId?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ userRole }) => {
  const { user, logout, setLoginModalOpen } = useAuthStore();
  const isMaster = user?.email?.toLowerCase().trim().startsWith('bizpeer@');
  const isHR = userRole === 'ADMIN' || userRole === 'SUB_ADMIN' || isMaster;
  const isFinance = userRole === 'ADMIN' || userRole === 'SUB_ADMIN' || isMaster;
  const isDirector = userRole === 'ADMIN' || isMaster;
  const isManagement = isHR || isFinance || isDirector;

  const NavItem = ({ to, icon: Icon, label, colorClass = 'indigo' }: { to: string, icon: any, label: string, colorClass?: string }) => (
    <NavLink 
      to={to} 
      className={({ isActive }) => `
        group flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 relative overflow-hidden
        ${isActive 
          ? `bg-${colorClass}-600/10 text-${colorClass}-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]` 
          : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
        }
      `}
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${isActive ? `text-${colorClass}-400` : 'text-slate-500'}`} />
          <span className="font-semibold tracking-tight">{label}</span>
          {isActive && (
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-${colorClass}-500 rounded-r-full shadow-[0_0_15px_rgba(99,102,241,0.5)]`} />
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <div className="w-64 h-full bg-slate-900 flex flex-col p-6 border-r border-slate-800/50 relative overflow-hidden">
      {/* Decorative Gradient Background */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-indigo-600/5 to-transparent opacity-50 pointer-events-none"></div>

      <div className="flex items-center justify-between mb-10 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg shadow-indigo-900/20">HF</div>
          <div className="text-2xl font-black tracking-tighter text-white">HR <span className="text-indigo-400">FLOW</span></div>
        </div>
        <NotificationBell currentUserId={user?.uid || ''} />
      </div>
      
      <nav className="flex-1 space-y-2 relative z-10">
        <NavItem to="/dashboard" icon={Home} label="대시보드" />
        <NavItem to="/leave" icon={CalendarClock} label="내 휴가 및 근태" />
        <NavItem to="/expense" icon={FileText} label="지출결의 신청" colorClass="emerald" />
        <NavItem to="/board" icon={BookOpen} label="공지사항 게시판" colorClass="rose" />

        {isManagement && (
          <div className="pt-8 pb-3 px-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Management</p>
          </div>
        )}

        {isManagement && <NavItem to="/admin/approvals" icon={CheckSquare} label="결재/승인 관리함" />}
        {isDirector && <NavItem to="/admin/organization" icon={Network} label="조직관리" />}
        {isDirector && <NavItem to="/admin/salary" icon={Banknote} label="급여 및 연봉 관리" colorClass="indigo" />}
        {isDirector && <NavItem to="/admin/finance-stats" icon={PieChart} label="지출결의 통합 조회" colorClass="emerald" />}
        {isDirector && <NavItem to="/admin/employees" icon={Users} label="인사관리" colorClass="indigo" />}
        {isDirector && <NavItem to="/admin/settings" icon={Settings} label="시스템 설정" colorClass="slate" />}
      </nav>

      <div className="mt-auto pt-6 border-t border-slate-800 relative z-10">
        {!user ? (
          <button 
            onClick={() => setLoginModalOpen(true)}
            className="flex w-full items-center space-x-3 px-4 py-3 text-slate-400 hover:text-white transition-all rounded-xl hover:bg-slate-800/50 group"
          >
            <LogIn className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
            <span className="font-bold tracking-tight">로그인</span>
          </button>
        ) : (
          <button 
            onClick={() => logout()}
            className="flex w-full items-center space-x-3 px-4 py-3 text-slate-500 hover:text-rose-400 transition-all rounded-xl hover:bg-rose-500/5 group"
          >
            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold tracking-tight">로그아웃</span>
          </button>
        )}
      </div>
    </div>
  );
};
