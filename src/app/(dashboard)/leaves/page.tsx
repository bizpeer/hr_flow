'use client';

import { useState, useEffect } from 'react';
import { getLeaves, createLeave, Leave } from '@/lib/api';
import styles from './leaves.module.css';

export default function LeavesPage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // New Leave Form State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [type, setType] = useState('연차');
  const [reason, setReason] = useState('');

  const fetchLeaves = async () => {
    try {
      // For demo, using a dummy company ID.
      const data = await getLeaves('company-123');
      setLeaves(data);
    } catch (error) {
      console.error('Failed to fetch leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createLeave({
        start_date: startDate,
        end_date: endDate,
        type,
        reason,
        status: 'pending',
        company_id: 'company-123',
        user_id: 'user-123',
      });
      setShowModal(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchLeaves();
    } catch (error) {
      alert('신청 중 오류가 발생했습니다.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <span className={`${styles.badge} ${styles.approved}`}>승인됨</span>;
      case 'rejected': return <span className={`${styles.badge} ${styles.rejected}`}>반려됨</span>;
      default: return <span className={`${styles.badge} ${styles.pending}`}>대기중</span>;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>휴가 관리</h1>
          <p className={styles.subtitle}>남은 휴가 일수를 확인하고 새로운 휴가를 신청하세요.</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>
          + 휴가 신청하기
        </button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>총 연차</span>
          <span className={styles.statValue}>15일</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>사용 휴가</span>
          <span className={styles.statValue}>5.5일</span>
        </div>
        <div className={`${styles.statCard} ${styles.highlight}`}>
          <span className={styles.statLabel}>잔여 휴가</span>
          <span className={styles.statValue}>9.5일</span>
        </div>
      </div>

      <div className={styles.contentCard}>
        <h2 className={styles.sectionTitle}>최근 휴가 신청 내역</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>유형</th>
                <th>기간</th>
                <th>사유</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className={styles.loading}>로딩 중...</td></tr>
              ) : leaves.length === 0 ? (
                <tr><td colSpan={4} className={styles.empty}>신청 내역이 없습니다.</td></tr>
              ) : (
                leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td><span className={styles.leaveType}>{leave.type}</span></td>
                    <td>{leave.start_date} ~ {leave.end_date}</td>
                    <td>{leave.reason}</td>
                    <td>{getStatusBadge(leave.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>휴가 신청</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGrid}>
                <div className={styles.inputGroup}>
                  <label>시작일</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div className={styles.inputGroup}>
                  <label>종료일</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label>휴가 유형</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option>연차</option>
                  <option>반차 (오전)</option>
                  <option>반차 (오후)</option>
                  <option>병가</option>
                  <option>경조사</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label>사유</label>
                <textarea 
                  value={reason} 
                  onChange={(e) => setReason(e.target.value)} 
                  placeholder="상세 사유를 입력하세요"
                  required 
                />
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>취on취소</button>
                <button type="submit" className={styles.submitBtn}>신청하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
