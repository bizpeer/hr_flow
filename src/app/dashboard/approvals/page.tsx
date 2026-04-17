'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { CheckSquare, XCircle, Clock, FileText, ChevronRight, Check, AlertCircle, X, Paperclip, Wallet, Calendar, Clock8 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateApprovalStatus, calculateLeaveEntitlement, updateMemberProfile, Approval, ApprovalStatus } from '@/lib/api';

export default function ApprovalsManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'expense' | 'leave' | 'overtime'>('expense');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  // Rejection Modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [targetApprovalId, setTargetApprovalId] = useState<string | null>(null);

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

  const fetchApprovals = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // 1. 신규 통합 approvals 테이블 조회
      // details JSONB 필드에 타입별 요약 정보가 들어있음을 활용
      let query = supabase
        .from('approvals')
        .select(`
          *,
          profiles:requester_id(
            id,
            full_name, 
            role,
            team_id,
            division_id,
            hire_date,
            used_leave,
            additional_annual_leave
          )
        `)
        .eq('company_id', profile.company_id)
        .eq('type', activeTab);

      // 권한별 필터링
      if (isSubAdmin) {
        // 본부장은 본인 부서원의 제출(submitted) 건만 확인
        query = query.eq('status', 'submitted').neq('requester_id', profile.id);
        // 클라이언트 사이드에서 division_id 필터 추가 필요 (아래에서 수행)
      } else if (isAdmin || isSuperAdmin) {
        // 관리자는 1차 승인된 건(approved_l1) 또는 sub_admin이 신청한 제출 건 확인
        query = query.or(`status.eq.approved_l1,and(status.eq.submitted,profiles.role.eq.sub_admin)`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      
      let finalData = data || [];

      // sub_admin 부서 필터링
      if (isSubAdmin && profile.division_id) {
        finalData = finalData.filter((item: any) => item.profiles?.division_id === profile.division_id);
      }
      
      setApprovals(finalData);
    } catch (err) {
      console.error('Error fetching approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();

    const channel = supabase
      .channel('approval-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals', filter: `company_id=eq.${profile?.company_id}` },
        () => fetchApprovals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, activeTab]);

  const handleApprove = async (approval: Approval) => {
    const confirmMsg = isSubAdmin ? '1차 승인하시겠습니까?' : '최종 승인하시겠습니까?';
    if (!confirm(confirmMsg)) return;

    try {
      const nextStatus: ApprovalStatus = isSubAdmin ? 'approved_l1' : 'final_approved';
      const level = isSubAdmin ? 'l1' : 'final';

      // 1. 상태 업데이트
      await updateApprovalStatus(approval.id, nextStatus, profile!.id, level);

      // 2. 최종 승인 시 연차 차감 (타입이 휴가일 경우)
      if (nextStatus === 'final_approved' && approval.type === 'leave') {
        const { data: detail } = await supabase
          .from('leave_requests')
          .select('*')
          .eq('approval_id', approval.id)
          .single();

        if (detail && approval.profiles) {
          const reqProfile = approval.profiles as any;
          const start = new Date(detail.start_date);
          const end = new Date(detail.end_date);
          const days = detail.leave_type.includes('반차') ? 0.5 : (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          
          await updateMemberProfile(reqProfile.id, {
            used_leave: (reqProfile.used_leave || 0) + days
          });
        }
      }

      alert(isSubAdmin ? '1차 승인이 완료되었습니다.' : '최종 승인이 완료되었습니다.');
      fetchApprovals();
    } catch (e: any) { 
      console.error('Approve Error:', e);
      alert('처리 중 오류가 발생했습니다: ' + e.message); 
    }
  };

  const openRejectModal = (id: string) => {
    setTargetApprovalId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!targetApprovalId || !rejectionReason.trim()) {
      alert('반려 사유를 입력해 주세요.');
      return;
    }

    try {
      await updateApprovalStatus(targetApprovalId, 'rejected', profile!.id, isSubAdmin ? 'l1' : 'final');
      // 반려 사유는 별도 로그나 메타데이터에 저장 가능 (현재는 상태만 변경)
      
      setShowRejectModal(false);
      fetchApprovals();
      alert('반려 처리가 완료되었습니다.');
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20 px-4 md:px-0">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
          <CheckSquare className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">통합 결재 승인함</h1>
          <p className="text-sm text-slate-500 font-medium">SaaS 통합 결재 프로세스에 따라 문서를 처리합니다.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        {/* Tabs */}
        <div className="flex items-center border-b border-slate-100 bg-slate-50/30 p-2">
          {[
            { id: 'expense', label: '지출결의', icon: Wallet },
            { id: 'leave', label: '휴가/근태', icon: Calendar },
            { id: 'overtime', label: '초과근무', icon: Clock8 }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-4 flex items-center justify-center gap-2 rounded-2xl text-sm font-black transition-all ${
                activeTab === tab.id 
                ? 'bg-slate-900 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="p-8">
          {loading ? (
             <div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600"></div></div>
          ) : (
            <div className="space-y-4">
              {approvals.map(app => (
                <div key={app.id} className="group p-6 rounded-3xl border border-slate-100 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-100/30 transition-all bg-white flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
                      app.status === 'approved_l1' ? 'bg-indigo-50 text-indigo-500 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                    }`}>
                      {app.status === 'approved_l1' ? <Check className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                          app.status === 'approved_l1' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {app.status === 'approved_l1' ? '1차 승인됨' : '대기 중'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">{new Date(app.created_at).toLocaleDateString()}</span>
                      </div>
                      <h3 className="text-lg font-black text-slate-800 tracking-tight">{app.title}</h3>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs font-bold text-slate-500">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg">
                          <div className="w-4 h-4 rounded-full bg-slate-200" />
                          <span>{(app.profiles as any)?.full_name}</span>
                        </div>
                        {app.type === 'expense' && (app.details as any)?.amount && (
                          <span className="text-rose-600">₩{Number((app.details as any).amount).toLocaleString()}</span>
                        )}
                        {app.type === 'leave' && (app.details as any)?.start_date && (
                          <span className="text-indigo-600">{(app.details as any).start_date} ~ {(app.details as any).end_date}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleApprove(app)} 
                      className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" /> {isSubAdmin ? '1차 승인' : '최종 승인'}
                    </button>
                    <button 
                      onClick={() => openRejectModal(app.id)} 
                      className="px-6 py-3 bg-white border border-slate-100 text-slate-400 rounded-2xl text-xs font-black hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" /> 반려
                    </button>
                  </div>
                </div>
              ))}

              {approvals.length === 0 && (
                <div className="py-24 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100">
                    <FileText className="w-8 h-8 text-slate-200" />
                  </div>
                  <h3 className="text-lg font-black text-slate-700 tracking-tight">처리할 결재 건이 없습니다.</h3>
                  <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mt-1">Peaceful day! No pending documents.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center space-y-4">
              <div className="w-20 h-20 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mx-auto mb-6">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">결재 반려</h3>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">준비된 반려 사유가 있다면 입력해 주세요. <br/>신청자에게 알림이 전달됩니다.</p>
              
              <textarea 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="반려 사유 입력 (필수)"
                className="w-full mt-6 p-5 bg-slate-50 border-none rounded-2xl text-sm font-bold min-h-[120px] focus:ring-2 focus:ring-rose-500/20"
              />

              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => setShowRejectModal(false)} 
                  className="flex-1 py-4 text-slate-400 font-black hover:bg-slate-50 rounded-2xl uppercase tracking-widest text-[11px]"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReject} 
                  className="flex-1 py-4 bg-rose-600 text-white font-black rounded-2xl shadow-xl shadow-rose-100 hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px]"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
