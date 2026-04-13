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
  const [deleteConfirmCompany, setDeleteConfirmCompany] = useState<Company | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [pwResetUser, setPwResetUser] = useState<Profile | null>(null);
  const [pwResetStep, setPwResetStep] = useState(1);
  const [adminVerifyPw, setAdminVerifyPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
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

  const handleStartReset = (user: Profile) => {
    setPwResetUser(user);
    setPwResetStep(1);
    setAdminVerifyPw('');
    setNewPw('');
    setNewPwConfirm('');
    setResetError('');
  };

  const handleVerifyAdmin = async () => {
    if (!adminVerifyPw) {
      setResetError('관리자 비밀번호를 입력해 주세요.');
      return;
    }

    setIsResetting(true);
    setResetError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증 정보가 없습니다.');

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: adminVerifyPw,
      });

      if (authError) {
        throw new Error('관리자 비밀번호가 일치하지 않습니다.');
      }

      setPwResetStep(2);
    } catch (error: any) {
      setResetError(error.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleFinalReset = async () => {
    if (!newPw || !newPwConfirm) {
      setResetError('비밀번호를 모두 입력해 주세요.');
      return;
    }

    if (newPw !== newPwConfirm) {
      setResetError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPw.length < 6) {
      setResetError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsResetting(true);
    setResetError('');
    try {
      if (!pwResetUser) return;
      await adminResetPassword(pwResetUser.id, newPw);
      alert(`${pwResetUser.full_name} 사용자의 비밀번호가 성공적으로 초기화되었습니다.`);
      setPwResetUser(null);
    } catch (error: any) {
      setResetError('비밀번호 초기화 중 오류가 발생했습니다: ' + (error.message || '알 수 없는 오류'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deleteConfirmCompany) return;
    if (!adminPassword) {
      alert('관리자 비밀번호를 입력해 주세요.');
      return;
    }

    setIsDeleting(true);
    try {
      // 1. 관리자 권한 최종 확인 (비밀번호 재검증)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증 정보가 없습니다.');

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: adminPassword,
      });

      if (authError) {
        alert('관리자 보안 인증에 실패했습니다.');
        setIsDeleting(false);
        return;
      }

      // 2. 통합 삭제 API 호출 (인증 계정 + DB 데이터)
      console.log(`Starting full deletion for company: ${deleteConfirmCompany.name}`);
      await adminDeleteCompany(deleteConfirmCompany.id);
      
      alert(`[${deleteConfirmCompany.name}] 기업과 관련된 모든 인증 계정 및 데이터가 영구적으로 삭제되었습니다.`);
      setDeleteConfirmCompany(null);
      setAdminPassword('');
      loadData();
    } catch (error: any) {
      console.error('Full delete failed:', error);
      alert('삭제 중 치명적인 오류가 발생했습니다: ' + (error.message || '알 수 없는 오류'));
    } finally {
      setIsDeleting(false);
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
                  <button 
                    onClick={() => setDeleteConfirmCompany(company)} 
                    className={`${styles.actionBtn} ${styles.btnDanger}`}
                    title="기업 데이터 완전 삭제"
                  >
                    삭제 🗑️
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
                    onClick={() => handleStartReset(user)}
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

      {/* 기업 삭제 확인 모달 */}
      {deleteConfirmCompany && (
        <div className={styles.modalOverlay} onClick={() => !isDeleting && setDeleteConfirmCompany(null)}>
          <div className={`${styles.modal} ${styles.dangerModal}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className="text-red-600">⚠️ 기업 데이터 영구 삭제</h2>
              <button onClick={() => setDeleteConfirmCompany(null)} disabled={isDeleting}>❌</button>
            </div>
            
            <div className={styles.modalBody}>
              <p className={styles.warningText}>
                <strong>[{deleteConfirmCompany.name}]</strong> 기업과 관련된 모든 데이터(부서, 팀, 직원 계정, 결재 내역, 급여 기록)가 <strong>영구적으로 삭제</strong>됩니다.
                이 작업은 되돌릴 수 없습니다.
              </p>
              
              <div className={styles.confirmSection}>
                <label className={styles.label}>최종 확인을 위해 시스템 관리자 비밀번호를 입력하세요:</label>
                <input 
                  type="password"
                  className={styles.input}
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="시스템 관리자 비밀번호"
                  disabled={isDeleting}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button 
                onClick={() => setDeleteConfirmCompany(null)} 
                className={styles.cancelBtn}
                disabled={isDeleting}
              >
                취소
              </button>
              <button 
                onClick={handleDeleteCompany} 
                className={styles.deleteBtn}
                disabled={isDeleting || !adminPassword}
              >
                {isDeleting ? '삭제 중...' : '데이터 완전 삭제 수행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {pwResetUser && (
        <div className={styles.modalOverlay} onClick={() => !isResetting && setPwResetUser(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className="text-xl font-bold">비밀번호 초기화</h2>
              <button 
                onClick={() => setPwResetUser(null)} 
                disabled={isResetting}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.resetUserInfo}>
                <span className={styles.targetLabel}>대상 사용자:</span>
                <span className={styles.targetName}>{pwResetUser.full_name}</span>
                <span className={styles.targetEmail}>({pwResetUser.email})</span>
              </div>

              <div className={styles.stepIndicator}>
                <div className={`${styles.step} ${pwResetStep >= 1 ? styles.stepActive : ''}`}>1. 관리자 확인</div>
                <div className={styles.stepDivider}></div>
                <div className={`${styles.step} ${pwResetStep >= 2 ? styles.stepActive : ''}`}>2. 새 비밀번호 설정</div>
              </div>

              {pwResetStep === 1 ? (
                <div className={styles.formSection}>
                  <p className={styles.helpText}>사용자 비밀번호 초기화를 위해 시스템 관리자(bizpeer@gmail.com)의 비밀번호를 다시 확인합니다.</p>
                  <label className={styles.label}>시스템 관리자 비밀번호</label>
                  <input 
                    type="password"
                    className={styles.input}
                    value={adminVerifyPw}
                    onChange={e => setAdminVerifyPw(e.target.value)}
                    placeholder="관리자 비밀번호 입력"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleVerifyAdmin()}
                  />
                </div>
              ) : (
                <div className={styles.formSection}>
                  <p className={styles.helpText}>대상 사용자에게 부여할 새로운 비밀번호를 입력해 주세요.</p>
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>새 비밀번호</label>
                    <input 
                      type="password"
                      className={styles.input}
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder="최소 6자 이상"
                      autoFocus
                    />
                  </div>
                  <div className={styles.inputGroup} style={{ marginTop: '1rem' }}>
                    <label className={styles.label}>새 비밀번호 확인</label>
                    <input 
                      type="password"
                      className={styles.input}
                      value={newPwConfirm}
                      onChange={e => setNewPwConfirm(e.target.value)}
                      placeholder="비밀번호 재입력"
                      onKeyDown={e => e.key === 'Enter' && handleFinalReset()}
                    />
                  </div>
                </div>
              )}

              {resetError && <div className={styles.errorMessage} style={{ marginTop: '1rem', color: '#c62828', fontSize: '0.875rem' }}>{resetError}</div>}
            </div>

            <div className={styles.modalFooter}>
              <button 
                onClick={() => setPwResetUser(null)} 
                className={styles.cancelBtn}
                disabled={isResetting}
              >
                취소
              </button>
              {pwResetStep === 1 ? (
                <button 
                  onClick={handleVerifyAdmin} 
                  className={styles.actionBtn}
                  disabled={isResetting || !adminVerifyPw}
                >
                  {isResetting ? '확인 중...' : '다음 단계'}
                </button>
              ) : (
                <button 
                  onClick={handleFinalReset} 
                  className={`${styles.actionBtn} ${styles.btnDanger}`}
                  disabled={isResetting || !newPw || !newPwConfirm}
                >
                  {isResetting ? '처리 중...' : '비밀번호 변경 완료'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
