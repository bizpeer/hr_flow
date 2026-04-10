'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './Layout.module.css';

const menuItems = [
  { id: 'dashboard', title: '대시보드', icon: '🏠', href: '/dashboard' },
  { id: 'approvals', title: '결재 센터', icon: '🛡️', href: '/dashboard/approvals' },
  { id: 'expenses', title: '지출결의', icon: '💰', href: '/dashboard/expenses' },
  { id: 'leaves', title: '휴가관리', icon: '🏖️', href: '/dashboard/leaves' },
  { id: 'payroll', title: '급여 관리', icon: '💵', href: '/dashboard/payroll' },
  { id: 'organization', title: '조직관리', icon: '🏢', href: '/dashboard/organization' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userData, setUserData] = useState<{ email?: string; name: string; role: string }>({
    name: '사용자',
    role: '멤버',
  });

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single();
        
        const isSystemAdmin = user.email === 'bizpeer@gmail.com';
        
        setUserData({
          email: user.email,
          name: profile?.full_name || '사용자',
          role: isSystemAdmin ? 'System Admin' : (profile?.role === 'ADMIN' ? '기업 관리자' : '직원'),
        });
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>OM</div>
        <span className={styles.logoText}>OrgMgt</span>
      </div>

      <nav className={styles.nav}>
        {menuItems.map((item) => (
          <Link 
            key={item.id} 
            href={item.href}
            className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.title}>{item.title}</span>
          </Link>
        ))}
        {userData.email === 'bizpeer@gmail.com' && (
          <Link 
            href="/dashboard/system" 
            className={`${styles.navItem} ${pathname === '/dashboard/system' ? styles.active : ''}`}
            style={{ marginTop: 'auto', borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}
          >
            <span className={styles.icon}>⚙️</span>
            <span className={styles.title}>시스템 설정</span>
          </Link>
        )}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userSection}>
          <div className={styles.avatar}>{userData.name?.[0] || 'U'}</div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{userData.name}</p>
            <p className={styles.userRole}>{userData.role}</p>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="로그아웃">
            🚪
          </button>
        </div>
      </div>
    </aside>
  );
}
