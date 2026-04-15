'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { CheckSquare, XCircle, Clock, FileText, ChevronRight, Check, AlertCircle, X, Clock8 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateRequestStatus, calculateLeaveEntitlement, updateMemberProfile, updateRequestFields } from '@/lib/api';

export default function ApprovalsManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'EXPENSE' | 'LEAVE' | 'OVERTIME'>('EXPENSE');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Rejection Modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [targetRequestId, setTargetRequestId] = useState<string | null>(null);

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
      let targetTable = 'expense_requests';
      if (activeTab === 'LEAVE') targetTable = 'leave_requests';
      if (activeTab === 'OVERTIME') targetTable = 'overtime_requests';
      
      let query = supabase
        .from(targetTable)
        .select(`
          *,
          profiles!inner(
            id,
            full_name, 
            role,
            team_id,
            hire_date,
            used_leave,
            additional_annual_leave
          )
        `)
        .eq('company_id', profile.company_id);

      // 1. sub_admin: 본인 본부의 PENDING 건만 (자신 제외)
      if (isSubAdmin) {
        query = query
          .eq('status', 'PENDING')
          .neq('user_id', profile.id);
      } 
      // 2. super_admin / admin: 1차 승인 완료(SUB_APPROVED) 건 또는 sub_admin이 신청한 PENDING 건
      else if (isSuperAdmin || isAdmin) {
        query = query.or(`status.eq.SUB_APPROVED,and(status.eq.PENDING,profiles.role.eq.sub_admin)`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;
      
      let finalData = data || [];

      // sub_admin인 경우, 본인 본부의 데이터만 클라이언트 필터링
      if (isSubAdmin && (profile as any).division_id) {
        try {
          const { data: teamsData } = await supabase
            .from('teams')
            .select('id')
            .eq('division_id', (profile as any).division_id);
            
          if (teamsData) {
            const validTeamIds = teamsData.map(t => t.id);
            finalData = finalData.filter(req => validTeamIds.includes(req.profiles?.team_id));
          } else {
            finalData = [];
          }
        } catch(e) {
          console.error('Error fetching subdivision teams:', e);
          finalData = [];
        }
      }
      
      setRequests(finalData);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [profile?.company_id, activeTab]);

  const handleApprove = async (request: any) => {
    const confirmMsg = isSubAdmin ? '1차 승인하시겠습니까?' : '최종 승인하시겠습니까?';
    if (!confirm(confirmMsg)) return;

    try {
      const nextStatus = isSubAdmin ? 'SUB_APPROVED' : 'APPROVED';
      const type = activeTab.toLowerCase() as 'expense' | 'leave';

      // 휴가 신청인 경우 잔여 연차 확인 및 차감 로직 (최종 승인 시에만 수행)
      if (activeTab === 'LEAVE' && nextStatus === 'APPROVED') {
        const userProfile = request.profiles;
        const totalEntitlement = calculateLeaveEntitlement(userProfile.hire_date, userProfile.additional_annual_leave);
        const alreadyUsed = userProfile.used_leave || 0;
        const remaining = totalEntitlement - alreadyUsed;
        
        // 일수 계산
        const start = new Date(request.start_date);
        const end = new Date(request.end_date);
        const requestedDays = request.type.includes('반차') ? 0.5 : (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

        if (requestedDays > remaining) {
          alert(`잔여 연차가 부족합니다. (잔여: ${remaining.toFixed(1)}일, 요청: ${requestedDays}일)`);
          return;
        }

        // 1. 연차 차감 업데이트
        await updateMemberProfile(userProfile.id, {
          used_leave: alreadyUsed + requestedDays
        });
      }

      // 2. 요청 상태 업데이트
      if (activeTab === 'OVERTIME') {
        await supabase.from('overtime_requests').update({ status: nextStatus }).eq('id', request.id);
      } else {
        await updateRequestStatus(type, request.id, nextStatus);
      }
      
      fetchRequests();
    } catch (e: any) { 
      console.error('Approval Error:', e);
      alert('승인 처리 중 오류가 발생했습니다: ' + e.message); 
    }
  };

  const openRejectModal = (id: string) => {
    setTargetRequestId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!targetRequestId || !rejectionReason.trim()) {
      alert('반려 사유를 입력해 주세요.');
      return;
    }

    try {
      const type = activeTab.toLowerCase() as 'expense' | 'leave';
      
      if (activeTab === 'OVERTIME') {
        await supabase.from('overtime_requests').update({ 
          status: 'REJECTED',
          rejection_reason: rejectionReason 
        }).eq('id', targetRequestId);
      } else {
        await updateRequestStatus(type, targetRequestId, 'REJECTED');
        await updateRequestFields(type, targetRequestId, { rejection_reason: rejectionReason });
      }

      setShowRejectModal(false);
      fetchRequests();
      alert('반려 처리가 완료되었습니다.');
    } catch (e: any) { alert(e.message); }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
          <CheckSquare className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">결재 / 승인 관리함</h1>
          <p className="text-sm text-slate-500 font-medium">부서원의 지출결의, 휴가, 초과근무 신청 등 결재 대기 문서를 처리합니다.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Tabs */}
        <div className="flex items-center border-b border-slate-100 bg-slate-50/30">
          <button 
            onClick={() => setActiveTab('EXPENSE')}
            className={`flex-1 py-5 text-sm font-bold border-b-2 transition-all ${activeTab === 'EXPENSE' ? 'border-rose-600 text-rose-600 bg-white' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
          >
            지출결의 승인함
          </button>
          <button 
            onClick={() => setActiveTab('LEAVE')}
            className={`flex-1 py-5 text-sm font-bold border-b-2 transition-all ${activeTab === 'LEAVE' ? 'border-rose-600 text-rose-600 bg-white' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
          >
            근태/휴가 승인함
          </button>
          <button 
            onClick={() => setActiveTab('OVERTIME')}
            className={`flex-1 py-5 text-sm font-bold border-b-2 transition-all ${activeTab === 'OVERTIME' ? 'border-rose-600 text-rose-600 bg-white' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}
          >
            초과근무 승인함
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
                    <div className="text-lg font-bold text-slate-800 mb-1 line-clamp-1">
                      {req.description || req.reason || (activeTab === 'OVERTIME' ? `${req.date} 초과근무` : '제목 없음')}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[8px] text-slate-400">
                          {req.profiles?.full_name?.[0] || 'U'}
                        </div>
                        {req.profiles?.full_name} <span className="text-[10px] font-normal text-slate-400">({req.profiles?.role})</span>
                      </div>
                      <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                      <span className="text-indigo-600">{req.category || req.type || '신청'}</span>
                      {activeTab === 'LEAVE' && req.profiles?.hire_date && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                          <span className="text-emerald-600 text-[10px]">잔여: {(calculateLeaveEntitlement(req.profiles.hire_date, req.profiles.additional_annual_leave) - (req.profiles.used_leave || 0)).toFixed(1)}일</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {activeTab === 'EXPENSE' && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-black text-slate-400">REQUEST AMOUNT</div>
                      <div className="text-xl font-black text-slate-900 tracking-tight">{Math.floor(req.amount || 0).toLocaleString()} <span className="text-xs text-slate-400 font-bold">원</span></div>
                    </div>
                  )}

                  {activeTab === 'OVERTIME' && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-black text-slate-400">DURATION</div>
                      <div className="text-xl font-black text-slate-900 tracking-tight">{req.duration_hours?.toFixed(1)} <span className="text-xs text-slate-400 font-bold">시간</span></div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    <button onClick={() => handleApprove(req)} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors shadow-md flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {isSubAdmin ? '1차 승인' : '최종 승인'}
                    </button>
                    <button onClick={() => openRejectModal(req.id)} className="px-4 py-2 bg-white border border-slate-200 text-rose-500 rounded-lg text-xs font-bold hover:bg-rose-50 hover:border-rose-200 transition-colors flex items-center justify-center gap-1">
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

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">결재 반려 처리</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">사유를 반드시 입력해 주세요.</p>
                </div>
              </div>
              <button onClick={() => setShowRejectModal(false)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">반려 사유</label>
                <textarea 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  placeholder="예: 영수증 증빙 누락, 날짜 오기입 등"
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-rose-500 transition-all resize-none"
                  autoFocus
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowRejectModal(false)} className="flex-1 py-4 text-slate-400 font-bold hover:bg-slate-50 rounded-2xl transition-all">취소</button>
                <button onClick={handleReject} className="flex-2 py-4 px-8 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-lg active:scale-95">반려 완료</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
