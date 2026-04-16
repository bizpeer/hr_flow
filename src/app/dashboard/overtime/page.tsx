'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabase';
import { 
  Clock, Calendar, CheckCircle2, AlertCircle, Plus, Search, 
  ChevronRight, X, Clock8, Filter, CalendarDays, MoreVertical,
  ArrowRight, XCircle
} from 'lucide-react';
import { calculateOvertimeDuration, Overtime, createOvertime } from '@/lib/api';
import { format, endOfMonth, parseISO, startOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function OvertimePage() {
  const { profile, loading: authLoading } = useAuth();
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [reason, setReason] = useState('');

  const role = (profile?.role || 'member').trim().toLowerCase();
  const isAdminView = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);

  const fetchOvertimes = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('overtime_requests')
        .select('*, profiles(full_name)');
      
      if (isAdminView) {
        query = query.eq('company_id', profile.company_id);
      } else {
        query = query.eq('user_id', profile.id);
      }

      if (selectedMonth) {
        const start = `${selectedMonth}-01`;
        const end = format(endOfMonth(parseISO(`${selectedMonth}-01`)), 'yyyy-MM-dd');
        query = query.gte('date', start).lte('date', end);
      }

      const { data, error } = await query
        .order('status', { ascending: false })
        .order('date', { ascending: false });

      if (error && error.code !== '42P01') throw error;
      
      setOvertimes(data || []);
    } catch (err) {
      console.error('Error fetching overtimes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) {
      fetchOvertimes();

      const channel = supabase
        .channel('overtime-changes')
        .on(
          'postgres_changes',
          {
            event: '*', 
            schema: 'public',
            table: 'overtime_requests',
            filter: profile.company_id ? `company_id=eq.${profile.company_id}` : undefined
          },
          () => fetchOvertimes()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile, authLoading, selectedMonth]);

  const calculatedHours = useMemo(() => {
    return calculateOvertimeDuration(startTime, endTime);
  }, [startTime, endTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    try {
      setSubmitting(true);
      await createOvertime({
        date,
        start_time: startTime,
        end_time: endTime,
        reason,
        duration_hours: calculatedHours,
        user_id: profile.id,
        company_id: profile.company_id,
        status: 'PENDING'
      });
      
      setShowModal(false);
      setReason('');
      fetchOvertimes();
      alert('초과근무 신청이 완료되었습니다.');
    } catch (err: any) {
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOvertimes = useMemo(() => {
    return overtimes.filter(o => 
      (o.reason || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (o.profiles?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [overtimes, searchQuery]);

  const totalOvertimeHours = useMemo(() => {
    return filteredOvertimes
      .filter(o => o.status === 'APPROVED')
      .reduce((acc, curr) => acc + curr.duration_hours, 0);
  }, [filteredOvertimes]);

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
            <Clock8 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">초과근무 관리</h1>
            <p className="text-sm text-slate-500 font-medium tracking-tight">시간 외 근무를 신청하고 전사 초과근무 현황을 모니터링합니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isAdminView && (
            <button 
              onClick={() => setShowModal(true)}
              className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg active:scale-95 text-sm"
            >
              <Plus className="w-5 h-5" />
              초과근무 신청
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f172a] rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden ring-1 ring-white/10">
          <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/10 blur-[60px] rounded-full pointer-events-none" />
          <p className="text-[10px] font-black tracking-[0.2em] text-indigo-400 uppercase mb-2">Approved Hours ({selectedMonth})</p>
          <div className="flex items-end gap-2 text-white">
            <h2 className="text-4xl font-black tracking-tighter">{totalOvertimeHours.toFixed(1)}</h2>
            <span className="text-sm font-bold text-indigo-500 mb-1.5 uppercase italic tracking-widest">Total Hours</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 mt-4 uppercase tracking-widest">이번 달 총 초과근무 승인 시간</p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Count</p>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{overtimes.filter(o => o.status === 'PENDING').length} <span className="text-xs">건</span></h3>
            </div>
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">검토 대기 중인 신청</p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter By Month</p>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none outline-none font-black text-lg text-slate-900 tracking-tight cursor-pointer"
                />
                {selectedMonth && (
                  <button 
                    onClick={() => setSelectedMonth('')} 
                    className="text-[10px] bg-slate-100 px-2 py-1 rounded text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold transition-all"
                  >
                    전체
                  </button>
                )}
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
            placeholder="신청자명 혹은 사유 검색..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-100 rounded-3xl pl-14 pr-6 py-4 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/20 shadow-sm transition-all"
          />
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Fetching Data...</p>
            </div>
          ) : filteredOvertimes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
                <Clock8 className="w-10 h-10 text-slate-200" />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">조회된 내역이 없습니다.</h3>
              <p className="text-sm text-slate-400 mt-1 font-medium italic uppercase tracking-widest mb-6">
                {selectedMonth ? `${selectedMonth} 기간에 데이터가 없습니다.` : '등록된 데이터가 없습니다.'}
              </p>
              {selectedMonth && (
                <button 
                  onClick={() => setSelectedMonth('')}
                  className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black transition-all"
                >
                  전체 기간 조회하기
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Desktop View */}
              <table className="w-full text-left border-separate border-spacing-0 hidden lg:table">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-5">날짜 / 신청자</th>
                    <th className="px-8 py-5">근무 시간대</th>
                    <th className="px-8 py-5">총 시간</th>
                    <th className="px-8 py-5">근무 사유</th>
                    <th className="px-8 py-5 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredOvertimes.map((item) => (
                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors cursor-default text-[13px]">
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-black text-slate-900">{item.date}</span>
                          {isAdminView && <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">{item.profiles?.full_name}</span>}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 px-2 py-1 rounded-md font-bold text-slate-600">{item.start_time}</span>
                          <ArrowRight className="w-3 h-3 text-slate-300" />
                          <span className="bg-slate-100 px-2 py-1 rounded-md font-bold text-slate-600">{item.end_time}</span>
                          {item.end_time < item.start_time && <span className="text-[9px] font-black bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded uppercase tracking-tighter ml-1">Next Day</span>}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="font-black text-slate-900">{item.duration_hours.toFixed(1)} <span className="text-[10px] text-slate-400 uppercase">hrs</span></span>
                      </td>
                      <td className="px-8 py-6">
                        <p className="font-medium text-slate-600 max-w-sm line-clamp-1">{item.reason}</p>
                        {item.rejection_reason && (
                          <div className="flex items-center gap-1.5 text-rose-500 font-bold text-[10px] mt-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>반려 사유: {item.rejection_reason}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          {getStatusBadge(item.status)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile View */}
              <div className="lg:hidden divide-y divide-slate-50">
                {filteredOvertimes.map((item) => (
                  <div key={item.id} className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{item.date}</span>
                        </div>
                        <h3 className="text-base font-black text-slate-900 leading-tight">{item.reason}</h3>
                        {isAdminView && (
                          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{item.profiles?.full_name}</span>
                        )}
                      </div>
                      {getStatusBadge(item.status)}
                    </div>
                    
                    <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-4 py-3">
                       <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Time</span>
                          <span className="text-sm font-black text-slate-900">{item.duration_hours.toFixed(1)} Hours</span>
                       </div>
                       <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-100 italic font-mono text-xs">
                          {item.start_time} - {item.end_time}
                       </div>
                    </div>
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
                  <Clock8 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">New Overtime</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">초과근무 신청서 작성</p>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 text-indigo-600">근무 날짜 (Work Date)</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">시작 시간</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">종료 시간</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20" required />
                </div>
              </div>

              <div className="p-6 bg-indigo-50 rounded-[2rem] flex items-center justify-between border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Clock className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">계산된 시간</p>
                    <p className="text-xl font-black text-indigo-900 tracking-tighter">{calculatedHours.toFixed(1)} <span className="text-xs">hrs</span></p>
                  </div>
                </div>
                {endTime < startTime && <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-1 rounded-lg uppercase tracking-widest">Overnight</span>}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">구체적 사유 (Reason)</label>
                <textarea 
                  value={reason} 
                  onChange={e => setReason(e.target.value)}
                  rows={4}
                  placeholder="초과근무 사유를 입력하세요"
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-medium text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none transition-all"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-50">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 text-slate-400 font-black hover:bg-slate-50 rounded-2xl uppercase tracking-widest text-[11px]"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all uppercase tracking-widest text-[11px] disabled:opacity-50 active:scale-95"
                >
                  {submitting ? '신청 중...' : 'Submit Overtime'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
