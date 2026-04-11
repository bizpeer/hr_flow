'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { 
  ShieldCheck, 
  Calendar, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search, 
  Filter, 
  Building, 
  Users, 
  User, 
  AlertCircle, 
  X, 
  RotateCcw,
  ChevronRight,
  PieChart,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  getDivisions, 
  getTeams, 
  updateRequestStatus, 
  Profile, 
  Division, 
  Team,
  Expense,
  Leave
} from '@/lib/api';

export default function ApprovalCenter() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'LEAVE' | 'EXPENSE'>('LEAVE');
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [expenseRequests, setExpenseRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Org Data
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [divs, tms, { data: profiles }] = await Promise.all([
          getDivisions(profile.company_id),
          getTeams(profile.company_id),
          supabase.from('profiles').select('*').eq('company_id', profile.company_id)
        ]);
        
        setDivisions(divs);
        setTeams(tms);
        setAllProfiles(profiles || []);

        const [leavesRes, expensesRes] = await Promise.all([
          supabase.from('leave_requests').select('*, profiles(full_name)').eq('company_id', profile.company_id).order('created_at', { ascending: false }),
          supabase.from('expense_requests').select('*, profiles(full_name)').eq('company_id', profile.company_id).order('created_at', { ascending: false })
        ]);

        if (leavesRes.data) setLeaveRequests(leavesRes.data);
        if (expensesRes.data) setExpenseRequests(expensesRes.data);
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Real-time updates
    const channel = supabase.channel('approvals_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests', filter: `company_id=eq.${profile.company_id}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_requests', filter: `company_id=eq.${profile.company_id}` }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.company_id]);

  const handleUpdateStatus = async (type: 'expense' | 'leave', id: string, newStatus: any) => {
    if (!profile) return;
    
    const actionText = newStatus === 'SUB_APPROVED' ? '1차 승인' : 
                      newStatus === 'APPROVED' ? '최종 승인' : 
                      newStatus === 'REJECTED' ? '반려' : '결재대기(취소)';

    if (!window.confirm(`이 요청을 ${actionText} 상태로 변경하시겠습니까?`)) return;
    
    try {
      await updateRequestStatus(type, id, newStatus);
      // Data will refresh via real-time channel
    } catch (err: any) {
      alert('상태 업데이트 실패: ' + err.message);
    }
  };

  const applyFilters = (requests: any[]) => {
    return requests.filter(req => {
      // 1. Status Filter
      const statusMatch = statusFilter === 'ALL' || 
                         (statusFilter === 'PENDING' ? (req.status === 'PENDING' || req.status === 'SUB_APPROVED') : req.status === statusFilter);
      
      // 2. Month Filter
      const reqDate = req.created_at ? new Date(req.created_at) : null;
      const monthMatch = reqDate ? format(reqDate, 'yyyy-MM') === selectedMonth : true;

      // 3. Org Filter
      const applicantProfile = allProfiles.find(p => p.id === req.user_id);
      const userTeamId = req.team_id || applicantProfile?.team_id;
      const userDivId = req.division_id || teams.find(t => t.id === userTeamId)?.division_id;

      const divMatch = selectedDivision === 'ALL' || userDivId === selectedDivision;
      const teamMatch = selectedTeam === 'ALL' || userTeamId === selectedTeam;

      // 4. Name Search
      const nameMatch = !searchQuery || req.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());

      // 5. sub_admin Security: Only show their own division
      if (profile?.role === 'sub_admin') {
        const subAdminTeam = teams.find(t => t.id === profile.team_id);
        if (userDivId !== subAdminTeam?.division_id) return false;
      }

      return statusMatch && monthMatch && divMatch && teamMatch && nameMatch;
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">결재 센터 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-slate-900 rounded-[2rem] text-white flex items-center justify-center shadow-2xl">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Approval Center</h1>
              <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Workflow Management Engine
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-1.5 rounded-[2rem] shadow-xl border border-slate-100 flex gap-1">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-6 py-3 rounded-[1.5rem] text-[11px] font-black transition-all tracking-widest uppercase ${
                statusFilter === f 
                ? 'bg-slate-900 text-white shadow-lg' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f === 'PENDING' ? '대기' : f === 'APPROVED' ? '승인' : f === 'REJECTED' ? '반려' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          label="Waitings" 
          value={(leaveRequests.filter(r => r.status === 'PENDING' || r.status === 'SUB_APPROVED').length + 
                  expenseRequests.filter(r => r.status === 'PENDING' || r.status === 'SUB_APPROVED').length).toString()}
          unit="Items"
          icon={<Clock className="w-5 h-5" />}
          color="indigo"
        />
        <StatsCard 
          label="Monthly Budget" 
          value={expenseRequests.filter(r => r.status === 'APPROVED' && format(new Date(r.created_at), 'yyyy-MM') === selectedMonth).reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}
          unit="KRW"
          icon={<PieChart className="w-5 h-5" />}
          color="emerald"
          dark
        />
        <StatsCard 
          label="Total Approvals" 
          value={(leaveRequests.filter(r => r.status === 'APPROVED').length + expenseRequests.filter(r => r.status === 'APPROVED').length).toString()}
          unit="Forms"
          icon={<CheckCircle className="w-5 h-5" />}
          color="sky"
        />
        <StatsCard 
          label="Rejection Rate" 
          value={Math.round(((leaveRequests.filter(r => r.status === 'REJECTED').length + expenseRequests.filter(r => r.status === 'REJECTED').length) / (Math.max(1, leaveRequests.length + expenseRequests.length))) * 100).toString()}
          unit="%"
          icon={<XCircle className="w-5 h-5" />}
          color="rose"
        />
      </div>

      {/* Filters Box */}
      <div className="p-4 rounded-[3rem] bg-slate-50 border border-slate-200/50 flex flex-col md:flex-row gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterItem icon={<Calendar />} type="month" value={selectedMonth} onChange={setSelectedMonth} />
          
          <div className="relative">
            <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={selectedDivision} 
              onChange={(e) => { setSelectedDivision(e.target.value); setSelectedTeam('ALL'); }}
              className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 appearance-none"
            >
              <option value="ALL">ALL DIVISIONS</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="relative">
            <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={selectedTeam} 
              onChange={(e) => setSelectedTeam(e.target.value)}
              disabled={selectedDivision === 'ALL'}
              className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 appearance-none disabled:bg-slate-100 disabled:opacity-50"
            >
              <option value="ALL">ALL TEAMS</option>
              {teams.filter(t => t.division_id === selectedDivision).map(t => <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
            <input 
              type="text" 
              placeholder="SEARCH APPLICANT..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-2 bg-slate-900/5 rounded-[2.5rem] w-fit border border-white gap-2">
        <TabButton 
          active={activeTab === 'LEAVE'} 
          onClick={() => setActiveTab('LEAVE')} 
          label="Leave Requests" 
          count={filteredLeaves.length} 
          icon={<Calendar className="w-4 h-4" />}
          color="indigo"
        />
        <TabButton 
          active={activeTab === 'EXPENSE'} 
          onClick={() => setActiveTab('EXPENSE')} 
          label="Expense Forms" 
          count={filteredExpenses.length} 
          icon={<FileText className="w-4 h-4" />}
          color="emerald"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-[3rem] border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-7 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Applicant / Office</th>
                <th className="px-10 py-7 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Details</th>
                <th className="px-10 py-7 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Amount / Period</th>
                <th className="px-10 py-7 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                <th className="px-10 py-7 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(activeTab === 'LEAVE' ? filteredLeaves : filteredExpenses).map((req) => (
                <tr key={req.id} className="group hover:bg-slate-50/50 transition-all">
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-black">
                        {req.profiles?.full_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{req.profiles?.full_name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                          {req.division_name || 'Organization Member'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <div className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase mb-1 ${activeTab === 'LEAVE' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {activeTab === 'LEAVE' ? req.type : req.category}
                    </div>
                    <p className="text-sm font-bold text-slate-600 truncate max-w-[200px]">{req.reason || req.description}</p>
                  </td>
                  <td className="px-10 py-6">
                    {activeTab === 'LEAVE' ? (
                      <div className="text-sm font-black text-slate-900">{req.start_date} ~ {req.end_date}</div>
                    ) : (
                      <div className="text-sm font-black text-slate-900">₩ {(req.amount || 0).toLocaleString()}</div>
                    )}
                  </td>
                  <td className="px-10 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border ${getStatusStyle(req.status)}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-10 py-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => setSelectedRequest(req)}
                        className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-indigo-600 transition-colors shadow-lg"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                      {(req.status === 'PENDING' || (req.status === 'SUB_APPROVED' && ['super_admin', 'admin'].includes(profile?.role || '')) ) && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleUpdateStatus(activeTab === 'LEAVE' ? 'leave' : 'expense', req.id, ['super_admin', 'admin'].includes(profile?.role || '') ? 'APPROVED' : 'SUB_APPROVED')}
                            className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(activeTab === 'LEAVE' ? 'leave' : 'expense', req.id, 'REJECTED')}
                            className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(activeTab === 'LEAVE' ? filteredLeaves : filteredExpenses).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest italic">
                    No requests found matching filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Simplified version of the detailed one from sub_hrmgt */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 pb-6 flex justify-between items-center border-b border-slate-50">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Document Review</h2>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <DetailBox label="Applicant" value={selectedRequest.profiles?.full_name} />
                <DetailBox label="Date" value={format(new Date(selectedRequest.created_at), 'yyyy-MM-dd')} />
                <DetailBox label="Category" value={activeTab === 'LEAVE' ? selectedRequest.type : selectedRequest.category} highlight />
                <DetailBox label="Amount/Period" value={activeTab === 'LEAVE' ? `${selectedRequest.start_date} ~ ${selectedRequest.end_date}` : `₩ ${(selectedRequest.amount || 0).toLocaleString()}`} highlight />
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description / Reason</p>
                <p className="text-slate-800 font-bold leading-relaxed">{selectedRequest.reason || selectedRequest.description || 'No additional details provided.'}</p>
              </div>
            </div>
            <div className="p-10 pt-4 bg-slate-50/50 flex gap-4">
              <button onClick={() => setSelectedRequest(null)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-400 font-black rounded-2xl uppercase text-[11px]">Close</button>
              {(selectedRequest.status === 'PENDING' || (selectedRequest.status === 'SUB_APPROVED' && ['super_admin', 'admin'].includes(profile?.role || ''))) && (
                <button 
                  onClick={() => { handleUpdateStatus(activeTab === 'LEAVE' ? 'leave' : 'expense', selectedRequest.id, ['super_admin', 'admin'].includes(profile?.role || '') ? 'APPROVED' : 'SUB_APPROVED'); setSelectedRequest(null); }}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase text-[11px]"
                >
                  Approve Document
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsCard({ label, value, unit, icon, color, dark = false }: any) {
  const colorMap: any = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    rose: 'bg-rose-50 text-rose-600'
  };
  
  return (
    <div className={`p-8 rounded-[2.5rem] relative overflow-hidden group border ${dark ? 'bg-slate-900 text-white border-transparent' : 'bg-white text-slate-900 border-slate-100'}`}>
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110 ${dark ? 'bg-indigo-500/10' : colorMap[color].split(' ')[0]}`} />
      <div className="relative z-10 space-y-4">
        <p className={`text-[10px] font-black uppercase tracking-widest ${dark ? 'text-indigo-400' : 'text-slate-400'}`}>{label}</p>
        <div className="flex items-end gap-2">
          <span className={`text-4xl font-black tracking-tighter ${dark ? 'text-emerald-400' : ''}`}>{value}</span>
          <span className="text-[10px] font-bold uppercase mb-1 opacity-50">{unit}</span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border w-fit text-[9px] font-black uppercase ${dark ? 'bg-white/10 border-white/10 text-white' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
          {icon} Real-time
        </div>
      </div>
    </div>
  );
}

function FilterItem({ icon, type, value, onChange }: any) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400">
        {icon}
      </div>
      <input 
        type={type} 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-black text-slate-700 focus:ring-4 focus:ring-indigo-100 outline-none"
      />
    </div>
  );
}

function TabButton({ active, onClick, label, count, icon, color }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-8 py-4 rounded-[2rem] font-black text-[11px] tracking-widest uppercase transition-all ${
        active 
        ? 'bg-white shadow-xl shadow-slate-200 text-slate-900 scale-105' 
        : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${active ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
        {icon}
      </div>
      {label} ({count})
    </button>
  );
}

function DetailBox({ label, value, highlight = false }: any) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <div className={`px-4 py-3 rounded-xl font-black text-sm border ${highlight ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
        {value || '-'}
      </div>
    </div>
  );
}
