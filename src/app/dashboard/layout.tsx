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

  useEffect(() => {
    // 인증 확인이 완료되었고 유저가 없으면 로그인 페이지로 이동
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // 전역 인증 상태가 로딩 중이거나, 로딩은 끝났지만 유저가 없는 경우(리다이렉트 중) 
  // "인증 확인 중..." 메시지를 유지합니다.
  if (loading || !user) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>인증 확인 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.layoutWrapper}>
      <Sidebar />
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
