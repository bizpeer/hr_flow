'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enterpriseSignUp } from '@/lib/auth';
import styles from './signup.module.css';

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    companyName: '',
    registrationNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      await enterpriseSignUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phone: formData.phone,
        companyName: formData.companyName,
        registrationNumber: formData.registrationNumber,
      });

      alert('가입이 완료되었습니다! 로그인 페이지로 이동합니다.');
      router.push('/login');
    } catch (err: any) {
      setError(err.message || '가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.signupCard}>
        <div className={styles.header}>
          <Link href="/login" className={styles.backLink}>← 로그인으로 돌아가기</Link>
          <h1 className={styles.title}>기업 회원가입</h1>
          <p className={styles.subtitle}>회사 정보를 입력하여 시스템을 시작하세요.</p>
        </div>

        <form onSubmit={handleSignUp} className={styles.form}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>관리자 정보</h3>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label>이메일</label>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="name@company.com"
                  required 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>성함</label>
                <input 
                  type="text" 
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="홍길동"
                  required 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>비밀번호</label>
                <input 
                  type="password" 
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  required 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>비밀번호 확인</label>
                <input 
                  type="password" 
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  required 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>전화번호</label>
                <input 
                  type="tel" 
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="010-0000-0000"
                  required 
                />
              </div>
            </div>
          </section>

          <div className={styles.divider} />

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>기업 정보</h3>
            <div className={styles.grid}>
              <div className={styles.inputGroup}>
                <label>회사명</label>
                <input 
                  type="text" 
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  placeholder="(주) 비즈피어"
                  required 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>사업자등록번호</label>
                <input 
                  type="text" 
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleInputChange}
                  placeholder="000-00-00000"
                  required 
                />
              </div>
            </div>
          </section>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? '가입 처리 중...' : '기업 회원가입 완료'}
          </button>
        </form>
      </div>
    </div>
  );
}
