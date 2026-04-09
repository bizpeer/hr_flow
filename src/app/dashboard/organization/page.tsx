'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, updateMemberRole, getPayrollHistory, fetchSeveranceEstimate, PayrollRecord } from '@/lib/api';
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>조직 및 멤버 관리</h1>
        <button className={styles.addBtn}>+ 새 멤버 초대</button>
      </div>

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
