'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const modules = [
  { id: 'expenses', title: '지출결의', icon: '💰', color: '#4d90fe', subtitle: '비용 신청 및 승인', href: '/dashboard/expenses' },
  { id: 'hr', title: '인사관리', icon: '👥', color: '#34a853', subtitle: '조직도 및 정보 관리', href: '/dashboard/hr' },
  { id: 'leaves', title: '휴가관리', icon: '🏖️', color: '#fabb05', subtitle: '잔여일수 및 신청', href: '/dashboard/leaves' },
  { id: 'salary', title: '급여관리', icon: '📝', color: '#ea4335', subtitle: '급여대장 및 명세서', href: '/dashboard/salary' },
];

export default function DashboardPage() {
  const [userName] = useState('사용자');
  const [companyName] = useState('우리 회사');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.welcomeSection}>
          <p className={styles.welcomeText}>안녕하세요, {userName}님!</p>
          <h1 className={styles.companyName}>{companyName}</h1>
        </div>
        <div className={styles.dateDisplay}>
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
      </header>

      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>대기 중인 지출</span>
          <span className={styles.statValue}>3건</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>오늘 휴가자</span>
          <span className={styles.statValue}>1명</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>이번 달 급여일</span>
          <span className={styles.statValue}>D-12</span>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>서비스 바로가기</h2>
        <div className={styles.modulesGrid}>
          {modules.map((module) => (
            <Link key={module.id} href={module.href} className={styles.moduleCard}>
              <div 
                className={styles.moduleIcon} 
                style={{ backgroundColor: `${module.color}15`, color: module.color }}
              >
                {module.icon}
              </div>
              <div className={styles.moduleInfo}>
                <h3 className={styles.moduleTitle}>{module.title}</h3>
                <p className={styles.moduleSubtitle}>{module.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.banner}>
        <div className={styles.bannerContent}>
          <h2 className={styles.bannerTitle}>조직 관리 바로가기</h2>
          <p className={styles.bannerSubtitle}>직원을 관리하고 새로운 멤버를 초대하세요.</p>
        </div>
        <Link href="/dashboard/organization" className={styles.bannerBtn}>
          관리하기 ➔
        </Link>
      </section>
    </div>
  );
}
