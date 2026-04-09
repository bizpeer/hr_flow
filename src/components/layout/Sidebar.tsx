'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './Layout.module.css';

const menuItems = [
  { id: 'dashboard', title: '대시보드', icon: '🏠', href: '/dashboard' },
  { id: 'expenses', title: '지출결의', icon: '💰', href: '/dashboard/expenses' },
  { id: 'hr', title: '인사관리', icon: '👥', href: '/dashboard/hr' },
  { id: 'leaves', title: '휴가관리', icon: '🏖️', href: '/dashboard/leaves' },
  { id: 'organization', title: '조직관리', icon: '🏢', href: '/dashboard/organization' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userSection}>
          <div className={styles.avatar}>U</div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>사용자</p>
            <p className={styles.userRole}>관리자</p>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="로그아웃">
            🚪
          </button>
        </div>
      </div>
    </aside>
  );
}
