'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/layout/Sidebar';
import styles from '@/components/layout/Layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      // alert('대시보드 레이아웃: 세션 확인 중...');
      const { data: { session } } = await supabase.auth.getSession();
      // alert('대시보드 레이아웃: 세션 확인 결과 = ' + !!session);
      
      if (!session) {
        router.push('/login/');
      } else {
        setLoading(false);
      }
    };

    checkUser();

    // 세션 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event === 'SIGNED_OUT') {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
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
