'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './reset-password.module.css';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 세션 확인 (메일 링크를 통해 들어왔다면 세션이 설정되어 있어야 함)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // 세션이 없으면 로그인 페이지로 이동 (또는 에러 표시)
        // 하지만 Supabase Auth 리다이렉트는 즉시 세션을 설정하므로 보통은 존재함
      }
    };
    checkSession();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;
      
      setSuccess(true);
      // 3초 후 로그인 페이지로 이동
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.title}>변경 완료</h1>
            <p className={styles.subtitle}>
              비밀번호가 성공적으로 변경되었습니다.<br />
              잠시 후 로그인 페이지로 이동합니다.
            </p>
            <Link href="/login/" className={styles.backBtn}>
              로그인 페이지로 가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>OM</div>
          <h1 className={styles.title}>비밀번호 재설정</h1>
          <p className={styles.subtitle}>
            안전을 위해 새로운 비밀번호를 설정해 주세요.
          </p>
        </div>

        <form onSubmit={handleReset} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>새 비밀번호</label>
            <input 
              type="password" 
              className={styles.input}
              placeholder="6자 이상 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>비밀번호 확인</label>
            <input 
              type="password" 
              className={styles.input}
              placeholder="한 번 더 입력"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? '변경 중...' : '비밀번호 변경하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
