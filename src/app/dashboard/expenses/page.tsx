'use client';

import { useState, useEffect } from 'react';
import { getExpenses, createExpense, Expense } from '@/lib/api';
import styles from './expenses.module.css';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // New Expense Form State
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('식비');
  const [description, setDescription] = useState('');

  const fetchExpenses = async () => {
    try {
      // For demo, using a dummy company ID. In real app, get from user profile.
      const data = await getExpenses('company-123');
      setExpenses(data);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createExpense({
        amount: Number(amount),
        category,
        description,
        status: 'pending',
        company_id: 'company-123',
        user_id: 'user-123', // In real app, get from supabase.auth
      });
      setShowModal(false);
      setAmount('');
      setDescription('');
      fetchExpenses();
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
          <h1 className={styles.title}>지출결의 관리</h1>
          <p className={styles.subtitle}>비용 신청 및 승인 내역을 확인하세요.</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>
          + 새로운 지출 신청
        </button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.miniStat}>
          <span className={styles.statLabel}>이번 달 총 지출</span>
          <span className={styles.statValue}>₩1,240,000</span>
        </div>
        <div className={styles.miniStat}>
          <span className={styles.statLabel}>대기 중</span>
          <span className={styles.statValue}>3건</span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>날짜</th>
              <th>항목</th>
              <th>내용</th>
              <th>금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.loading}>로딩 중...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={5} className={styles.empty}>지출 내역이 없습니다.</td></tr>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.created_at).toLocaleDateString()}</td>
                  <td>{expense.category}</td>
                  <td>{expense.description}</td>
                  <td className={styles.amount}>₩{expense.amount.toLocaleString()}</td>
                  <td>{getStatusBadge(expense.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>지출 신청</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label>금액 (₩)</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="0"
                  required 
                />
              </div>
              <div className={styles.inputGroup}>
                <label>카테고리</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option>식비</option>
                  <option>교통비</option>
                  <option>비품기구</option>
                  <option>기타</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label>상세 내용</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="지출 사유를 입력하세요"
                  required 
                />
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>취소</button>
                <button type="submit" className={styles.submitBtn}>신청하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
