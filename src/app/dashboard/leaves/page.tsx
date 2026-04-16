'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabase';
import { 
  Calendar, CheckCircle2, AlertCircle, Plus, Search, 
  ChevronRight, X, Briefcase, Filter, Info, 
  MapPin, Clock, XCircle, CalendarDays, MoreVertical
} from 'lucide-react';
import { createLeave, calculateLeaveEntitlement } from '@/lib/api';
import { format, startOfMonth, endOfMonth, parseISO, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function LeavesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState('연차');
  const [reason, setReason] = useState('');

  const role = (profile?.role || 'member').trim().toLowerCase();
  const isAdminView = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);

  const fetchLeaves = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const start = `${selectedMonth}-01`;
      const end = format(endOfMonth(parseISO(`${selectedMonth}-01`)), 'yyyy-MM-dd');

      let query = supabase
        .from('leave_requests')
        .select('*, profiles(full_name, team_id)')
        .eq('company_id', profile.company_id);

      if (!isAdminView) {
        query = query.eq('user_id', profile.id);
      }

      query = query
        .gte('start_date', start)
        .lte('start_date', end);

      const { data, error } = await query
        .order('status', { ascending: false })
        .order('start_date', { ascending: false });

      if (error && error.code !== '42P01') throw error;
      
      let finalData = data || [];
      setLeaves(finalData);
    } catch (err) {
      console.error('Error fetching leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) {
      fetchLeaves();

      const channel = supabase
        .channel('leave-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'leave_requests',
            filter: profile.company_id ? `company_id=eq.${profile.company_id}` : undefined
          },
          () => fetchLeaves()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile, authLoading, selectedMonth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    try {
      setSubmitting(true);
      await createLeave({
        start_date: startDate,
        end_date: endDate,
        type,
        reason,
        user_id: profile.id,
        company_id: profile.company_id,
        status: 'PENDING'
      });
      
      setShowModal(false);
      setReason('');
      fetchLeaves();
      alert('휴가 신청이 완료되었습니다.');
    } catch (err: any) {
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLeaves = useMemo(() => {
    return leaves.filter(l => 
      (l.reason || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (l.profiles?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.type || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [leaves, searchQuery]);

  const leaveEntitlement = useMemo(() => {
    if (!profile) return 15;
    return calculateLeaveEntitlement(profile.hire_date || null, profile.additional_annual_leave || 0);
  }, [profile]);

  const usedLeave = useMemo(() => {
    return leaves
      .filter(l => l.status === 'APPROVED' && l.type === '연차')
      .reduce((acc, curr) => {
        const days = differenceInDays(parseISO(curr.end_date), parseISO(curr.start_date)) + 1;
        return acc + (days > 0 ? days : 1);
      }, 0);
  }, [leaves]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': 
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100 flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> 승인완료</span>;
      case 'SUB_APPROVED': 
        return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> 1차승인</span>;
      case 'REJECTED': 
        return <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black border border-rose-100 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> 반려됨</span>;
      default: 
        return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black border border-amber-100 flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> 대기중</span>;
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20 px-4 md:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">휴가 및 연차 관리</h1>
            <p className="text-sm text-slate-500 font-medium tracking-tight">부서원들의 휴가 일정을 확인하고 본인의 연차를 관리합니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isAdminView && (
            <button 
              onClick={() => setShowModal(true)}
              className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg active:scale-95 text-sm"
            >
              <Plus className="w-5 h-5" />
              휴가 신청
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f172a] rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden ring-1 ring-white/10 group">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 blur-[60px] rounded-full pointer-events-none group-hover:bg-indigo-500/20 transition-all" />
          <p className="text-[10px] font-black tracking-[0.2em] text-indigo-400 uppercase mb-2">My Annual Leave</p>
          <div className="flex items-end gap-2 text-white">
            <h2 className="text-4xl font-black tracking-tighter">{leaveEntitlement - (profile?.used_leave || usedLeave)}</h2>
            <span className="text-sm font-bold text-indigo-500 mb-1.5 uppercase italic">Days Remaining</span>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span>Total: {leaveEntitlement}d</span>
            <span>Used: {profile?.used_leave || usedLeave}d</span>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Requests</p>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{leaves.filter(l => l.status === 'PENDING').length} <span className="text-xs">건</span></h3>
            </div>
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">승인 대기 중인 신청</p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Month View</p>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none outline-none font-black text-lg text-slate-900 tracking-tight cursor-pointer"
                />
              </div>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 italic">Displaying {selectedMonth} Data</p>
        </div>
      </div>

      {/* Search & List */}
      <div className="space-y-4">
        <div className="relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="신청자명, 사유, 휴가 유형 검색..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-100 rounded-3xl pl-14 pr-6 py-4 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 shadow-sm transition-all"
          />
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Records...</p>
            </div>
          ) : filteredLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
                <Calendar className="w-10 h-10 text-slate-200" />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">휴가 신청 내역이 없습니다.</h3>
              <p className="text-sm text-slate-400 mt-1 font-medium italic uppercase tracking-widest">Transaction history is empty</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-0 hidden lg:table">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-5">신청 종류 / 일자</th>
                    <th className="px-8 py-5">휴가 기간</th>
                    <th className="px-8 py-5">상세 사유</th>
                    {isAdminView && <th className="px-8 py-5">신청자</th>}
                    <th className="px-8 py-5 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLeaves.map((item) => (
                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors cursor-default">
                      <td className="px-8 py-6">
                        <div className="space-y-1">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black tracking-widest uppercase">{item.type}</span>
                          <div className="text-[10px] font-bold text-slate-400">{format(parseISO(item.created_at), 'yyyy-MM-dd HH:mm')}</div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-black text-slate-800">{item.start_date}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300" />
                          <span className="text-[13px] font-black text-slate-800">{item.end_date}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-slate-900 mb-0.5">{item.reason}</p>
                        {item.rejection_reason && (
                          <div className="flex items-center gap-1.5 text-rose-500 font-bold text-[10px]">
                            <AlertCircle className="w-3 h-3" />
                            <span>반려 사유: {item.rejection_reason}</span>
                          </div>
                        )}
                      </td>
                      {isAdminView && (
                        <td className="px-8 py-6">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-tighter">{item.profiles?.full_name}</span>
                        </td>
                      )}
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          {getStatusBadge(item.status)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile List */}
              <div className="lg:hidden divide-y divide-slate-50">
                {filteredLeaves.map((item) => (
                  <div key={item.id} className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-500 rounded text-[9px] font-black tracking-widest uppercase">{item.type}</span>
                          <span className="text-[10px] font-bold text-slate-300 uppercase">{format(parseISO(item.created_at), 'MM/dd HH:mm')}</span>
                        </div>
                        <h3 className="text-base font-black text-slate-900 leading-tight">{item.reason}</h3>
                      </div>
                      {getStatusBadge(item.status)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 bg-slate-50 p-2 py-3 px-4 rounded-2xl">
                       <span className="font-mono">{item.start_date}</span>
                       <ChevronRight className="w-3 h-3 opacity-20" />
                       <span className="font-mono">{item.end_date}</span>
                    </div>
                    {isAdminView && item.profiles && (
                      <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                         <div className="w-4 h-4 bg-slate-200 rounded-full" />
                         {item.profiles.full_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Apply Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-10 flex justify-between items-center border-b border-slate-50 bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">New Leave</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">휴가 신청서 작성</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">휴가 종류</label>
                <select 
                  value={type} 
                  onChange={e => setType(e.target.value)} 
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option>연차</option>
                  <option>반차 (오전)</option>
                  <option>반차 (오후)</option>
                  <option>병가</option>
                  <option>경조사</option>
                  <option>공가</option>
                  <option>기타</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">시작일</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">종료일</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20" required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">신청 사유</label>
                <textarea 
                  value={reason} 
                  onChange={e => setReason(e.target.value)}
                  rows={4}
                  placeholder="휴가 사유를 자세히 입력해 주세요"
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-medium text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none transition-all"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-50">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 text-slate-400 font-black hover:bg-slate-50 rounded-2xl uppercase tracking-widest text-[11px] transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-slate-900 hover:shadow-none transition-all uppercase tracking-widest text-[11px] disabled:opacity-50 active:scale-95"
                >
                  {submitting ? '신청 중...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
