'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { Clock, Calendar, CheckCircle2, AlertCircle, Plus, Search, ChevronRight, X, Clock8 } from 'lucide-react';
import { getOvertimes, createOvertime, calculateOvertimeDuration, Overtime } from '@/lib/api';

export default function OvertimePage() {
  const { profile, loading: authLoading } = useAuth();
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [reason, setReason] = useState('');
  const [calculatedHours, setCalculatedHours] = useState(3);

  const isAdmin = ['super_admin', 'admin', 'sub_admin'].includes(profile?.role?.toLowerCase() || '');

  useEffect(() => {
    if (profile?.company_id) {
      fetchOvertimes();
    }
  }, [profile?.company_id]);

  useEffect(() => {
    const hours = calculateOvertimeDuration(startTime, endTime);
    setCalculatedHours(hours);
  }, [startTime, endTime]);

  const fetchOvertimes = async () => {
    try {
      setLoading(true);
      const data = await getOvertimes(profile?.company_id);
      
      // 일반 직원은 본인 것만 필터링 (API에서 처리되지만 한 번 더 안전하게)
      if (!isAdmin) {
        setOvertimes(data.filter(o => o.user_id === profile?.id));
      } else {
        setOvertimes(data);
      }
    } catch (err) {
      console.error('Error fetching overtimes:', err);
    } finally {
      setLoading(false);
    }
  };

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

  const statusMap = {
    'PENDING': { label: '대기', color: 'bg-amber-50 text-amber-600 border-amber-100' },
    'SUB_APPROVED': { label: '1차 승인', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
    'APPROVED': { label: '최종 승인', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    'REJECTED': { label: '반려', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  };

  if (loading && !overtimes.length) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Clock8 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">초과근무 관리</h1>
            <p className="text-sm text-slate-500 font-medium">시간 외 근무 신청 및 승인 현황을 관리합니다.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
        >
          <Plus className="w-4 h-4" /> 초과근무 신청
        </button>
      </div>

      {/* Stats Table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">이번 달 승인 대기</p>
            <p className="text-xl font-black text-slate-900">{overtimes.filter(o => o.status === 'PENDING').length} <span className="text-sm font-bold text-slate-400">건</span></p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">이번 달 승인 완료</p>
            <p className="text-xl font-black text-slate-900">
              {overtimes.filter(o => o.status === 'APPROVED').reduce((acc, curr) => acc + curr.duration_hours, 0).toFixed(1)} <span className="text-sm font-bold text-slate-400">시간</span>
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">신청 총 건수</p>
            <p className="text-xl font-black text-slate-900">{overtimes.length} <span className="text-sm font-bold text-slate-400">건</span></p>
          </div>
        </div>
      </div>

      {/* List Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-600">근무 내역 필터링</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">날짜 / 신청자</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">근무 시간</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">총 시간</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">사유</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {overtimes.map((item) => (
                <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{item.date}</span>
                      <span className="text-[10px] font-bold text-indigo-600">{item.profiles?.full_name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{item.start_time}</span>
                      <ChevronRight className="w-3 h-3 text-slate-300" />
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{item.end_time}</span>
                      {item.end_time < item.start_time && (
                         <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded ml-1">익일</span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-sm font-black text-slate-900">{item.duration_hours.toFixed(1)} <span className="text-[10px] text-slate-400">h</span></span>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs text-slate-500 font-medium max-w-xs truncate">{item.reason}</p>
                    {item.rejection_reason && (
                      <p className="text-[10px] text-rose-500 font-bold mt-1 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> 반려사유: {item.rejection_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex justify-center">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-tight border ${statusMap[item.status as keyof typeof statusMap]?.color}`}>
                        {statusMap[item.status as keyof typeof statusMap]?.label}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {overtimes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <Clock className="w-10 h-10" />
                      <p className="text-sm font-bold">표시할 근무 내역이 없습니다.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">초과근무 신청</h3>
                <p className="text-xs text-slate-400 font-medium mt-1">상세 근무 일정을 입력해 주세요.</p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">근무 날짜</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">시작 시간</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">종료 시간</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="p-5 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-between border border-indigo-100 dark:border-indigo-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
                    <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">계산된 시간</p>
                    <p className="text-lg font-black text-indigo-900 dark:text-indigo-100 tracking-tight">{calculatedHours} <span className="text-xs">시간</span></p>
                  </div>
                </div>
                {endTime < startTime && (
                  <span className="text-[10px] font-black text-white bg-indigo-600 px-2 py-1 rounded-lg italic">자정 경과</span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">근무 사유</label>
                <textarea 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="예: 프로젝트 마감 지원, 긴급 오류 수정 등"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 text-slate-400 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-2 py-4 px-8 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {submitting ? '신청 중...' : '신청하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
