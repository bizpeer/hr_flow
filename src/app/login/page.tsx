'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './login.module.css';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'change-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      if (data.session) {
        // 즉시 대시보드로 이동 시도
        router.push('/dashboard');
        
        // Next.js 라우터가 반응하지 않을 경우를 대비한 즉각적인 하드 리다이렉트
        setTimeout(() => {
          if (window.location.pathname.includes('/login')) {
            window.location.href = '/dashboard';
          }
        }, 100);
      }
    } catch (err: any) {
      setError(err.message || '로그인 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('신규 비밀번호가 일치하지 않습니다.');
      setLoading(false);
      return;
    }

    try {
      // 1. 기존 비밀번호 확인을 위해 로그인 시도
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) throw new Error('기존 비밀번호가 올바르지 않습니다.');

      // 2. 비밀번호 업데이트
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // 3. 보안을 위해 로그아웃 처리
      await supabase.auth.signOut();
      
      setMessage('비밀번호가 성공적으로 변경되었습니다. 새로운 비밀번호로 로그인해 주세요.');
      setMode('login');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
    } catch (err: any) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <div className={styles.logo}>OM</div>
          <h1 className={styles.title}>
            {mode === 'login' ? '환영합니다' : '비밀번호 변경'}
          </h1>
          <p className={styles.subtitle}>
            {mode === 'login' 
              ? '조직 관리 시스템에 로그인하세요.' 
              : '계정 확인을 위해 기존 비밀번호와 신규 비밀번호를 입력하세요.'}
          </p>
        </div>

        {message && <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#ecfdf5', color: '#047857', borderRadius: '8px', fontSize: '0.9rem', border: '1px solid #d1fae5' }}>{message}</div>}

        {mode === 'login' ? (
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

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>

            <div className={styles.linkContainer}>
              <button 
                type="button" 
                className={styles.link} 
                onClick={() => { setMode('change-password'); setError(''); setMessage(''); }}
              >
                비밀번호를 잊으셨나요? (비밀번호 변경)
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePasswordChange} className={styles.form}>
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
              <label className={styles.label}>기존 비밀번호</label>
              <input 
                type="password" 
                className={styles.input}
                placeholder="현재 비밀번호"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>신규 비밀번호</label>
              <input 
                type="password" 
                className={styles.input}
                placeholder="새로운 비밀번호"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>신규 비밀번호 확인</label>
              <input 
                type="password" 
                className={styles.input}
                placeholder="새로운 비밀번호 확인"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && <div className={styles.errorMessage}>{error}</div>}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? '변경 중...' : '비밀번호 변경 완료'}
            </button>

            <div className={styles.linkContainer}>
              <button 
                type="button" 
                className={styles.link} 
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              >
                로그인 화면으로 돌아가기
              </button>
            </div>
          </form>
        )}

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
