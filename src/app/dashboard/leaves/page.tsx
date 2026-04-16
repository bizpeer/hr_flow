'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabase';
import { Leave, updateRequestFields, calculateLeaveEntitlement } from '@/lib/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar, Filter, Plus, FileText, CheckCircle, XCircle, Clock, Edit2, AlertCircle } from 'lucide-react';

export default function LeavesPage() {
  const { profile } = useAuth();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Date Range State
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(today, 'yyyy-MM'));

  // New Leave Form State
  const [startDate, setStartDate] = useState(format(today, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [type, setType] = useState('연차');
  const [reason, setReason] = useState('');

  // Stats Calculation
  const totalEntitlement = calculateLeaveEntitlement(profile?.hire_date || null, profile?.additional_annual_leave || 0);
  const usedLeave = profile?.used_leave || 0;
  const remainingLeave = totalEntitlement - usedLeave;

  const fetchLeaves = async () => {
    if (!profile || !profile.company_id) {
      console.log('[Leaves] Waiting for profile or company_id...');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const role = (profile.role || 'member').toLowerCase();
      const isManagement = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);
      
      const start = `${selectedMonth}-01`;
      const end = format(endOfMonth(new Date(selectedMonth)), 'yyyy-MM-dd');

      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          profiles (
            full_name,
            team_id
          )
        `)
        .eq('company_id', profile.company_id)
        .gte('start_date', start)
        .lte('start_date', end);
      
      if (!isManagement) {
        query = query.eq('user_id', profile.id);
      }

      const { data, error } = await query
        .order('status', { ascending: false })
        .order('start_date', { ascending: false });
      
      if (error) {
        console.error('[Leaves] Fetch error:', error);
        throw error;
      }
      
      let finalData = data || [];
      
      finalData.sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
      });
      
      console.log(`[Leaves] Fetched ${finalData?.length || 0} records`);
      setLeaves(finalData);
    } catch (error: any) {
      console.error('Failed to fetch leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.company_id) {
      fetchLeaves();

      // 실시간 동기화 설정
      const channel = supabase
        .channel('leave-changes')
        .on(
          'postgres_changes',
          {
            event: '*', 
            schema: 'public',
            table: 'leave_requests',
            filter: `company_id=eq.${profile.company_id}`
          },
          () => {
            console.log('Realtime update detected in leaves');
            fetchLeaves();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile?.company_id, profile?.role, profile?.id, selectedMonth]);

  const openAppModal = (leave?: any) => {
    if (leave) {
      setEditingId(leave.id);
      setStartDate(leave.start_date);
      setEndDate(leave.end_date);
      setType(leave.type);
      setReason(leave.reason);
    } else {
      setEditingId(null);
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setEndDate(format(new Date(), 'yyyy-MM-dd'));
      setType('연차');
      setReason('');
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !profile.company_id) return;

    if (new Date(endDate) < new Date(startDate)) {
      alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    // 연차 사용 일수 계산
    const start = new Date(startDate);
    const end = new Date(endDate);
    const requestedDays = type.includes('반차') ? 0.5 : (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    if (requestedDays > remainingLeave && !editingId) {
      alert(`잔여 연차가 부족합니다. (잔여: ${remainingLeave.toFixed(1)}일, 요청: ${requestedDays}일)`);
      return;
    }

    try {
      setSubmitting(true);
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        alert('인증 세션이 만료되었습니다. 다시 로그인해주세요.');
        return;
      }

      if (editingId) {
        await updateRequestFields('leave', editingId, {
          start_date: startDate,
          end_date: endDate,
          type,
          reason,
        });
      } else {
        const { error } = await supabase.from('leave_requests').insert([{
          start_date: startDate,
          end_date: endDate,
          type,
          reason,
          status: 'PENDING',
          company_id: profile.company_id,
          user_id: authUser.id,
        }]);
        if (error) throw error;
      }

      setShowModal(false);
      await fetchLeaves();
      alert('신청이 완료되었습니다.');
    } catch (error: any) {
      alert('저장 실패: ' + (error.message || '알 수 없는 오류가 발생했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLeaves = leaves.filter(leave => {
    if (!leave.start_date) return false;
    // YYYY-MM-DD 형식의 문자열에서 YYYY-MM 추출 (타임존 이슈 방지)
    const leaveMonth = leave.start_date.substring(0, 7);
    return leaveMonth === selectedMonth;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100 flex items-center gap-1.5 w-fit"><CheckCircle className="w-3 h-3" /> 승인됨</span>;
      case 'SUB_APPROVED': return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1.5 w-fit"><CheckCircle className="w-3 h-3" /> 1차승인</span>;
      case 'REJECTED': return <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black border border-rose-100 flex items-center gap-1.5 w-fit"><XCircle className="w-3 h-3" /> 반려됨</span>;
      default: return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black border border-amber-100 flex items-center gap-1.5 w-fit"><Clock className="w-3 h-3" /> 대기중</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 md:space-y-12 pb-10 md:pb-20 px-4 md:px-0">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mt-4 md:mt-0">
        <div className="space-y-4">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-600 rounded-2xl md:rounded-[2rem] text-white flex items-center justify-center shadow-lg md:shadow-2xl">
              <Calendar className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight uppercase">휴가신청</h1>
              <p className="text-slate-500 font-medium text-[10px] md:text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Leave & Absence Management
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
           <div className="bg-white dark:bg-slate-900 p-1.5 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800 flex items-center gap-4 pr-6 w-full sm:w-auto">
              <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                <Filter className="w-4 h-4" />
              </div>
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent border-none outline-none font-black text-xs text-slate-900 dark:text-white tracking-widest uppercase cursor-pointer flex-1"
              />
           </div>
           <button 
            onClick={() => openAppModal()}
            className="flex items-center justify-center gap-4 px-8 py-4 bg-slate-900 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl hover:bg-emerald-600 transition-all uppercase tracking-widest text-[11px] w-full sm:w-auto"
           >
              <Plus className="w-5 h-5" />
              <span>신청하기</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <StatCard label="총 연차" value={totalEntitlement.toFixed(1)} />
        <StatCard label="사용 휴가" value={usedLeave.toFixed(1)} />
        <StatCard label="잔여 휴가" value={remainingLeave.toFixed(1)} highlight />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl md:rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-h-[400px]">
        <div className="p-6 md:p-10 border-b border-slate-50 dark:border-slate-800 flex items-center gap-4 md:gap-5">
           <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl md:rounded-3xl flex items-center justify-center">
              <FileText className="w-6 h-6 md:w-7 md:h-7" />
           </div>
           <div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">My Leave Records</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction History for {selectedMonth}</p>
           </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5">
                <th className="px-10 py-7 text-[10px] font-black text-slate-400 uppercase tracking-widest">유형 / 기간</th>
                <th className="px-10 py-7 text-[10px] font-black text-slate-400 uppercase tracking-widest">사유</th>
                <th className="px-10 py-7 text-[10px] font-black text-slate-400 uppercase tracking-widest">신청자</th>
                <th className="px-10 py-7 text-[10px] font-black text-slate-400 uppercase tracking-widest">상태</th>
                <th className="px-10 py-7 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-bold italic tracking-widest animate-pulse">데이터를 불러오는 중...</td></tr>
              ) : filteredLeaves.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest italic">기록이 없습니다</td></tr>
              ) : (
                filteredLeaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group text-slate-900 dark:text-slate-100">
                    <td className="px-6 md:px-10 py-6">
                      <div className="space-y-1">
                        <span className="text-xs font-black">{leave.type}</span>
                        <p className="text-[10px] font-bold text-slate-400">{leave.start_date} ~ {leave.end_date}</p>
                      </div>
                    </td>
                    <td className="px-6 md:px-10 py-6 text-sm font-bold">
                      {leave.reason}
                      {(leave as any).rejection_reason && (
                        <p className="text-[10px] text-rose-500 font-black mt-2 inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> 반려사유: {(leave as any).rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-6 md:px-10 py-6 text-xs font-black uppercase tracking-widest">{leave.profiles?.full_name}</td>
                    <td className="px-6 md:px-10 py-6">{getStatusBadge(leave.status)}</td>
                    <td className="px-6 md:px-10 py-6 text-right">
                       {(leave.status === 'PENDING' || leave.status === 'SUB_APPROVED') && (profile?.id === leave.user_id || ['super_admin','admin'].includes(profile?.role || '')) && (
                          <button 
                            onClick={() => openAppModal(leave)}
                            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 flex items-center justify-center hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 hover:border-emerald-200 transition-all ml-auto md:opacity-0 group-hover:opacity-100 shadow-sm"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                       )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-3xl md:rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 md:p-10 pb-4 md:pb-6 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">New Absence Request</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="w-8 h-8 md:w-10 md:h-10 bg-white dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-300 hover:text-rose-500"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">시작일</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-xs dark:text-white outline-none focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/40" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">종료일</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-xs dark:text-white outline-none focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/40" required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">유형</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-xs dark:text-white outline-none focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/40 appearance-none">
                  <option>연차</option>
                  <option>반차 (오전)</option>
                  <option>반차 (오후)</option>
                  <option>병가</option>
                  <option>경조사</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">사유</label>
                <textarea 
                  value={reason} 
                  onChange={(e) => setReason(e.target.value)} 
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm h-32 dark:text-white outline-none focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/40 resize-none"
                  placeholder="구체적인 사유를 입력하세요"
                  required 
                />
              </div>
              <button type="submit" disabled={submitting} className="w-full py-5 bg-emerald-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px] disabled:opacity-50">
                {submitting ? '제출 중...' : '제출하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight = false }: any) {
  return (
    <div className={`p-6 md:p-10 rounded-3xl md:rounded-[3rem] border shadow-sm relative overflow-hidden group transition-all duration-500 hover:-translate-y-1 ${highlight ? 'bg-slate-900 border-slate-900 ring-4 ring-slate-900/10' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-emerald-200'}`}>
      <div className="space-y-2 relative z-10">
        <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${highlight ? 'text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>{label}</p>
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl md:text-5xl font-black tracking-tighter ${highlight ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{value}</span>
          <span className={`text-[10px] md:text-xs font-black uppercase tracking-widest ${highlight ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}>Days</span>
        </div>
      </div>
      <div className={`absolute top-0 right-0 p-8 opacity-5 group-hover:scale-125 transition-transform duration-1000 ${highlight ? 'text-emerald-500' : 'text-slate-200 dark:text-slate-700'}`}>
        <Calendar className="w-16 h-16 md:w-24 md:h-24" />
      </div>
    </div>
  );
}
