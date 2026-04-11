'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import styles from './Layout.module.css';

const menuItems = [
  { id: 'dashboard', title: '대시보드', icon: '🏠', href: '/dashboard' },
  { id: 'approvals', title: '결재 센터', icon: '🛡️', href: '/dashboard/approvals' },
  { id: 'expenses', title: '지출결의', icon: '💰', href: '/dashboard/expenses' },
  { id: 'leaves', title: '휴가관리', icon: '🏖️', href: '/dashboard/leaves' },
  { id: 'payroll', title: '급여 관리', icon: '💵', href: '/dashboard/payroll' },
  { id: 'organization', title: '조직관리', icon: '🏢', href: '/dashboard/organization' },
];

const systemMenuItems = [
  { id: 'system-dashboard', title: '시스템 현황', icon: '📊', href: '/dashboard/system' },
  { id: 'companies', title: '기업 관리', icon: '🏢', href: '/dashboard/system' },
  { id: 'all-users', title: '전체 사용자', icon: '👥', href: '/dashboard/system' },
  { id: 'settings', title: '시스템 설정', icon: '⚙️', href: '/dashboard/system' },
];

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useAuth();

  const isSystemAdmin = user?.email === 'bizpeer@gmail.com';
  const role = profile?.role || 'member';
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isSubAdmin = role === 'sub_admin';

  const userData = {
    email: user?.email,
    name: profile?.full_name || user?.email?.split('@')[0] || '사용자',
    role: isSystemAdmin ? '시스템 관리자' : 
          isSuperAdmin ? '최고 관리자' : 
          isAdmin ? '기업 관리자' :
          isSubAdmin ? '보조 관리자' : '직원',
    companyName: isSystemAdmin ? '시스템관리자' : 
                (profile as any)?.companies?.name || '회사 정보 없음',
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`${styles.overlay} ${isOpen ? styles.show : ''}`} 
        onClick={onClose}
      />
      
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>OM</div>
          <span className={styles.logoText}>OrgMgt</span>
          {isOpen && (
            <button onClick={onClose} style={{ marginLeft: 'auto', fontSize: '1.2rem' }} className="lg:hidden">
              ✕
            </button>
          )}
        </div>

        <nav className={styles.nav}>
          {(isSystemAdmin ? systemMenuItems : menuItems).map((item) => (
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
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userSection}>
            <div className={styles.avatar}>{userData.name?.[0] || 'U'}</div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{userData.companyName}</p>
              <p className={styles.userRole}>{userData.name}</p>
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
