'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './login.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // 사용자 프로필 확인 (오류가 발생해도 대시보드로 이동할 수 있도록 처리)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('must_change_password, role')
        .eq('id', data.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('Profile fetch warning:', profileError);
      }

      if (profile?.must_change_password) {
        router.push('/dashboard/change-password');
      } else {
        router.push('/dashboard');
      }
      
      // 로딩 상태를 여기서 명시적으로 끕니다 (이동 전 시각적 피드백)
      setLoading(false);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || '로그인 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <div className={styles.logo}>OM</div>
          <h1 className={styles.title}>환영합니다</h1>
          <p className={styles.subtitle}>조직 관리 시스템에 로그인하세요.</p>
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>이메일</label>
            <input 
              type="email" 
              className={styles.input}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호</label>
            <input 
              type="password" 
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className={styles.footer}>
          아직 회원이 아니신가요? 
          <Link href="/signup" className={styles.link}>기업 회원가입</Link>
        </div>
      </div>
      
      <div className={styles.visualSection}>
        <div className={styles.badge}>Smart Management</div>
        <h2 className={styles.visualTitle}>데이터로 관리하는<br />스마트한 조직 문화</h2>
        <div className={styles.visualOverlay}></div>
      </div>
    </div>
  );
}
