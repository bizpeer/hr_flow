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
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  const formatBusinessNumber = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 10)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    let formattedValue = value;
    if (name === 'phone') {
      formattedValue = formatPhone(value);
    } else if (name === 'registrationNumber') {
      formattedValue = formatBusinessNumber(value);
    }
    
    setFormData(prev => ({ ...prev, [name]: formattedValue }));
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
      // 30초 타임아웃 타이머
      const timeoutId = setTimeout(() => {
        if (loading) {
          setLoading(false);
          setError('서버 응답이 너무 늦습니다. 인터넷 연결이나 잠시 후 다시 시도해 주세요.');
        }
      }, 30000);

      await enterpriseSignUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phone: formData.phone,
        companyName: formData.companyName,
        registrationNumber: formData.registrationNumber,
      });
      
      clearTimeout(timeoutId);
      setIsSuccess(true);
      
      // 3초 후 로그인 페이지로 자동 이동
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: unknown) {
      console.error('Signup error:', err);
      const error = err as Error;
      if (error.message?.includes('Database error saving profile')) {
        setError('계정은 생성되었으나 프로필 정보 저장 중 오류가 발생했습니다. 로그인을 시도해 보세요.');
      } else {
        setError(error.message || '회원가입 중 오류가 발생했습니다.');
      }
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

        {isSuccess ? (
          <div className={styles.successView}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.title}>가입을 환영합니다!</h1>
            <p className={styles.subtitle}>
              회원가입이 성공적으로 완료되었습니다.<br />
              잠시 후 로그인 페이지로 이동합니다.
            </p>
            <button 
              onClick={() => router.push('/login')} 
              className={styles.submitBtn}
              style={{ marginTop: '2rem' }}
            >
              지금 로그인하기
            </button>
          </div>
        ) : (
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
                  maxLength={13}
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
                maxLength={12}
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
        )}

        {!isSuccess && (
          <div className={styles.footer}>
            이미 계정이 있으신가요? 
            <Link href="/login" className={styles.link}>로그인하기</Link>
          </div>
        )}
      </div>
      
      <div className={styles.visualSection}>
        <div className={styles.badge}>Onboarding</div>
        <h2 className={styles.visualTitle}>한 번의 가입으로<br />전체 조직을 스마트하게</h2>
        <div className={styles.visualOverlay}></div>
      </div>
    </div>
  );
}
