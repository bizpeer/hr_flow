'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { 
  Users, User, X, Edit2, Shield, Trash2, Plus, Save, ChevronRight, UserPlus, Search
} from 'lucide-react';
import { 
  Profile, Division, Team, 
  getDivisions, getTeams, fetchCompanyUsers, 
  createDivision, deleteDivision, updateDivision,
  createTeam, deleteTeam, updateTeam, adminUpdateRole
} from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function OrganizationManagement() {
  const { profile, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState<Profile[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // 모달 상태
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isMemberManageModalOpen, setIsMemberManageModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHeadAssignModalOpen, setIsHeadAssignModalOpen] = useState(false);
  
  // 선택된 관리 타겟
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [manageRole, setManageRole] = useState('');
  const [manageDivisionId, setManageDivisionId] = useState('');
  const [manageTeamId, setManageTeamId] = useState('');
  const [isDivisionHead, setIsDivisionHead] = useState(false);
  const [isTeamLeader, setIsTeamLeader] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'team' | 'division' } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [editTarget, setEditTarget] = useState<{ id: string; type: 'team' | 'division'; name: string } | null>(null);
  const [editName, setEditName] = useState('');

  // 생성 및 검색 상태
  const [newDivName, setNewDivName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedDivForTeam, setSelectedDivForTeam] = useState('');
  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  // 권한 체크
  useEffect(() => {
    if (!authLoading) {
      if (profile?.role === 'system_admin') {
        router.replace('/dashboard/system');
      } else if (profile && !['super_admin', 'admin'].includes(profile.role.toLowerCase())) {
        router.replace('/dashboard');
      }
    }
  }, [profile, authLoading, router]);

  const fetchData = async () => {
    if (!profile) return;
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
  }, [profile?.company_id]);

  // 본부 및 팀 생성
  const handleCreateDivision = async () => {
    if (!newDivName.trim() || !profile) return;
    try {
      setLoading(true);
      await createDivision(newDivName, profile.company_id);
      setNewDivName('');
      await fetchData();
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !selectedDivForTeam || !profile) return;
    try {
      setLoading(true);
      await createTeam(newTeamName, selectedDivForTeam, profile.company_id);
      setNewTeamName('');
      setIsTeamModalOpen(false);
      await fetchData();
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const getLeaderName = (orgId: string, type: 'division' | 'team') => {
    if (type === 'division') {
      const div = divisions.find(d => d.id === orgId);
      if (div?.head_user_id) {
        return members.find(p => p.id === div.head_user_id)?.full_name || '임명 필요';
      }
    } else {
      const team = teams.find(t => t.id === orgId);
      if (team?.leader_user_id) {
        return members.find(p => p.id === team.leader_user_id)?.full_name || '임명 필요';
      }
    }
    return '임명 필요';
  };

  // 본부장 직접 임명
  const handleAssignHead = async (memberId: string) => {
    if (!selectedDivision) return;
    try {
      setLoading(true);
      
      // 설계 원칙: divisions 테이블의 head_user_id 직접 업데이트
      await setLeader(selectedDivision.id, 'division', memberId);

      alert(`${members.find(m => m.id === memberId)?.full_name}님이 ${selectedDivision.name}의 본부장으로 임명되었습니다.`);
      setIsHeadAssignModalOpen(false);
      await fetchData();
    } catch (e: any) {
      alert('본부장 임명 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 구성원 관리 모달 오픈
  const openMemberManageModal = (m: Profile) => {
    setSelectedMember(m);
    setManageRole(m.role);
    setManageTeamId(m.team_id || '');
    setManageDivisionId(m.division_id || '');
    setIsMemberManageModalOpen(true);
  };

  // 구성원 배정 및 역할 변경 저장
  const handleUpdateMemberManage = async () => {
    if (!selectedMember) return;
    try {
      setLoading(true);
      
      // 1. 역할 변경 (SaaS 설계 원칙 반영)
      if (manageRole !== selectedMember.role) {
        await adminUpdateRole(selectedMember.id, manageRole);
      }

      // 2. 부서 및 팀 배정 정보 업데이트
      const updateData: any = {
        team_id: manageTeamId === '' ? null : manageTeamId,
        division_id: manageDivisionId === '' ? null : manageDivisionId,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', selectedMember.id);

      if (error) throw error;

      // 3. 리더 설정 (설계 원칙에 따라 각 조직 테이블 업데이트)
      if (isDivisionHead && manageDivisionId) {
        await setLeader(manageDivisionId, 'division', selectedMember.id);
      }
      if (isTeamLeader && manageTeamId) {
        await setLeader(manageTeamId, 'team', selectedMember.id);
      }

      alert('정보가 업데이트되었습니다.');
      setIsMemberManageModalOpen(false);
      setSelectedMember(null);
      await fetchData();
    } catch (e: any) {
      alert('업데이트 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrganization = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      setLoading(true);
      if (editTarget.type === 'division') await updateDivision(editTarget.id, editName);
      else await updateTeam(editTarget.id, editName);
      setIsEditModalOpen(false);
      setEditTarget(null);
      await fetchData();
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const executeDelete = async () => {
    if (!deleteTarget || !deletePassword || !user?.email) return;
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (authError) throw new Error('비밀번호가 일치하지 않습니다.');
      if (deleteTarget.type === 'division') await deleteDivision(deleteTarget.id);
      else await deleteTeam(deleteTarget.id);
      setDeleteTarget(null);
      setDeletePassword('');
      fetchData();
      alert('삭제되었습니다.');
    } catch (e: any) { alert(e.message); }
  };

  if (loading && members.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center font-black text-indigo-600">불러오는 중...</div>
    );
  }

  // 본부장이나 팀장이 아니고, 팀에 소속되지 않은 멤버들 (신규 할당용)
  const unassignedMembers = useMemo(() => {
    const divisionHeads = divisions.map(d => d.head_user_id).filter(Boolean);
    const teamLeaders = teams.map(t => t.leader_user_id).filter(Boolean);
    
    return members.filter(m => 
      !m.team_id && 
      !divisionHeads.includes(m.id) && 
      !teamLeaders.includes(m.id)
    );
  }, [members, divisions, teams]);
  const searchedMembers = members.filter(m => {
    const term = memberSearchTerm.toLowerCase();
    const nameMatch = m.full_name?.toLowerCase().includes(term);
    const emailMatch = m.email?.toLowerCase().includes(term);
    return nameMatch || emailMatch;
  });

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 md:space-y-10 pb-20 px-4 md:px-0">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-200">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">전사 조직 거버넌스</h1>
            <p className="text-sm text-slate-400 font-bold">부서 체계를 정립하고 리더를 직관적으로 임명하세요.</p>
          </div>
        </div>
        <button 
          onClick={() => router.push('/dashboard/hr')}
          className="px-8 py-4 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-3 font-black text-sm hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200"
        >
          <UserPlus className="w-5 h-5" /> 인사 정보 관리
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* 본부 리스트 (Left) */}
        <div className="xl:col-span-4 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-slate-800">본부 구성</h2>
            <div className="flex items-center bg-slate-100 rounded-2xl border border-slate-200 p-1.5 backdrop-blur-sm">
              <input 
                type="text" placeholder="본부명..." value={newDivName}
                onChange={e => setNewDivName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDivision(); }}
                className="bg-transparent border-none outline-none text-xs px-4 w-24 text-slate-600 font-bold"
              />
              <button onClick={handleCreateDivision} className="flex-shrink-0 w-8 h-8 rounded-xl bg-white text-indigo-600 flex items-center justify-center shadow-lg hover:bg-indigo-600 hover:text-white transition-all">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[800px] pr-2 custom-scrollbar">
            {divisions.map(div => {
              const head = members.find(m => m.id === div.head_user_id);
              return (
                <div key={div.id} className="bg-white rounded-[2rem] border border-slate-100 p-8 group hover:border-indigo-400 transition-all shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-black text-slate-900 text-xl tracking-tight">{div.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditTarget({id: div.id, type: 'division', name: div.name}); setEditName(div.name); setIsEditModalOpen(true); }} className="p-2 text-slate-300 hover:text-indigo-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget({ id: div.id, type: 'division' })} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">본부 책임자</label>
                        {head ? (
                          <div className="flex items-center justify-between">
                            <span className="text-base font-black text-indigo-600 flex items-center gap-2">
                              <Shield className="w-4 h-4" /> {head.full_name}
                            </span>
                            <button 
                              onClick={() => { setSelectedDivision(div); setIsHeadAssignModalOpen(true); }}
                              className="text-[10px] h-7 px-3 bg-white border border-slate-200 rounded-lg font-black text-slate-400 hover:border-indigo-600 hover:text-indigo-600 transition-all"
                            >
                              교체 임명
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setSelectedDivision(div); setIsHeadAssignModalOpen(true); }}
                            className="w-full h-12 dashed border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-indigo-500 hover:text-indigo-600 flex items-center justify-center gap-2 transition-all bg-white"
                          >
                            <Plus className="w-4 h-4" /> 본부장 임명하기
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-2">
                      <span className="text-[11px] font-black text-slate-400">속한 팀 수: {teams.filter(t => t.division_id === div.id).length}개</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 팀 및 구성원 (Right) */}
        <div className="xl:col-span-8 space-y-8">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xl font-black text-slate-800">팀별 현황 및 조직 배정</h3>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-2xl flex items-center gap-2 hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100"
            >
              <Plus className="w-5 h-5" /> 신규 팀 조직
            </button>
          </div>

          <div className="overflow-y-auto max-h-[1000px] pr-2 custom-scrollbar space-y-8 pb-20">
            {/* 미배정 인원 섹션 */}
            <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 border-dashed p-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[12px] font-black text-slate-400 flex items-center gap-3 uppercase tracking-[0.2em]">
                  <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                  미배임 조직원 ({unassignedMembers.length})
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {unassignedMembers.map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => openMemberManageModal(m)}
                    className="p-4 bg-white border border-slate-100 rounded-2xl text-[13px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:shadow-xl hover:shadow-indigo-50 transition-all flex items-center justify-between group"
                  >
                    {m.full_name}
                    <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* 팀 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {teams.map(team => {
                const teamMembers = members.filter(m => m.team_id === team.id);
                const division = divisions.find(d => d.id === team.division_id);
                const isLeader = (m: Profile) => team.leader_user_id === m.id;

                return (
                  <div key={team.id} className="bg-white rounded-[3rem] border border-slate-100 p-10 flex flex-col shadow-sm group hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-50/50 transition-all overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setEditTarget({id: team.id, type: 'team', name: team.name}); setEditName(team.name); setIsEditModalOpen(true); }} className="w-10 h-10 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 flex items-center justify-center shadow-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget({ id: team.id, type: 'team' })} className="w-10 h-10 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-rose-500 flex items-center justify-center shadow-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>

                    <div className="mb-8">
                      <div className="inline-flex px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-lg border border-indigo-100 uppercase tracking-widest mb-4">
                        {division?.name || '부서 배정 필요'}
                      </div>
                      <h4 className="text-2xl font-black text-slate-900 leading-tight">{team.name}</h4>
                    </div>
                    
                    <div className="mb-10 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">팀 리더 (Team Leader)</label>
                      {team.leader_user_id ? (
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-black text-indigo-600 flex items-center gap-2">
                            <Shield className="w-5 h-5" /> 
                            {members.find(m => m.id === team.leader_user_id)?.full_name || '임명 필요'}
                          </span>
                          <button 
                            onClick={() => {
                              const leaderProfile = members.find(p => p.id === team.leader_user_id);
                              if (leaderProfile) openMemberManageModal(leaderProfile);
                            }} 
                            className="text-[10px] font-black text-slate-400 hover:text-indigo-600 underline"
                          >
                            권한 관리
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-slate-400 italic">현재 팀장이 공석입니다.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-auto">
                      {teamMembers.map(m => (
                          <button 
                            key={m.id} 
                            onClick={() => openMemberManageModal(m)}
                            className={`p-4 border rounded-[1.25rem] text-[13px] font-black transition-all flex items-center justify-center gap-2 ${
                              isLeader(m) || m.division_id === division?.id && division?.head_user_id === m.id
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100' 
                              : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-300'
                            }`}
                          >
                            {isLeader(m) && <Shield className="w-3.5 h-3.5" />}
                            {m.full_name}
                          </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 본부장 직속 임명 모달 */}
      {isHeadAssignModalOpen && selectedDivision && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[300] p-4 backdrop-blur-xl">
          <div className="bg-white rounded-[3rem] p-10 md:p-14 w-full max-w-2xl shadow-2xl">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedDivision.name}</h2>
                <p className="text-base text-slate-400 font-bold">임명할 본부장을 직원 목록에서 선택하세요.</p>
              </div>
              <button onClick={() => setIsHeadAssignModalOpen(false)} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:text-slate-900 transition-all">
                <X className="w-7 h-7" />
              </button>
            </div>

            <div className="mb-8 relative">
              <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
              <input 
                type="text" placeholder="직원 이름 또는 이메일 검색..." 
                value={memberSearchTerm} onChange={e => setMemberSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-16 pr-6 py-5 text-sm font-bold focus:border-indigo-400 shadow-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
              {searchedMembers.length > 0 ? searchedMembers.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => handleAssignHead(m.id)}
                  className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl flex items-center justify-between group hover:border-indigo-600 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                      <User className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <p className="font-black text-slate-800 text-lg">{m.full_name}</p>
                      <p className="text-xs text-slate-400 font-bold">{m.email}</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-slate-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:border-indigo-600 transition-all">
                    <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-white" />
                  </div>
                </button>
              )) : (
                <div className="py-20 text-center font-bold text-slate-400">검색된 결과가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 구성원 관리 모달 */}
      {isMemberManageModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] p-10 md:p-12 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl flex items-center justify-center text-white shadow-xl">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedMember.full_name} 설정</h2>
                  <p className="text-sm text-slate-400 font-bold">{selectedMember.email}</p>
                </div>
              </div>
              <button onClick={() => setIsMemberManageModalOpen(false)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-10">
              {/* 시스템 권한 */}
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-5 block">시스템 권한</label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { val: 'admin', lab: '관리자' },
                    { val: 'sub_admin', lab: '부관리자' },
                    { val: 'member', lab: '직원' }
                  ].map(r => (
                    <button
                      key={r.val}
                      onClick={() => setManageRole(r.val)}
                      className={`py-4 rounded-2xl border-2 font-black text-xs transition-all ${
                        manageRole === r.val ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      {r.lab}
                    </button>
                  ))}
                </div>
              </div>

              {/* 리더 임명 */}
              <div className="bg-slate-50 p-8 rounded-[2.5rem] space-y-6">
                <label className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-2 block">조직 책임자 임명</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => { setIsDivisionHead(!isDivisionHead); if(!isDivisionHead) setIsTeamLeader(false); }}
                    className={`flex items-center justify-center py-4 rounded-2xl font-black text-xs gap-3 border-2 transition-all ${
                      isDivisionHead ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400'
                    }`}
                  >
                    <Shield className="w-4 h-4" /> 본부장
                  </button>
                  <button 
                    onClick={() => { setIsTeamLeader(!isTeamLeader); if(!isTeamLeader) setIsDivisionHead(false); }}
                    className={`flex items-center justify-center py-4 rounded-2xl font-black text-xs gap-3 border-2 transition-all ${
                      isTeamLeader ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400'
                    }`}
                  >
                    <Shield className="w-4 h-4" /> 팀장
                  </button>
                </div>
              </div>

              {/* 소속 이동 */}
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">본부 선택</label>
                  <select 
                    value={manageDivisionId}
                    onChange={e => { setManageDivisionId(e.target.value); setManageTeamId(''); }}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 appearance-none shadow-sm"
                  >
                    <option value="">본부 미지정</option>
                    {divisions.map(div => <option key={div.id} value={div.id}>{div.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">팀 선택</label>
                  <select 
                    value={manageTeamId}
                    onChange={e => setManageTeamId(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 appearance-none shadow-sm"
                    disabled={!manageDivisionId}
                  >
                    <option value="">팀 미지정</option>
                    {teams.filter(t => t.division_id === manageDivisionId).map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-12 flex gap-5">
              <button onClick={() => setIsMemberManageModalOpen(false)} className="flex-1 py-6 bg-slate-100 text-slate-500 font-black text-xs uppercase rounded-2xl">취소</button>
              <button onClick={handleUpdateMemberManage} className="flex-[2] py-6 bg-slate-900 text-white font-black text-xs uppercase rounded-2xl hover:bg-indigo-600 flex items-center justify-center gap-3 shadow-2xl transition-all">
                <Save className="w-5 h-5" /> 업데이트 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 명칭 수정 및 팀 생성, 삭제 모달은 기존과 동일하므로 생략하거나 유지 */}
      {/* ... (이전 모달들 유지) */}
    </div>
  );
}
