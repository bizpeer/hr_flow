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
    
    // 인증 체크 로딩이 너무 길어질 경우 대비
    if (loading) {
      timer = setTimeout(() => setShowRetry(true), 5000);
    } else {
      setShowRetry(false);
    }

    // 로딩이 끝났는데 유저가 없으면 로그인으로 리다이렉트
    if (!loading && !user) {
      console.log('No user session found, redirecting to login');
      router.replace('/login');
    }

    return () => clearTimeout(timer);
  }, [user, loading, router]);

  // 로딩 중이거나 유저 세션이 아직 도달하지 않은 경우 대기 화면 표시
  if (loading || (!user && typeof window !== 'undefined')) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', gap: '1rem', fontFamily: 'sans-serif' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: '500' }}>보안 세션 확인 중...</p>
        {showRetry && (
          <div style={{ textAlign: 'center', marginTop: '1rem', animation: 'fadeIn 0.5s ease' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>인증 확인이 지연되고 있습니다.</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ padding: '0.6rem 1.2rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.75rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            >
              새로고침
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
