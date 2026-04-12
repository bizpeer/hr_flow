'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { 
  Users, 
  Building, 
  LayoutGrid, 
  UserPlus, 
  Search, 
  ChevronRight, 
  ShieldCheck, 
  Settings, 
  Plus, 
  Trash2, 
  User, 
  Mail, 
  Briefcase, 
  CreditCard, 
  TrendingUp, 
  FileText, 
  X,
  PlusCircle,
  Database,
  ArrowRight
} from 'lucide-react';
import { 
  Profile, 
  Division, 
  Team, 
  getDivisions, 
  getTeams, 
  fetchCompanyUsers, 
  registerStaff, 
  updateMemberProfile,
  getPayrollHistory,
  createDivision,
  deleteDivision,
  createTeam,
  deleteTeam,
  setLeader
} from '@/lib/api';

export default function OrganizationManagement() {
  const { profile } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'payroll' | 'severance'>('info');

  // Modal States
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isOrgManagerOpen, setIsOrgManagerOpen] = useState(false);

  // Registration State
  const initRegData = {
    email: '',
    fullName: '',
    role: 'member' as const,
    residentNumber: '',
    address: '',
    familyData: [] as { name: string; birth: string }[],
    tempPassword: '' // 신규 추가: 사용자 지정 임시 비밀번호
  };
  const [regData, setRegData] = useState(initRegData);
  const [tempPassword, setTempPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Structural State
  const [newDivName, setNewDivName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedDivForTeam, setSelectedDivForTeam] = useState('');

  const fetchData = async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const companyId = profile.company_id || undefined;
      const [divs, tms, users] = await Promise.all([
        getDivisions(companyId),
        getTeams(companyId),
        fetchCompanyUsers(companyId)
      ]);
      setDivisions(divs);
      setTeams(tms);
      setMembers(users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profile?.company_id, profile?.role]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsRegistering(true);
    const generatedPw = Math.random().toString(36).slice(-10) + '!!';
    try {
      await registerStaff({
        email: regData.email,
        fullName: regData.fullName,
        position: 'Professional', // Default
        department: 'General', // Default
        tempPassword: regData.tempPassword || generatedPw,
        companyId: profile.company_id,
        role: regData.role,
        residentNumber: regData.residentNumber,
        address: regData.address,
        familyData: regData.familyData,
        teamId: '' // Unassigned
      });
      
      setTempPassword(generatedPw);
      fetchData();
    } catch (err: any) {
      alert('등록 실패: ' + err.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleAddDivision = async () => {
    if (!profile || !newDivName) return;
    try {
      await createDivision(newDivName, profile.company_id);
      setNewDivName('');
      fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteDiv = async (id: string) => {
    if (!confirm('본부를 삭제하시겠습니까? 관련 팀들이 영향을 받을 수 있습니다.')) return;
    try {
      await deleteDivision(id);
      fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleAddTeam = async () => {
    if (!profile || !newTeamName || !selectedDivForTeam) return;
    try {
      await createTeam(newTeamName, selectedDivForTeam, profile.company_id);
      setNewTeamName('');
      fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteT = async (id: string) => {
    if (!confirm('팀을 삭제하시겠습니까?')) return;
    try {
      await deleteTeam(id);
      fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleToggleLeader = async (userId: string, type: 'division' | 'team', currentStatus: boolean) => {
    try {
      await setLeader(userId, type, !currentStatus);
      fetchData();
      if (selectedMember?.id === userId) {
        setSelectedMember(prev => prev ? { ...prev, [type === 'division' ? 'is_division_head' : 'is_team_leader']: !currentStatus } : null);
      }
    } catch (e: any) { alert(e.message); }
  };

  const filteredMembers = members.filter(m => {
    const divMatch = selectedDivision === 'ALL' || teams.find(t => t.id === m.team_id)?.division_id === selectedDivision;
    const searchMatch = m.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    return divMatch && searchMatch;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] animate-pulse">조직 정보를 동기화하고 있습니다...</p>
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
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Talent Management</h1>
              <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Integrated HR & Organizational Intelligence
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button 
            onClick={() => setIsOrgManagerOpen(true)}
            className="flex items-center gap-4 px-8 py-4 bg-white border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-[11px]"
           >
              <LayoutGrid className="w-5 h-5 text-indigo-500" />
              <span>Org Structure</span>
           </button>
           <button 
            onClick={() => { setIsRegisterOpen(true); setTempPassword(''); }}
            className="flex items-center gap-4 px-8 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-slate-800 transition-all uppercase tracking-widest text-[11px]"
           >
              <UserPlus className="w-5 h-5" />
              <span>Enroll Member</span>
           </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Directory Explorer */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Member Directory Search</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="SEARCH NAME..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-xs font-black text-slate-700 focus:ring-4 focus:ring-indigo-100 outline-none transition-all shadow-inner"
                />
              </div>
            </div>

            <div className="space-y-4">
               <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Structural Filter</span>
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest italic">{filteredMembers.length} Members</span>
               </div>
               <nav className="space-y-2">
                  <SidebarFilterItem 
                    active={selectedDivision === 'ALL'} 
                    onClick={() => setSelectedDivision('ALL')} 
                    label="All Company" 
                    count={members.length}
                    icon={<Building className="w-4 h-4" />}
                  />
                  {divisions.map(div => (
                    <SidebarFilterItem 
                      key={div.id}
                      active={selectedDivision === div.id} 
                      onClick={() => setSelectedDivision(div.id)} 
                      label={div.name} 
                      count={members.filter(m => teams.find(t => t.id === m.team_id)?.division_id === div.id).length}
                      icon={<ChevronRight className="w-4 h-4" />}
                    />
                  ))}
               </nav>
            </div>
          </div>
        </aside>

        {/* Right Side: List & Profile */}
        <div className="lg:col-span-8 flex flex-col gap-8">
           <div className="bg-white rounded-[3rem] border border-slate-100 overflow-hidden shadow-sm">
              <div className="max-h-[700px] overflow-y-auto premium-scrollbar">
                 <table className="w-full border-separate border-spacing-0">
                    <thead>
                       <tr className="bg-slate-50/50 sticky top-0 z-10">
                          <th className="px-10 py-7 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Identity</th>
                          <th className="px-10 py-7 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Position / Team</th>
                          <th className="px-10 py-7 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {filteredMembers.map(m => (
                         <tr 
                          key={m.id} 
                          onClick={() => setSelectedMember(m)}
                          className={`group cursor-pointer transition-all ${selectedMember?.id === m.id ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
                         >
                            <td className="px-10 py-6">
                               <div className="flex items-center gap-5">
                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black transition-all ${selectedMember?.id === m.id ? 'bg-indigo-600 text-white shadow-xl' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
                                     {m.full_name[0]}
                                  </div>
                                  <div>
                                     <div className="flex items-center gap-2">
                                        <p className="text-sm font-black text-slate-900">{m.full_name}</p>
                                        {m.is_division_head && <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded uppercase">본부장</span>}
                                        {m.is_team_leader && <span className="text-[8px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase">팀장</span>}
                                     </div>
                                     <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border transition-colors ${['super_admin', 'admin'].includes(m.role) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>
                                           {m.role === 'super_admin' ? '최고 관리자' : 
                                            m.role === 'admin' ? '관리자' : 
                                            m.role === 'sub_admin' ? '보조 관리자' : '직원'}
                                        </span>
                                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                     </div>
                                  </div>
                               </div>
                            </td>
                            <td className="px-10 py-6">
                               <p className="text-sm font-bold text-slate-600 tracking-tight">{m.position || 'Professional'}</p>
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                  {teams.find(t => t.id === m.team_id)?.name || 'General Branch'}
                               </p>
                            </td>
                            <td className="px-10 py-6 text-right">
                               <div className="flex justify-end gap-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm">
                                     <ArrowRight className="w-4 h-4" />
                                  </div>
                               </div>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>

           {/* Profile Details Panel */}
           {selectedMember ? (
             <div className="bg-white rounded-[3.5rem] border border-slate-100 p-12 space-y-12 animate-in slide-in-from-bottom-10 duration-500">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-8">
                      <div className="w-24 h-24 bg-slate-900 text-white rounded-[2.5rem] flex items-center justify-center text-3xl font-black shadow-2xl">
                         {selectedMember.full_name[0]}
                      </div>
                      <div className="space-y-2">
                         <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{selectedMember.full_name}</h2>
                         <div className="flex items-center gap-4 text-slate-400">
                            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><Mail className="w-3.5 h-3.5" /> ID: {selectedMember.id.substring(0, 16)}...</span>
                            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> {selectedMember.role} Access</span>
                         </div>
                      </div>
                   </div>
                   <div className="flex gap-2">
                      <button 
                        onClick={() => handleToggleLeader(selectedMember.id, 'division', !!selectedMember.is_division_head)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${selectedMember.is_division_head ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        본부장 임명
                      </button>
                      <button 
                        onClick={() => handleToggleLeader(selectedMember.id, 'team', !!selectedMember.is_team_leader)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${selectedMember.is_team_leader ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        팀장 임명
                      </button>
                      <button className="p-4 bg-slate-50 text-slate-400 rounded-3xl hover:text-indigo-600 transition-all">
                         <Settings className="w-6 h-6" />
                      </button>
                   </div>
                </div>

                <div className="flex p-2 bg-slate-100 rounded-[2.5rem] w-fit gap-2">
                   <TabBtn active={activeTab === 'info'} onClick={() => setActiveTab('info')} label="Member Profile" icon={<User className="w-4 h-4" />} />
                   <TabBtn active={activeTab === 'payroll'} onClick={() => setActiveTab('payroll')} label="Wage Ledger" icon={<CreditCard className="w-4 h-4" />} />
                   <TabBtn active={activeTab === 'severance'} onClick={() => setActiveTab('severance')} label="Liability Estimate" icon={<TrendingUp className="w-4 h-4" />} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {activeTab === 'info' && (
                      <>
                         <InfoItem label="Current Position" value={selectedMember.position || 'N/A'} icon={<Briefcase />} />
                         <InfoItem label="Organization Unit" value={teams.find(t => t.id === selectedMember.team_id)?.name || 'General Branch'} icon={<Building />} />
                         <InfoItem label="Resident Number" value={selectedMember.resident_number ? `${selectedMember.resident_number.substring(0, 8)}******` : 'N/A'} icon={<ShieldCheck />} />
                         <InfoItem label="Home Address" value={selectedMember.address || 'N/A'} icon={<Building />} />
                         <div className="col-span-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Dependent Family</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               {selectedMember.family_data && selectedMember.family_data.length > 0 ? (
                                 selectedMember.family_data.map((f, idx) => (
                                   <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                      <span className="text-xs font-black text-slate-700">{f.name}</span>
                                      <span className="text-[10px] font-bold text-slate-400">{f.birth}</span>
                                   </div>
                                 ))
                               ) : (
                                 <p className="text-[10px] text-slate-400 italic">No family data registered.</p>
                               )}
                            </div>
                         </div>
                         <div className="bg-indigo-900 rounded-[2.5rem] p-8 text-white flex items-center justify-between col-span-2">
                            <div>
                               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Base Compensation</p>
                               <p className="text-2xl font-black tracking-tighter italic">₩ {(selectedMember.annual_salary || 0).toLocaleString()}</p>
                            </div>
                            <CreditCard className="w-10 h-10 text-white/20" />
                         </div>
                      </>
                    )}
                   {activeTab === 'payroll' && (
                     <div className="col-span-2 py-20 text-center space-y-6 bg-slate-50 rounded-[3rem] border border-slate-100 border-dashed">
                        <Database className="w-12 h-12 text-slate-200 mx-auto" />
                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Connect to Payroll Engine to view logs</p>
                        <button className="px-8 py-3 bg-white border border-slate-200 text-indigo-600 font-black rounded-2xl text-[10px] uppercase shadow-sm">Sync Records</button>
                     </div>
                   )}
                   {activeTab === 'severance' && (
                     <div className="col-span-2 p-10 bg-slate-900 rounded-[3.5rem] text-white relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-125 transition-transform duration-700">
                           <TrendingUp className="w-32 h-32" />
                        </div>
                        <div className="space-y-8 relative z-10">
                           <div className="space-y-2">
                              <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Accrued Liability Estimate</p>
                              <h3 className="text-5xl font-black tracking-tighter italic text-emerald-400">₩ {Math.round((selectedMember.annual_salary || 0) * 0.08).toLocaleString()}*</h3>
                           </div>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight leading-relaxed max-w-sm">
                              *This is a simplified estimate based on standard 1/12 annual accrual logic. For actual settlement, use the official severance calculator.
                           </p>
                        </div>
                     </div>
                   )}
                </div>
             </div>
           ) : (
             <div className="bg-white rounded-[3.5rem] border border-slate-100 border-dashed h-[500px] flex flex-col items-center justify-center gap-6 text-slate-300">
                <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center border border-slate-100">
                   <Users className="w-10 h-10 opacity-20" />
                </div>
                <div className="text-center space-y-2">
                   <p className="text-[11px] font-black uppercase tracking-widest">Awaiting Selection</p>
                   <p className="text-xs font-medium">Choose a professional from the list to view intelligence.</p>
                </div>
             </div>
           )}
        </div>
      </div>

      {/* Enroll Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto premium-scrollbar animate-in zoom-in-95 duration-500">
              <div className="p-10 pb-6 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                 <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-sans">Member Enrollment</h2>
                 <button onClick={() => setIsRegisterOpen(false)} className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <div className="p-10">
                 {!tempPassword ? (
                    <form onSubmit={handleRegister} className="space-y-12">
                       {/* Section 1: Basic Info */}
                       <div className="space-y-6">
                          <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-3">
                             <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                             Basic Identity & Security
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <FormInput label="Full Name" value={regData.fullName} onChange={(v: string) => setRegData({...regData, fullName: v})} placeholder="Real name" />
                             <FormInput label="Professional Email" value={regData.email} onChange={(v: string) => setRegData({...regData, email: v})} placeholder="corp@domain.com" />
                             <FormInput 
                               label="Temporary Password" 
                               value={regData.tempPassword} 
                               onChange={(v: string) => setRegData({...regData, tempPassword: v})} 
                               placeholder="Min 8 characters (Leave empty for random)" 
                             />
                          </div>
                       </div>

                       {/* Section 2: Organization & Access */}
                       <div className="space-y-6">
                           <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest flex items-center gap-3">
                              <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
                              Departmental Access
                           </h3>
                           <div className="grid grid-cols-1 gap-8">
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resident Number (주민번호)</label>
                                 <input 
                                  type="text" 
                                  value={regData.residentNumber} 
                                  onChange={e => {
                                     let val = e.target.value.replace(/\D/g, '');
                                     if (val.length > 6) val = val.slice(0, 6) + '-' + val.slice(6, 13);
                                     setRegData({...regData, residentNumber: val.slice(0, 14)});
                                  }}
                                  placeholder="000000-0000000"
                                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100 appearance-none"
                                  required
                                 />
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Role & Permission</label>
                                 <select 
                                  value={regData.role} 
                                  onChange={e => setRegData({...regData, role: e.target.value as any})}
                                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100 appearance-none"
                                  required
                                 >
                                    <option value="member">직원 (Member) - 일반 사용자 권한</option>
                                    <option value="sub_admin">보조 관리자 (Sub Admin) - 제한된 관리 기능</option>
                                    {profile?.role === 'super_admin' && (
                                      <option value="admin">기업 관리자 (Admin) - 전권한</option>
                                    )}
                                 </select>
                              </div>
                           </div>
                       </div>

                       {/* Section 3: Contact & Family */}
                       <div className="space-y-6">
                           <h3 className="text-sm font-black text-rose-600 uppercase tracking-widest flex items-center gap-3">
                              <div className="w-1.5 h-6 bg-rose-600 rounded-full" />
                              Personal & Family Details
                           </h3>
                           <FormInput label="Home Address (주소)" value={regData.address} onChange={(v: string) => setRegData({...regData, address: v})} placeholder="Full address" />
                           
                           <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dependents (부양가족)</label>
                                 <button 
                                   type="button"
                                   onClick={() => setRegData({...regData, familyData: [...regData.familyData, { name: '', birth: '' }]})}
                                   className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
                                 >
                                    + ADD FAMILY MEMBER
                                 </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 {regData.familyData.map((f, i) => (
                                    <div key={i} className="flex gap-2 items-end p-4 bg-slate-50 rounded-2xl border border-slate-200 group">
                                       <div className="flex-1 space-y-2">
                                          <input 
                                            type="text" 
                                            placeholder="Name" 
                                            value={f.name} 
                                            onChange={e => {
                                              const newF = [...regData.familyData];
                                              newF[i].name = e.target.value;
                                              setRegData({...regData, familyData: newF});
                                            }}
                                            className="w-full bg-white border-none rounded-xl p-2 text-xs font-black outline-none"
                                          />
                                          <input 
                                            type="text" 
                                            placeholder="YYYY.MM.DD" 
                                            value={f.birth} 
                                            onChange={e => {
                                              const newF = [...regData.familyData];
                                              newF[i].birth = e.target.value;
                                              setRegData({...regData, familyData: newF});
                                            }}
                                            className="w-full bg-white border-none rounded-xl p-2 text-xs font-black outline-none"
                                          />
                                       </div>
                                       <button 
                                         type="button"
                                         onClick={() => {
                                           const newF = regData.familyData.filter((_, idx) => idx !== i);
                                           setRegData({...regData, familyData: newF});
                                         }}
                                         className="p-2 text-rose-400 hover:text-rose-600"
                                       >
                                          <Trash2 className="w-4 h-4" />
                                       </button>
                                    </div>
                                 ))}
                              </div>
                           </div>
                       </div>

                       <div className="bg-indigo-50 border border-indigo-100 rounded-[2.5rem] p-8 space-y-4">
                          <div className="flex items-center gap-4">
                             <ShieldCheck className="w-10 h-10 text-indigo-600" />
                             <div>
                                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">System Security Protocol</p>
                                <p className="text-xs font-bold text-slate-400">All data is encrypted. Temporary access code will be generated.</p>
                             </div>
                          </div>
                          <button 
                            type="submit" 
                            disabled={isRegistering}
                            className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px]"
                          >
                             {isRegistering ? 'Processing Secure Data...' : 'Finalize & Enroll Member'}
                          </button>
                       </div>
                    </form>
                 ) : (
                    <div className="space-y-10 py-10 text-center animate-in fade-in duration-1000">
                       <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-indigo-200">
                          <ShieldCheck className="w-12 h-12" />
                       </div>
                       <div className="space-y-3">
                          <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Enrollment Complete</h3>
                          <p className="text-slate-400 text-sm font-bold">Credential successfully issued to the registry.</p>
                       </div>
                       <div className="p-8 bg-slate-900 text-white rounded-[2.5rem] relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-4 opacity-10"><Database className="w-10 h-10" /></div>
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Temporary Access Code</p>
                          <p className="text-4xl font-black font-mono tracking-widest text-emerald-400">{tempPassword}</p>
                       </div>
                       <button onClick={() => setIsRegisterOpen(false)} className="w-full py-5 bg-white border-2 border-slate-900 text-slate-900 font-black rounded-2xl hover:bg-slate-900 hover:text-white transition-all uppercase tracking-widest text-[11px]">Return to Talent Hub</button>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Org Structure Manager */}
      {isOrgManagerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in slide-in-from-bottom-10 duration-500">
              <div className="p-10 pb-6 flex justify-between items-center bg-slate-50">
                 <h2 className="text-2xl font-black tracking-tighter uppercase">Structure Intelligence</h2>
                 <button onClick={() => setIsOrgManagerOpen(false)} className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X className="w-6 h-6" /></button>
              </div>
              
              <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10 max-h-[70vh] overflow-y-auto premium-scrollbar">
                 {/* Division Management */}
                 <div className="space-y-8">
                    <div className="space-y-4">
                       <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                          본부 관리 (Divisions)
                       </h3>
                       <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="New Division Name..." 
                            value={newDivName}
                            onChange={e => setNewDivName(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-black outline-none focus:ring-4 focus:ring-indigo-100"
                          />
                          <button 
                            onClick={handleAddDivision}
                            className="px-6 py-3 bg-indigo-600 text-white font-black rounded-xl text-[10px] uppercase shadow-lg hover:bg-slate-900 transition-all"
                          >
                             ADD
                          </button>
                       </div>
                    </div>

                    <div className="space-y-2">
                       {divisions.map(d => (
                         <div key={d.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{d.name}</span>
                            <button 
                              onClick={() => handleDeleteDiv(d.id)}
                              className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all shadow-sm"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* Team Management */}
                 <div className="space-y-8">
                    <div className="space-y-4">
                       <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
                          팀 관리 (Teams)
                       </h3>
                       <div className="space-y-2">
                          <select 
                            value={selectedDivForTeam}
                            onChange={e => setSelectedDivForTeam(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-black outline-none appearance-none"
                          >
                             <option value="">소속 본부 선택...</option>
                             {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          <div className="flex gap-2">
                             <input 
                               type="text" 
                               placeholder="New Team Name..." 
                               value={newTeamName}
                               onChange={e => setNewTeamName(e.target.value)}
                               className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-black outline-none focus:ring-4 focus:ring-emerald-100"
                             />
                             <button 
                               onClick={handleAddTeam}
                               className="px-6 py-3 bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase shadow-lg hover:bg-slate-900 transition-all"
                             >
                                ADD
                             </button>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2">
                       {teams.map(t => (
                         <div key={t.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                            <div>
                               <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{t.name}</span>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                  {divisions.find(d => d.id === t.division_id)?.name}
                                </p>
                            </div>
                            <button 
                              onClick={() => handleDeleteT(t.id)}
                              className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all shadow-sm"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function SidebarFilterItem({ active, onClick, label, count, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${active ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
    >
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-xl ${active ? 'bg-white/10' : 'bg-slate-100'}`}>
          {icon}
        </div>
        <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      </div>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${active ? 'bg-indigo-600' : 'bg-slate-100'}`}>{count}</span>
    </button>
  );
}

function TabBtn({ active, onClick, label, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-8 py-4 rounded-[2rem] font-black text-[11px] tracking-widest uppercase transition-all ${
        active 
        ? 'bg-white text-indigo-600 shadow-xl' 
        : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function InfoItem({ label, value, icon }: any) {
  return (
    <div className="space-y-2">
       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</p>
       <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem] flex items-center gap-4 group">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors shadow-sm">
             {icon}
          </div>
          <p className="text-sm font-black text-slate-800 tracking-tight">{value}</p>
       </div>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-2">
       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
       <input 
        type="text" 
        value={value} 
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100 placeholder:text-slate-300"
        required
       />
    </div>
  );
}
