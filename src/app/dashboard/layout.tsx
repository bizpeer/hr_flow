'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import Sidebar from '@/components/layout/Sidebar';
import styles from '@/components/layout/Layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showRetry, setShowRetry] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    let timer: any;
    if (loading) {
      timer = setTimeout(() => setShowRetry(true), 3000);
    } else {
      setShowRetry(false);
    }

    // 인증 확인이 완료되었고 유저가 없으면 로그인 페이지로 이동
    if (!loading && !user) {
      router.push('/login');
    }

    return () => clearTimeout(timer);
  }, [user, loading, router]);

  // 전역 인증 상태가 로딩 중이거나, 로딩은 끝났지만 유저가 없는 경우(리다이렉트 중) 
  // "인증 확인 중..." 메시지를 유지합니다.
  if (loading || !user) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', gap: '1rem' }}>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>인증 확인 중...</p>
        {showRetry && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>인증 확인이 지연되고 있습니다.</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              페이지 새로고침
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.layoutWrapper}>
      {/* Mobile Header */}
      <header className={styles.mobileHeader}>
        <button className={styles.menuButton} onClick={() => setIsSidebarOpen(true)}>
          ☰
        </button>
        <div className={styles.logoText} style={{ fontSize: '1.1rem' }}>OrgMgt</div>
        <div style={{ width: '40px' }} /> {/* Spacer */}
      </header>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
