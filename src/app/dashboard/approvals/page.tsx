'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { CheckSquare, XCircle, Clock, FileText, ChevronRight, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateRequestStatus } from '@/lib/api';

export default function ApprovalsManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'EXPENSE' | 'LEAVE'>('EXPENSE');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const role = (profile?.role || 'member').trim().toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isSubAdmin = role === 'sub_admin';

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role === 'system_admin') {
        router.replace('/dashboard/system');
      } else if (profile && !['super_admin', 'admin', 'sub_admin'].includes(profile.role.toLowerCase())) {
        router.replace('/dashboard');
      }
    }
  }, [profile, authLoading, router]);

  const fetchRequests = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const targetTable = activeTab === 'EXPENSE' ? 'expense_requests' : 'leave_requests';
      
      let query = supabase
        .from(targetTable)
        .select(`
          *,
          profiles!inner(
            full_name, 
            role,
            team_id,
            teams:team_id(division_id)
          )
        `)
        .eq('company_id', profile.company_id);

      // 1. sub_admin: 본인 본부의 PENDING 건만 (자신 제외)
      if (isSubAdmin) {
        query = query
          .eq('status', 'PENDING')
          .neq('user_id', profile.id)
          .eq('profiles.teams.division_id', (profile as any).division_id);
      } 
      // 2. super_admin / admin: 1차 승인 완료(SUB_APPROVED) 건 또는 sub_admin이 신청한 PENDING 건
      else if (isSuperAdmin || isAdmin) {
        query = query.or(`status.eq.SUB_APPROVED,and(status.eq.PENDING,profiles.role.eq.sub_admin)`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;
      
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [profile?.company_id, activeTab]);

  const handleApprove = async (id: string) => {
    const confirmMsg = isSubAdmin ? '1차 승인하시겠습니까?' : '최종 승인하시겠습니까?';
    if (!confirm(confirmMsg)) return;

    try {
      // sub_admin은 SUB_APPROVED로, 최고관리자는 APPROVED로 변경
      const nextStatus = isSubAdmin ? 'SUB_APPROVED' : 'APPROVED';
      await updateRequestStatus(activeTab === 'EXPENSE' ? 'expense' : 'leave', id, nextStatus);
      fetchRequests();
    } catch (e: any) { alert(e.message); }
  };

  const handleReject = async (id: string) => {
    if (!confirm('반려하시겠습니까?')) return;
    try {
      await updateRequestStatus(activeTab === 'EXPENSE' ? 'expense' : 'leave', id, 'REJECTED');
      fetchRequests();
    } catch (e: any) { alert(e.message); }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
          <CheckSquare className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">결재 / 승인 관리함</h1>
          <p className="text-sm text-slate-500 font-medium">부서원의 지출결의 및 근태 휴가 신청 등 결재 대기 문서를 처리합니다.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Tabs */}
        <div className="flex items-center border-b border-slate-100">
          <button 
            onClick={() => setActiveTab('EXPENSE')}
            className={`flex-1 py-5 text-sm font-bold border-b-2 transition-all ${activeTab === 'EXPENSE' ? 'border-rose-600 text-rose-600 bg-rose-50/10' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
          >
            지출결의 승인함
          </button>
          <button 
            onClick={() => setActiveTab('LEAVE')}
            className={`flex-1 py-5 text-sm font-bold border-b-2 transition-all ${activeTab === 'LEAVE' ? 'border-rose-600 text-rose-600 bg-rose-50/10' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
          >
            근태/휴가 승인함
          </button>
        </div>

        {/* List */}
        <div className="p-8">
          <div className="space-y-4">
            {requests.map(req => (
              <div key={req.id} className="group p-6 rounded-2xl border border-slate-100 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-100/50 transition-all bg-white flex items-center justify-between">
                
                <div className="flex items-center gap-6">
                  {/* Status Badge */}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
                    req.status === 'SUB_APPROVED' ? 'bg-amber-50 text-amber-500 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                  }`}>
                    {req.status === 'SUB_APPROVED' ? <Check className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-rose-500 uppercase tracking-widest">{req.status === 'SUB_APPROVED' ? 'REVIEWED' : 'PENDING'}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{new Date(req.created_at).toISOString().split('T')[0]}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-800 mb-1">
                      {req.description || req.reason || '제목 없음'}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[8px] text-slate-400">
                          {req.profiles?.full_name?.[0] || 'U'}
                        </div>
                        {req.profiles?.full_name} <span className="text-[10px] font-normal text-slate-400">({req.profiles?.role})</span>
                      </div>
                      <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                      <span className="text-indigo-600">{req.category || req.type}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {activeTab === 'EXPENSE' && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-black text-slate-400">REQUEST AMOUNt</div>
                      <div className="text-xl font-black text-slate-900 tracking-tight">{Math.floor(req.amount || 0).toLocaleString()} <span className="text-xs text-slate-400 font-bold">원</span></div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    <button onClick={() => handleApprove(req.id)} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors shadow-md flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> 최종 승인
                    </button>
                    <button onClick={() => handleReject(req.id)} className="px-4 py-2 bg-white border border-slate-200 text-rose-500 rounded-lg text-xs font-bold hover:bg-rose-50 hover:border-rose-200 transition-colors flex items-center justify-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> 반려
                    </button>
                  </div>
                </div>

              </div>
            ))}

            {requests.length === 0 && (
              <div className="py-20 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                  <FileText className="w-6 h-6 text-slate-300" />
                </div>
                <h3 className="text-sm font-bold text-slate-600 mb-1">대기 중인 결재 문서가 없습니다.</h3>
                <p className="text-xs font-medium text-slate-400">모든 문서가 처리되었거나 아직 상신되지 않았습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
