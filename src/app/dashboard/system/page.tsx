'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  getAllCompaniesWithStats, 
  updateCompanySettings, 
  fetchCompanyUsers, 
  adminResetPassword,
  Company,
  Profile
} from '@/lib/api';
import styles from './system.module.css';

export default function SystemAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<Profile[]>([]);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.email !== 'bizpeer@gmail.com') {
        router.push('/dashboard');
      } else {
        setIsAuthorized(true);
        loadData();
      }
    };
    checkAuth();
  }, [router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAllCompaniesWithStats();
      setCompanies(data);
    } catch (error) {
      console.error('Failed to load companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (company: Company) => {
    const newStatus = company.status === 'active' ? 'suspended' : 'active';
    if (!confirm(`기업 [${company.name}]의 상태를 ${newStatus === 'active' ? '정상' : '사용 중지'}로 변경하시겠습니까?`)) return;
    
    try {
      await updateCompanySettings(company.id, { status: newStatus });
      loadData();
    } catch (error) {
      alert('상태 변경에 실패했습니다.');
    }
  };

  const handleTogglePlan = async (company: Company) => {
    const newPlan = company.plan === 'free' ? 'paid' : 'free';
    try {
      await updateCompanySettings(company.id, { plan: newPlan });
      loadData();
    } catch (error) {
      alert('플랜 변경에 실패했습니다.');
    }
  };

  const handleShowUsers = async (company: Company) => {
    setSelectedCompany(company);
    try {
      const users = await fetchCompanyUsers(company.id);
      setCompanyUsers(users);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleResetPassword = async (user: Profile) => {
    const tempPw = Math.random().toString(36).slice(-8) + '!';
    if (!confirm(`[${user.full_name}] 사용자의 비밀번호를 초기화하시겠습니까?`)) return;
    
    try {
      // API에서 Edge Function 호출
      await adminResetPassword(user.id, tempPw);
      alert(`비밀번호가 초기화되었습니다.\n새 임시 비밀번호: ${tempPw}`);
    } catch (error) {
      console.error('Reset failed:', error);
      alert('비밀번호 초기화에 실패했습니다. (관리자 권한 Edge Function 필요)');
    }
  };

  if (!isAuthorized) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>시스템 마스터 관리</h1>
        <button onClick={loadData} className={styles.actionBtn}>새로고침 🔄</button>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>총 가입 기업</span>
          <span className={styles.statValue}>{companies.length}개</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>총 등록 사용자</span>
          <span className={styles.statValue}>
            {companies.reduce((acc, curr) => acc + (curr.user_count || 0), 0)}명
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>유료 서비스 이용</span>
          <span className={styles.statValue}>
            {companies.filter(c => c.plan === 'paid').length}개사
          </span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>기업명 / 가입일</th>
              <th>사용자 수</th>
              <th>서비스 플랜</th>
              <th>계정 상태</th>
              <th>관리 작업</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>
                  <div className={styles.companyName}>{company.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {new Date(company.created_at).toLocaleDateString()}
                  </div>
                </td>
                <td>{company.user_count}명</td>
                <td>
                  <span className={`${styles.badge} ${company.plan === 'paid' ? styles.badgePaid : styles.badgeFree}`}>
                    {company.plan === 'paid' ? '유료 (Paid)' : '무료 (Free)'}
                  </span>
                </td>
                <td>
                  <span className={`${styles.badge} ${company.status === 'active' ? styles.badgeActive : styles.badgeSuspended}`}>
                    {company.status === 'active' ? '정상' : '중지'}
                  </span>
                </td>
                <td className={styles.actions}>
                  <button onClick={() => handleTogglePlan(company)} className={styles.actionBtn}>
                    {company.plan === 'paid' ? '무료 전환' : '유료 전환'}
                  </button>
                  <button onClick={() => handleToggleStatus(company)} className={`${styles.actionBtn} ${company.status === 'active' ? styles.btnDanger : styles.btnSuccess}`}>
                    {company.status === 'active' ? '사용 중지' : '중지 해제'}
                  </button>
                  <button onClick={() => handleShowUsers(company)} className={styles.actionBtn}>
                    유저 관리 👤
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCompany && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCompany(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2>[{selectedCompany.name}] 사용자 관리</h2>
              <button onClick={() => setSelectedCompany(null)}>❌</button>
            </div>
            
            <div className={styles.userList}>
              {companyUsers.map(user => (
                <div key={user.id} className={styles.userItem}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{user.full_name}</span>
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>({user.role})</span>
                  </div>
                  <button 
                    onClick={() => handleResetPassword(user)}
                    className={`${styles.actionBtn} ${styles.btnDanger}`}
                  >
                    패스워드 초기화
                  </button>
                </div>
              ))}
              {companyUsers.length === 0 && <p>등록된 사용자가 없습니다.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
