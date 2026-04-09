'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePassword } from '@/lib/api';
import styles from './change-password.module.css';

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await changePassword(newPassword);
      alert('비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.');
      router.push('/login');
    } catch (err: any) {
      setError(err.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>비밀번호 변경</h1>
        <p className={styles.subtitle}>보안을 위해 임시 비밀번호를 새 비밀번호로 변경해주세요.</p>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>새 비밀번호</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="6자 이상 입력"
            />
          </div>
          <div className={styles.inputGroup}>
            <label>비밀번호 확인</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="비밀번호 재입력"
            />
          </div>
          
          {error && <p className={styles.error}>{error}</p>}
          
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? '변경 중...' : '비밀번호 변경 완료'}
          </button>
        </form>
      </div>
    </div>
  );
}
