import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  CheckCircle, XCircle, Clock, FileText, Calendar, Filter, User, 
  Check, X, ShieldCheck, Search, Building, Users, RotateCcw, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';

interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  requestDays: number;
  teamId?: string;
  divisionId?: string;
  attachmentName?: string;
  attachmentUrl?: string;
}

interface ExpenseRequest {
  id: string;
  userId: string;
  userName: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  teamId?: string;
  divisionId?: string;
  attachmentName?: string;
  attachmentUrl?: string;
}

export const AdminApprovals: React.FC = () => {
  const { userData } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'LEAVE' | 'EXPENSE'>('LEAVE');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  // 필터 상태 추가
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  
  // 조직 데이터 상태
  const [divisions, setDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyId = userData.companyId;

    // 1. 신청 내역 구독 (companyId 기반 격리)
    const qLeave = query(collection(db, 'leaves'), where('companyId', '==', companyId));
    const unsubLeave = onSnapshot(qLeave, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));
      setLeaveRequests(docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });

    const qExpense = query(collection(db, 'expenses'), where('companyId', '==', companyId));
    const unsubExpense = onSnapshot(qExpense, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseRequest));
      setExpenseRequests(docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });

    // 2. 조직/사용자 데이터 구독 (조인을 위함)
    const unsubDivs = onSnapshot(query(collection(db, 'divisions'), where('companyId', '==', companyId)), (snap) => {
      setDivisions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('companyId', '==', companyId)), (snap) => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'UserProfile'), where('companyId', '==', companyId)), (snap) => {
      setEmployees(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });

    return () => { 
      unsubLeave(); unsubExpense();
      unsubDivs(); unsubTeams(); unsubUsers();
    };
  }, [userData?.companyId]);
  const handleUpdateStatus = async (collectionName: string, id: string, newStatus?: 'APPROVED' | 'REJECTED' | 'PENDING' | 'SUB_APPROVED') => {
    try {
      const userRole = employees.find(e => e.uid === userData?.uid)?.role || userData?.role;
      const targetStatus = newStatus || (userRole === 'SUB_ADMIN' ? 'SUB_APPROVED' : 'APPROVED');
      
      const actionText = targetStatus === 'SUB_APPROVED' ? '1차 승인' : 
                        targetStatus === 'APPROVED' ? '최종 승인' : 
                        targetStatus === 'REJECTED' ? '반려' : '결재대기(취소)';

      if (!window.confirm(`이 요청을 ${actionText} 상태로 변경하시겠습니까?${targetStatus === 'PENDING' ? '\n(연차 승인 건의 경우 소진된 연차가 자동으로 복구됩니다.)' : ''}`)) return;
      
      await updateDoc(doc(db, collectionName, id), { 
        status: targetStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: userData?.name || '시스템'
      });
      alert(`${actionText} 처리가 완료되었습니다.`);
    } catch (err: any) {
      alert('상태 업데이트 실패: ' + err.message);
    }
  };

  // 필터 로직 함수
  const applyFilters = (requests: any[]) => {
    // 0. 현재 로그인한 사용자의 실시간 최신 권한 확인 (새롭게 임명된 관리자 대응)
    const currentProfile = employees.find(e => e.uid === userData?.uid);
    const currentUserRole = currentProfile?.role || userData?.role;

    return requests.filter(req => {
      // 1. 상태 필터 (대기/승인/반려/전체)
      const statusMatch = filter === 'ALL' || 
                         (filter === 'PENDING' ? (req.status === 'PENDING' || req.status === 'SUB_APPROVED') : req.status === filter);
      
      // 2. 월별 필터 (createdAt 기준)
      const reqDate = req.createdAt ? new Date(req.createdAt) : null;
      const monthMatch = reqDate ? format(reqDate, 'yyyy-MM') === selectedMonth : true;

      // 3. 조직 필터 (사용자의 현재 소속 매칭)
      const userProfile = employees.find(e => e.uid === req.userId);
      const userTeamId = req.teamId || userProfile?.teamId;
      const userTeam = teams.find(t => t.id === userTeamId);
      const userDivId = req.divisionId || userTeam?.divisionId;

      const divMatch = selectedDivision === 'ALL' || userDivId === selectedDivision;
      const teamMatch = selectedTeam === 'ALL' || userTeamId === selectedTeam;

      // 4. 부관리자(SUB_ADMIN) 보안 필터링: 본인 본부 내역만 노출
      if (currentUserRole === 'SUB_ADMIN') {
        const subAdminTeam = teams.find(t => t.id === currentProfile?.teamId);
        const subAdminDivId = subAdminTeam?.divisionId;
        
        // 본인 본부와 일치하지 않으면 제외
        if (userDivId !== subAdminDivId) return false;
      }

      return statusMatch && monthMatch && divMatch && teamMatch;
    });
  };

  const filteredLeaves = applyFilters(leaveRequests);
  const filteredExpenses = applyFilters(expenseRequests);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'SUB_APPROVED': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'REJECTED': return 'bg-rose-50 text-rose-600 border-rose-100';
      default: return 'bg-amber-50 text-amber-600 border-amber-100';
    }
  };

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">전자결재/승인 관리</h1>
            </div>
            <p className="text-slate-500 font-medium">부서별, 월별 안건을 고도화된 필터로 한눈에 조회합니다.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-white p-2.5 rounded-[2.5rem] premium-shadow border border-slate-100">
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-3 rounded-2xl text-xs font-black transition-all tracking-tight ${
                   filter === f ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                {f === 'PENDING' ? '결재대기' : f === 'APPROVED' ? '최종승인' : f === 'REJECTED' ? '반려건' : '전체보기'}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Filter Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
           {/* Month Selection */}
           <div className="bg-white p-5 rounded-3xl shadow-xl border border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Calendar className="w-3 h-3" /> 조회 기준 월
              </span>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
              />
           </div>

           {/* Division Selection */}
           <div className="bg-white p-5 rounded-3xl shadow-xl border border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Building className="w-3 h-3" /> 본부 전체
              </span>
              <select 
                value={selectedDivision}
                onChange={(e) => { setSelectedDivision(e.target.value); setSelectedTeam('ALL'); }}
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-sm appearance-none"
              >
                <option value="ALL">전체 본부</option>
                {divisions.map(div => <option key={div.id} value={div.id}>{div.name}</option>)}
              </select>
           </div>

           {/* Team Selection */}
           <div className="bg-white p-5 rounded-3xl shadow-xl border border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Users className="w-3 h-3" /> 팀 선택
              </span>
              <select 
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                disabled={selectedDivision === 'ALL'}
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-sm appearance-none disabled:opacity-30 disabled:grayscale"
              >
                <option value="ALL">전체 팀</option>
                {teams.filter(t => t.divisionId === selectedDivision).map(team => (
                   <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
           </div>

           {/* Quick Search */}
           <div className="bg-white p-5 rounded-3xl shadow-xl border border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Search className="w-3 h-3" /> 이름 검색
              </span>
              <input 
                type="text" 
                placeholder="신청자명..." 
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
              />
           </div>
        </div>

        {/* Tab Selection */}
        <div className="flex p-1.5 bg-slate-200/50 rounded-[2.5rem] w-fit premium-shadow border border-slate-100">
          <button 
            onClick={() => setActiveTab('LEAVE')}
            className={`flex items-center gap-3 px-10 py-5 rounded-[2rem] font-black text-sm transition-all duration-500 ${activeTab === 'LEAVE' ? 'bg-white text-indigo-700 shadow-xl scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Calendar className={`w-5 h-5 ${activeTab === 'LEAVE' ? 'text-indigo-600' : 'text-slate-400'}`} />
            휴가 신청 건 ({filteredLeaves.length})
          </button>
          <button 
            onClick={() => setActiveTab('EXPENSE')}
            className={`flex items-center gap-3 px-10 py-5 rounded-[2rem] font-black text-sm transition-all duration-500 ${activeTab === 'EXPENSE' ? 'bg-white text-emerald-700 shadow-xl scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileText className={`w-5 h-5 ${activeTab === 'EXPENSE' ? 'text-emerald-600' : 'text-slate-400'}`} />
            지출결의 건 ({filteredExpenses.length})
          </button>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[500px]">
           <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                 <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-50">
                       <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">요청 일시 / 신청자 / 소속</th>
                       <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeTab === 'LEAVE' ? '공가 유형 / 사유' : '분류 / 항목'}</th>
                       <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeTab === 'LEAVE' ? '휴가 기간 / 총 일수' : '금액'}</th>
                       <th className="px-8 py-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">처리 상태</th>
                       <th className="px-8 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">상세 / 관리</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 font-sans">
                    {(activeTab === 'LEAVE' ? filteredLeaves : filteredExpenses).map((req: any) => {
                       const userProf = employees.find(e => e.uid === req.userId);
                       const userTeam = teams.find(t => t.id === (req.teamId || userProf?.teamId));
                       const userDiv = divisions.find(d => d.id === (req.divisionId || userTeam?.divisionId));

                       return (
                        <tr key={req.id} className="group hover:bg-slate-50/80 transition-all duration-300">
                           <td className="px-8 py-7">
                              <div className="flex items-center gap-4">
                                 <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all group-hover:rotate-6 shadow-sm border border-slate-50">
                                    <User className="w-5.5 h-5.5" />
                                 </div>
                                 <div className="space-y-1">
                                    <div className="text-sm font-black text-slate-800">{req.userName}</div>
                                    <div className="flex items-center gap-1.5">
                                       <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                          {userDiv?.name || '소속미지정'}
                                       </span>
                                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                          {userTeam?.name || '팀 미지정'}
                                       </span>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-300">
                                       {req.createdAt ? format(new Date(req.createdAt), 'yyyy.MM.dd HH:mm') : '-'}
                                    </div>
                                 </div>
                              </div>
                           </td>

                           <td className="px-8 py-7">
                              <div className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black tracking-widest uppercase mb-1.5 bg-slate-100 text-slate-600 border border-slate-200">
                                 {activeTab === 'LEAVE' ? (req.type === 'annual' ? '연차' : req.type === 'half' ? '반차' : req.type === 'sick' ? '병가' : '기타') : req.category}
                              </div>
                              <div className="text-sm font-black text-slate-700 line-clamp-1 max-w-[220px]">
                                 {activeTab === 'LEAVE' ? req.reason : req.title}
                              </div>
                           </td>

                           <td className="px-8 py-7">
                              {activeTab === 'LEAVE' ? (
                                 <div className="space-y-1">
                                    <div className="text-sm font-black text-slate-800">{req.startDate} ~ {req.endDate}</div>
                                    <div className="text-[10px] font-black text-rose-500 flex items-center gap-1">
                                       <Clock className="w-3 h-3" /> 소진일: {req.requestDays}일
                                    </div>
                                 </div>
                              ) : (
                                 <div className="space-y-1">
                                    <div className="text-lg font-black text-slate-900 tracking-tighter italic block">₩ {Number(req.amount).toLocaleString()}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{req.date} 지출</div>
                                 </div>
                              )}
                           </td>

                           <td className="px-8 py-7">
                              <div className="flex justify-center">
                                 <span className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-black border transition-all ${getStatusStyle(req.status)}`}>
                                    {req.status === 'APPROVED' ? <CheckCircle className="w-3.5 h-3.5" /> : 
                                     req.status === 'SUB_APPROVED' ? <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> :
                                     req.status === 'REJECTED' ? <XCircle className="w-3.5 h-3.5" /> : 
                                     <Clock className="w-3.5 h-3.5 animate-spin-slow" />}
                                    {req.status === 'APPROVED' ? '최종승인' : 
                                     req.status === 'SUB_APPROVED' ? '1차 승인됨' :
                                     req.status === 'REJECTED' ? '반려됨' : '결재대기'}
                                 </span>
                              </div>
                           </td>

                           <td className="px-8 py-7 text-right">
                              <div className="flex items-center justify-end gap-2.5">
                                 <button 
                                    onClick={() => setSelectedRequest(req)}
                                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-slate-100"
                                 >
                                    View Details
                                 </button>
                                 {/* 신청 유형별/권한별 처리 버튼 */}
                                 {((userData?.role === 'SUB_ADMIN' && req.status === 'PENDING') || 
                                   (userData?.role === 'ADMIN' && (req.status === 'PENDING' || req.status === 'SUB_APPROVED'))) ? (
                                    <>
                                       <button 
                                          onClick={() => handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', req.id, userData?.role === 'ADMIN' ? 'APPROVED' : 'SUB_APPROVED')}
                                          className={`p-3 rounded-2xl transition-all shadow-sm border group/btn ${
                                            userData?.role === 'ADMIN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-600 hover:text-white'
                                          }`}
                                          title={userData?.role === 'ADMIN' ? "최종 승인" : "1차 승인"}
                                       >
                                          {userData?.role === 'ADMIN' ? <CheckCircle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                                       </button>
                                       <button 
                                          onClick={() => handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', req.id, 'REJECTED')}
                                          className="p-3 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-600 hover:text-white hover:scale-110 active:scale-95 transition-all shadow-sm border border-rose-100"
                                          title="반려"
                                       >
                                          <X className="w-5 h-5 font-black" />
                                       </button>
                                    </>
                                 ) : (
                                    <div className="flex items-center justify-end gap-2.5">
                                       {/* 최고 관리자(ADMIN)만 되돌리기 가능 */}
                                       {userData?.role === 'ADMIN' && (req.status === 'APPROVED' || req.status === 'REJECTED' || req.status === 'SUB_APPROVED') && (
                                          <button 
                                             onClick={() => handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', req.id, 'PENDING')}
                                             className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all shadow-sm border border-amber-100 group/undo"
                                             title="결재취소 및 복구"
                                          >
                                             <RotateCcw className="w-4 h-4 group-hover/undo:-rotate-45 transition-transform" />
                                             <span className="text-[10px] font-black uppercase tracking-tight">Undo</span>
                                          </button>
                                       )}
                                       <button className="px-4 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                                          History
                                       </button>
                                    </div>
                                 )}
                              </div>
                           </td>
                        </tr>
                       );
                    })}
                    {(activeTab === 'LEAVE' ? filteredLeaves : filteredExpenses).length === 0 && (
                       <tr>
                          <td colSpan={5} className="py-40 text-center">
                             <div className="flex flex-col items-center gap-5">
                                 <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center border border-slate-100 shadow-inner group/empty">
                                    <Filter className="w-10 h-10 text-slate-200 group-hover/empty:scale-110 transition-transform" />
                                 </div>
                                 <div className="space-y-1">
                                    <p className="text-slate-500 font-black tracking-tight text-xl">조회 조건에 맞는 안건이 없습니다.</p>
                                    <p className="text-slate-400 text-sm font-medium">필터(기간, 소속, 상태)를 조정해 보세요.</p>
                                 </div>
                             </div>
                          </td>
                       </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </div>

        {/* Stats Summary Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
           <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-125 duration-700"></div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Total Monthly Approvals</p>
              <div className="text-4xl font-black mb-4">
                 {(filteredLeaves.filter(r => r.status === 'APPROVED').length + filteredExpenses.filter(r => r.status === 'APPROVED').length)}
                 <span className="text-sm opacity-60 ml-2 uppercase">Cases</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-200 text-xs font-black">
                 <CheckCircle className="w-4 h-4" />
                 <span>선택된 조건 내 최종 승인 합계</span>
              </div>
           </div>

           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl group">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Waitings Task</p>
               <div className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">
                  {(leaveRequests.filter(r => r.status === 'PENDING' || r.status === 'SUB_APPROVED').length + 
                    expenseRequests.filter(r => r.status === 'PENDING' || r.status === 'SUB_APPROVED').length)}
               </div>
              <div className="flex items-center gap-2 text-amber-500 text-xs font-black">
                 <Clock className="w-4 h-4 animate-spin-slow" />
                 <span>전체 미처리 안건 (실시간)</span>
              </div>
           </div>

           <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Total Monthly Spendings</p>
              <div className="text-3xl font-black text-emerald-400 mb-4 italic">
                 ₩ {filteredExpenses.filter(r => r.status === 'APPROVED').reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-500 font-bold tracking-tight">이 달의 부서별 승인 금액 총계</p>
           </div>

           <div className="bg-rose-500 p-8 rounded-[2.5rem] text-white shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Rejection Rate</p>
              <div className="text-4xl font-black mb-4 tracking-tighter">
                 {Math.round(((filteredLeaves.filter(r => r.status === 'REJECTED').length + filteredExpenses.filter(r => r.status === 'REJECTED').length) / (Math.max(1, filteredLeaves.length + filteredExpenses.length))) * 100)}%
              </div>
              <div className="flex items-center gap-2 text-rose-100 text-[10px] font-bold">
                 <XCircle className="w-4 h-4" />
                 <span>반려 처리된 안건 비율</span>
              </div>
           </div>
        </div>
      </div>

      {/* 결재 상세 정보 모달 */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500">
              {/* Modal Header */}
              <div className="p-10 border-b border-slate-50 flex justify-between items-start">
                 <div className="space-y-4">
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">
                       Approval Document Detail
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                       {activeTab === 'LEAVE' ? '휴가 신청 상세서' : '지출결의 상세서'}
                    </h2>
                    <div className="flex items-center gap-4 text-slate-400">
                       <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg text-xs font-bold">
                          <User className="w-3.5 h-3.5" /> {selectedRequest.userName}
                       </div>
                       <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg text-xs font-bold">
                          <Calendar className="w-3.5 h-3.5" /> {selectedRequest.createdAt ? format(new Date(selectedRequest.createdAt), 'yyyy.MM.dd') : '-'}
                       </div>
                    </div>
                 </div>
                 <button 
                  onClick={() => setSelectedRequest(null)}
                  className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 hover:text-slate-900 transition-all"
                 >
                    <X className="w-6 h-6" />
                 </button>
              </div>

              {/* Modal Body */}
              <div className="p-10 space-y-10 max-h-[60vh] overflow-y-auto premium-scrollbar">
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">신청 분류</span>
                       <div className="p-4 bg-slate-50 rounded-2xl font-black text-slate-700 border border-slate-100">
                          {activeTab === 'LEAVE' ? (selectedRequest.type === 'annual' ? '연차 휴가' : selectedRequest.type === 'half' ? '반차 휴가' : '경조사/병가') : selectedRequest.category}
                       </div>
                    </div>
                    <div className="space-y-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{activeTab === 'LEAVE' ? '총 소진 일수' : '최종 결제 금액'}</span>
                       <div className={`p-4 rounded-2xl font-black border ${activeTab === 'LEAVE' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {activeTab === 'LEAVE' ? `${selectedRequest.requestDays} 일` : `₩ ${Number(selectedRequest.amount).toLocaleString()}`}
                       </div>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{activeTab === 'LEAVE' ? '휴가 기간' : '지출 상세 내용'}</span>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 min-h-[100px]">
                       {activeTab === 'LEAVE' ? (
                          <div className="flex items-center justify-between">
                             <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Start Date</span>
                                <span className="text-xl font-black text-slate-800">{selectedRequest.startDate}</span>
                             </div>
                             <div className="w-10 h-px bg-slate-300"></div>
                             <div className="flex flex-col gap-1 items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">End Date</span>
                                <span className="text-xl font-black text-slate-800">{selectedRequest.endDate}</span>
                             </div>
                          </div>
                       ) : (
                          <p className="text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">{selectedRequest.description || selectedRequest.title}</p>
                       )}
                    </div>
                 </div>

                 {activeTab === 'LEAVE' && (
                    <div className="space-y-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">상세 사유</span>
                       <div className="p-6 bg-slate-900 rounded-3xl text-slate-200 border border-slate-800 shadow-xl">
                          <p className="text-base font-medium leading-relaxed whitespace-pre-wrap italic">"{selectedRequest.reason}"</p>
                       </div>
                    </div>
                 )}

                 <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                    <Clock className="w-5 h-5 text-amber-500 animate-spin-slow" />
                    <div>
                        <p className="text-xs font-bold text-amber-600">
                          현재 이 문서는 <span className="underline font-black">{
                            selectedRequest.status === 'PENDING' ? '1차 검토 대기' : 
                            selectedRequest.status === 'SUB_APPROVED' ? '2차 최종 승인 대기' : 
                            selectedRequest.status === 'APPROVED' ? '최종 승인 완료' : '반려됨'
                          }</span> 상태입니다.
                        </p>
                    </div>
                 </div>

                 {/* 첨부파일 섹션 - 항상 제목은 표시하여 존재감을 인지시킴 */}
                 <div className="space-y-4 pt-6 border-t border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">첨부 증빙 자료 (Attachments)</span>
                    
                    {selectedRequest.attachmentUrl ? (
                       <>
                          {/* 이미지 미리보기 (URL이 있고 이미지 형식인 경우) */}
                          {(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some(ext => selectedRequest.attachmentUrl?.toLowerCase().includes(ext)) || 
                            selectedRequest.attachmentUrl?.includes('image%2F')) && (
                             <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                                <img 
                                   src={selectedRequest.attachmentUrl} 
                                   alt="Attachment Preview" 
                                   className="w-full h-auto max-h-[300px] object-contain cursor-pointer hover:scale-[1.02] transition-transform"
                                   onClick={() => window.open(selectedRequest.attachmentUrl, '_blank')}
                                />
                             </div>
                          )}

                          <div className="flex items-center justify-between p-5 bg-white border-2 border-indigo-50 rounded-2xl shadow-sm hover:border-indigo-200 transition-all group/file">
                             <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 group-hover/file:bg-indigo-600 group-hover/file:text-white transition-all">
                                   <FileText className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                   <p className="text-sm font-black text-slate-800 truncate">{selectedRequest.attachmentName || '첨부 파일 (확인이 필요한 경우 클릭)'}</p>
                                   <p className="text-[10px] font-bold text-slate-400">클릭 시 안전한 보안 링크로 파일을 확인합니다.</p>
                                </div>
                             </div>
                             <button 
                                onClick={() => window.open(selectedRequest.attachmentUrl, '_blank')}
                                className="px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 shrink-0 ml-4"
                             >
                                Download / View
                             </button>
                          </div>
                       </>
                    ) : selectedRequest.attachmentName ? (
                       <div className="flex items-center justify-between p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl group/file">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                                <FileText className="w-6 h-6" />
                              </div>
                             <div>
                                <p className="text-sm font-black text-slate-700 truncate max-w-[300px]">{selectedRequest.attachmentName}</p>
                                <p className="text-[10px] font-bold text-rose-400">파일 데이터가 존재하지 않는 이전 요청 건입니다.</p>
                             </div>
                          </div>
                       </div>
                    ) : (
                       <div className="p-10 border-2 border-slate-100 border-dashed rounded-3xl flex flex-col items-center gap-3 text-slate-300 bg-slate-50/30">
                          <AlertCircle className="w-8 h-8 opacity-20" />
                          <p className="text-xs font-bold italic">첨부된 증빙 서류가 없습니다.</p>
                       </div>
                    )}
                 </div>
              </div>

              {/* Modal Footer */}
              <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-4">
                 <button 
                  onClick={() => setSelectedRequest(null)}
                  className="flex-1 py-5 bg-white border border-slate-200 text-slate-400 font-black rounded-2xl hover:bg-slate-100 transition-all uppercase tracking-[0.2em] text-xs"
                 >
                    Close
                 </button>
                 {selectedRequest.status === 'PENDING' && (
                    <>
                       <button 
                        onClick={() => { handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', selectedRequest.id, 'APPROVED'); setSelectedRequest(null); }}
                        className="flex-[1.5] py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 uppercase tracking-[0.2em] text-xs"
                       >
                          Final Approve
                       </button>
                    </>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
