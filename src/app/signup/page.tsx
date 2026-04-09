'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enterpriseSignUp } from '@/lib/auth';
import styles from './signup.module.css';

export default function SignupPage() {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setLoading(false);
      return;
    }

    try {
      await enterpriseSignUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phone: formData.phone,
        companyName: formData.companyName,
        registrationNumber: formData.registrationNumber,
      });

      alert('회원가입이 완료되었습니다! 로그인해 주세요.');
      router.push('/login');
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.signupCard}>
        <div className={styles.header}>
          <div className={styles.logo}>OM</div>
          <h1 className={styles.title}>기업 회원가입</h1>
          <p className={styles.subtitle}>조직 관리를 위한 기업 계정을 생성하세요.</p>
        </div>

        <form onSubmit={handleSignup} className={styles.form}>
          <h2 className={styles.sectionTitle}>관리자 정보</h2>
          
          <div className={styles.inputGroup}>
            <label className={styles.label}>이메일</label>
            <input 
              name="email"
              type="email" 
              className={styles.input}
              placeholder="admin@company.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>비밀번호</label>
              <input 
                name="password"
                type="password" 
                className={styles.input}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>비밀번호 확인</label>
              <input 
                name="confirmPassword"
                type="password" 
                className={styles.input}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>성함</label>
              <input 
                name="fullName"
                type="text" 
                className={styles.input}
                placeholder="홍길동"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>연락처</label>
              <input 
                name="phone"
                type="tel" 
                className={styles.input}
                placeholder="010-0000-0000"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <h2 className={styles.sectionTitle}>기업 정보</h2>

          <div className={styles.inputGroup}>
            <label className={styles.label}>회사명</label>
            <input 
              name="companyName"
              type="text" 
              className={styles.input}
              placeholder="(주) 기업명"
              value={formData.companyName}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>사업자등록번호</label>
            <input 
              name="registrationNumber"
              type="text" 
              className={styles.input}
              placeholder="000-00-00000"
              value={formData.registrationNumber}
              onChange={handleChange}
              required
            />
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? '가입 처리 중...' : '기업 회원가입'}
          </button>
        </form>

        <div className={styles.footer}>
          이미 계정이 있으신가요? 
          <Link href="/login" className={styles.link}>로그인하기</Link>
        </div>
      </div>
      
      <div className={styles.visualSection}>
        <div className={styles.badge}>Onboarding</div>
        <h2 className={styles.visualTitle}>한 번의 가입으로<br />전체 조직을 스마트하게</h2>
        <div className={styles.visualOverlay}></div>
      </div>
    </div>
  );
}
