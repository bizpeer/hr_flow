'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    checkSession();
  }, [router]);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>OrgMgt</div>
        <nav className={styles.nav}>
          <Link href="#features">주요 기능</Link>
          <Link href="#about">서비스 소개</Link>
          <Link href="/login">시작하기</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.badge}>Next Generation Admin System</span>
          <h1 className={styles.title}>
            스마트한 조직 관리의<br />새로운 기준
          </h1>
          <p className={styles.subtitle}>
            복잡한 인사 행정부터 조직도 시각화까지,<br /> 
            모든 것을 하나의 플랫폼에서 직관적으로 관리하세요.
          </p>
          <div className={styles.ctas}>
            <Link href="/login" className={styles.btnPrimary}>
              무료로 시작하기
            </Link>
            <Link href="#features" className={styles.btnSecondary}>
              기능 더보기
            </Link>
          </div>
        </section>

        <section id="features" className={styles.features}>
          <div className={styles.featureCard}>
            <div className={styles.iconWrapper}>👤</div>
            <h3>사원 통합 관리</h3>
            <p>직원의 기본 정보부터 경력, 기술 스택까지 체계적으로 관리하고 실시간으로 업데이트하세요.</p>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.iconWrapper}>📊</div>
            <h3>인터랙티브 조직도</h3>
            <p>드래그 앤 드롭으로 부서 구조를 변경하고, 조직의 레이아웃을 한눈에 시각화하세요.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.iconWrapper}>📱</div>
            <h3>모바일 완벽 연동</h3>
            <p>Expo 기반의 모바일 앱과 실시간으로 데이터를 동기화하여 언제 어디서나 접속 가능합니다.</p>
          </div>
        </section>
      </main>

      <footer className={styles.container} style={{ padding: '4rem 0', textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          © 2026 BizPeer Organization Management System. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
