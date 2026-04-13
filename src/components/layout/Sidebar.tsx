'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import styles from './Layout.module.css';

const commonMenuItems = [
  { id: 'dashboard', title: '대시보드', icon: '🏠', href: '/dashboard' },
  { id: 'leaves', title: '내 휴가 및 근태', icon: '🏖️', href: '/dashboard/leaves' },
  { id: 'expenses', title: '지출결의 신청', icon: '💰', href: '/dashboard/expenses' },
  { id: 'announcements', title: '공지사항 게시판', icon: '📢', href: '/dashboard' },
  { id: 'certificates', title: '증명서 발급', icon: '📄', href: '/dashboard/certificates' },
];

const managementMenuItems = [
  { id: 'approvals', title: '결재/승인 관리함', icon: '🛡️', href: '/dashboard/approvals' },
  { id: 'organization', title: '조직관리', icon: '🏢', href: '/dashboard/organization' },
  { id: 'payroll', title: '급여 및 연봉 관리', icon: '💵', href: '/dashboard/payroll' },
  { id: 'expenses-all', title: '지출결의 통합 조회', icon: '📊', href: '/dashboard/expenses' },
  { id: 'hr', title: '인사관리', icon: '👥', href: '/dashboard/hr' },
  { id: 'settings', title: '시스템 설정', icon: '⚙️', href: '/dashboard/settings' },
];

const systemMenuItems = [
  { id: 'system-dashboard', title: '시스템 현황', icon: '📊', href: '/dashboard/system' },
  { id: 'companies', title: '기업 관리', icon: '🏢', href: '/dashboard/system' },
  { id: 'all-users', title: '전체 사용자', icon: '👥', href: '/dashboard/system' },
  { id: 'settings-global', title: '시스템 설정', icon: '⚙️', href: '/dashboard/system' },
];

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useAuth();

  const role = (profile?.role || 'member').toString().trim().toLowerCase();
  const isSystemAdmin = role === 'system_admin';
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isSubAdmin = role === 'sub_admin';
  const isMember = role === 'member' && !isSystemAdmin && !isSuperAdmin && !isAdmin && !isSubAdmin;

  const userData = {
    email: user?.email,
    name: profile?.full_name || user?.email?.split('@')[0] || '사용자',
    role: isSystemAdmin ? '시스템 관리자' : 
          isSuperAdmin ? '최고 관리자' : 
          isAdmin ? '기업 관리자' :
          isSubAdmin ? '보조 관리자' : '일반 직원',
    companyName: isSystemAdmin ? '시스템관리자' : 
                (profile as any)?.companies?.name || '회사 정보 없음',
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const getCommonMenu = () => {
    if (isSystemAdmin) return [];
    const menu = [...commonMenuItems];
    if (isMember) {
      menu.push({ id: 'approvals-track', title: '내 결재 진행상태', icon: '📋', href: '/dashboard/approvals' });
    }
    return menu;
  };

  const getManagementMenu = () => {
    if (isSystemAdmin) return systemMenuItems;
    
    if (isSuperAdmin || isAdmin) {
      return managementMenuItems;
    }
    
    if (isSubAdmin) {
      return managementMenuItems.filter(i => ['approvals', 'expenses-all'].includes(i.id));
    }
    
    return [];
  };

  const commonMenu = getCommonMenu();
  const managementMenu = getManagementMenu();

  return (
    <>
      <div 
        className={`${styles.overlay} ${isOpen ? styles.show : ''}`} 
        onClick={onClose}
      />
      
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>HF</div>
          <span className={styles.logoText}>HR FLOW</span>
          {isOpen && (
            <button onClick={onClose} style={{ marginLeft: 'auto', fontSize: '1.2rem' }} className="lg:hidden">
              ✕
            </button>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto w-full ${styles.nav}`}>
          {/* 공통 메뉴 (system_admin 제외) */}
          {commonMenu.length > 0 && (
            <div className="mb-8 w-full">
              {commonMenu.map((item) => (
                <Link 
                  key={item.id} 
                  href={item.href}
                  className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                  onClick={onClose}
                >
                  <span className={styles.icon}>{item.icon}</span>
                  <span className={styles.title}>{item.title}</span>
                </Link>
              ))}
            </div>
          )}

          {/* 시스템 관리자용 메인 라벨 */}
          {isSystemAdmin && (
            <div className="px-6 mb-2">
              <p className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">System Admin</p>
            </div>
          )}

          {/* 관리자 및 시스템 메뉴 영역 */}
          {managementMenu.length > 0 && (
            <div className="w-full">
              {!isSystemAdmin && (
                <div className="px-6 mb-3 mt-4">
                  <p className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">Management</p>
                </div>
              )}
              {managementMenu.map((item) => (
                <Link 
                  key={item.id} 
                  href={item.href}
                  className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                  onClick={onClose}
                >
                  <span className={styles.icon}>{item.icon}</span>
                  <span className={styles.title}>{item.title}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userSection}>
            <div className={styles.avatar}>{userData.name?.[0] || 'U'}</div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{userData.companyName}</p>
              <p className={styles.userRole}>{userData.role}</p>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout} title="로그아웃">
              🚪
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
