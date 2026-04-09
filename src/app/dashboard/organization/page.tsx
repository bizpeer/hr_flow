'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, updateMemberRole, getPayrollHistory, fetchSeveranceEstimate, PayrollRecord, registerStaff } from '@/lib/api';
import styles from './organization.module.css';

export default function OrganizationPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'payroll' | 'severance'>('info');
  const [payrollHistory, setPayrollHistory] = useState<PayrollRecord[]>([]);
  const [severance, setSeverance] = useState<{
    total_days: number;
    avg_daily_wage: number;
    severance_pay: number;
  } | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({
    email: '',
    fullName: '',
    department: '',
    position: '',
  });
  const [tempPassword, setTempPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleOpenDetail = async (member: Profile) => {
    setSelectedMember(member);
    setActiveTab('info');
    
    // Fetch detailed data
    try {
      const history = await getPayrollHistory(member.id);
      setPayrollHistory(history);
      const sev = await fetchSeveranceEstimate(member.id);
      setSeverance(sev);
    } catch (error) {
      console.error('Failed to fetch member details:', error);
    }
  };

  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    const generatedPw = Math.random().toString(36).slice(-10) + '!!';
    
    try {
      // Get current admin's company_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();
        
      if (!profile) throw new Error('Company not found');

      await registerStaff({
        ...newMember,
        tempPassword: generatedPw,
        companyId: profile.company_id,
      });

      setTempPassword(generatedPw);
      fetchMembers();
    } catch (error) {
      console.error('Registration failed:', error);
      alert('직원 등록에 실패했습니다. (Edge Function이 설정되어 있는지 확인해주세요)');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>조직 및 멤버 관리</h1>
        <button 
          className={styles.addBtn}
          onClick={() => {
            setIsRegisterModalOpen(true);
            setTempPassword('');
            setNewMember({ email: '', fullName: '', department: '', position: '' });
          }}
        >
          + 새 멤버 등록
        </button>
      </div>

      {isRegisterModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>신규 직원 등록</h2>
            {!tempPassword ? (
              <form onSubmit={handleRegisterMember}>
                <div className={styles.inputGroup}>
                  <label>이름</label>
                  <input 
                    type="text" 
                    required 
                    value={newMember.fullName}
                    onChange={(e) => setNewMember({...newMember, fullName: e.target.value})}
                    placeholder="성함 입력"
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>이메일</label>
                  <input 
                    type="email" 
                    required 
                    value={newMember.email}
                    onChange={(e) => setNewMember({...newMember, email: e.target.value})}
                    placeholder="example@company.com"
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.inputGroup}>
                    <label>부서</label>
                    <input 
                      type="text" 
                      value={newMember.department}
                      onChange={(e) => setNewMember({...newMember, department: e.target.value})}
                      placeholder="부서명"
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>직급</label>
                    <input 
                      type="text" 
                      value={newMember.position}
                      onChange={(e) => setNewMember({...newMember, position: e.target.value})}
                      placeholder="직급명"
                    />
                  </div>
                </div>
                <div className={styles.modalActions}>
                  <button type="button" onClick={() => setIsRegisterModalOpen(false)} className={styles.cancelBtn}>취소</button>
                  <button type="submit" disabled={isRegistering} className={styles.submitBtn}>
                    {isRegistering ? '등록 중...' : '등록 및 임시비밀번호 발급'}
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.successContent}>
                <p className={styles.successMsg}>직원 등록이 완료되었습니다!</p>
                <div className={styles.tempPwBox}>
                  <label>임시 비밀번호</label>
                  <div className={styles.pwValue}>{tempPassword}</div>
                </div>
                <p className={styles.notice}>직원이 첫 로그인 시 위 비밀번호를 사용하고 반드시 변경하도록 안내해 주세요.</p>
                <button onClick={() => setIsRegisterModalOpen(false)} className={styles.closeBtn}>닫기</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.mainGrid}>
        <aside className={styles.memberList}>
          <div className={styles.listHeader}>멤버 목록 ({members.length})</div>
          {loading ? (
            <div className={styles.loading}>로딩 중...</div>
          ) : (
            members.map((member) => (
              <div 
                key={member.id} 
                className={`${styles.memberItem} ${selectedMember?.id === member.id ? styles.active : ''}`}
                onClick={() => handleOpenDetail(member)}
              >
                <div className={styles.avatar}>{member.full_name[0]}</div>
                <div className={styles.memberInfo}>
                  <p className={styles.memberName}>{member.full_name}</p>
                  <p className={styles.memberRole}>{member.role === 'admin' ? '관리자' : '직원'}</p>
                </div>
              </div>
            ))
          )}
        </aside>

        <section className={styles.detailContainer}>
          {selectedMember ? (
            <div className={styles.detailContent}>
              <div className={styles.detailHeader}>
                <div className={styles.detailAvatar}>{selectedMember.full_name[0]}</div>
                <div>
                  <h2 className={styles.detailName}>{selectedMember.full_name}</h2>
                  <p className={styles.detailEmail}>{selectedMember.id}</p> {/* Replace with email if available */}
                </div>
              </div>

              <div className={styles.tabs}>
                <button 
                  className={`${styles.tab} ${activeTab === 'info' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('info')}
                >
                  기본 정보
                </button>
                <button 
                  className={`${styles.tab} ${activeTab === 'payroll' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('payroll')}
                >
                  급여 내역
                </button>
                <button 
                  className={`${styles.tab} ${activeTab === 'severance' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('severance')}
                >
                  퇴직금
                </button>
              </div>

              <div className={styles.tabContent}>
                {activeTab === 'info' && (
                  <div className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                      <label>부서</label>
                      <input type="text" value={selectedMember.department || '-'} readOnly />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>직급</label>
                      <input type="text" value={selectedMember.position || '-'} readOnly />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>권한</label>
                      <select value={selectedMember.role} onChange={async (e) => {
                        await updateMemberRole(selectedMember.id, e.target.value);
                        fetchMembers();
                      }}>
                        <option value="member">직원 (Member)</option>
                        <option value="admin">관리자 (Admin)</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeTab === 'payroll' && (
                  <div className={styles.payrollList}>
                    {payrollHistory.length === 0 ? (
                      <p className={styles.empty}>지급 내역이 없습니다.</p>
                    ) : (
                      payrollHistory.map((item) => (
                        <div key={item.id} className={styles.payrollItem}>
                          <span>{item.period_end}</span>
                          <span className={styles.payrollAmount}>₩{item.net_pay.toLocaleString()}</span>
                          <button className={styles.printBtn}>명세서 출력</button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'severance' && (
                  <div className={styles.severanceCard}>
                    <h3 className={styles.sevTitle}>예상 퇴직금 추산</h3>
                    <div className={styles.sevGrid}>
                      <div className={styles.sevItem}>
                        <span>총 재직일수</span>
                        <strong>{severance?.total_days || 0}일</strong>
                      </div>
                      <div className={styles.sevItem}>
                        <span>평균임금(1일)</span>
                        <strong>₩{severance?.avg_daily_wage?.toLocaleString() || 0}</strong>
                      </div>
                      <div className={`${styles.sevItem} ${styles.totalHighlight}`}>
                        <span>예상 퇴직금</span>
                        <strong>₩{severance?.severance_pay?.toLocaleString() || 0}</strong>
                      </div>
                    </div>
                    <p className={styles.notice}>* 최근 3개월 급여 데이터를 기반으로 산출되었습니다.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🏢</div>
              <p>멤버를 선택하여 상세 정보를 확인하세요.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
