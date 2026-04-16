'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { 
  Users, User, X, Edit2, Shield, Trash2, Plus, Save, ChevronRight, UserPlus
} from 'lucide-react';
import { 
  Profile, Division, Team, 
  getDivisions, getTeams, fetchCompanyUsers, 
  createDivision, deleteDivision, updateDivision,
  createTeam, deleteTeam, updateTeam, updateMemberProfile, adminUpdateRole
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
  
  // 선택된 관리 타겟
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [manageRole, setManageRole] = useState('');
  const [manageTeamId, setManageTeamId] = useState('');
  const [isDivisionHead, setIsDivisionHead] = useState(false);
  const [isTeamLeader, setIsTeamLeader] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'team' | 'division' } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [editTarget, setEditTarget] = useState<{ id: string; type: 'team' | 'division'; name: string } | null>(null);
  const [editName, setEditName] = useState('');

  // 생성 폼 상태
  const [newDivName, setNewDivName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedDivForTeam, setSelectedDivForTeam] = useState('');

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

  // 구성원 관리 모달 오픈
  const openMemberManageModal = (m: Profile) => {
    setSelectedMember(m);
    setManageRole(m.role);
    setManageTeamId(m.team_id || '');
    setIsDivisionHead(m.is_division_head || false);
    setIsTeamLeader(m.is_team_leader || false);
    setIsMemberManageModalOpen(true);
  };

  // 구성원 배정 및 역할 변경 저장
  const handleUpdateMemberManage = async () => {
    if (!selectedMember) return;
    try {
      setLoading(true);
      
      // 1. 역할 변경 (변경된 경우에만 에지 함수 호출)
      if (manageRole !== selectedMember.role) {
        await adminUpdateRole(selectedMember.id, manageRole);
      }

      // 2. 단일 리더 정책 적용 (본부장/팀장 임명 시 기존 리더 자동 해임)
      const currentTeam = teams.find(t => t.id === manageTeamId);
      const divisionId = currentTeam?.division_id || (selectedMember.team_id ? teams.find(t => t.id === selectedMember.team_id)?.division_id : null);

      // 본부장 임명 시: 동일 본부 내 다른 본부장 해임
      if (isDivisionHead && divisionId) {
        const teamIdsInDivision = teams.filter(t => t.division_id === divisionId).map(t => t.id);
        const otherHeads = members.filter(m => 
          m.id !== selectedMember.id && 
          m.is_division_head && 
          (m.team_id && teamIdsInDivision.includes(m.team_id))
        );
        
        for (const head of otherHeads) {
          try {
            await updateMemberProfile(head.id, { is_division_head: false });
          } catch(err) { console.error('기존 본부장 해임 실패:', err); }
        }
      }

      // 팀장 임명 시: 동일 팀 내 다른 팀장 해임
      if (isTeamLeader && manageTeamId) {
        const otherLeaders = members.filter(m => 
          m.id !== selectedMember.id && 
          m.is_team_leader && 
          m.team_id === manageTeamId
        );
        
        for (const leader of otherLeaders) {
          try {
            await updateMemberProfile(leader.id, { is_team_leader: false });
          } catch(err) { console.error('기존 팀장 해임 실패:', err); }
        }
      }

      // 3. 소속 팀 및 리더 상태 업데이트
      const finalTeamId = manageTeamId === '' ? null : manageTeamId;
      await updateMemberProfile(selectedMember.id, {
        team_id: finalTeamId as any,
        is_division_head: isDivisionHead,
        is_team_leader: isTeamLeader
      });

      alert('구성원 배정 및 리더 임명 정보가 업데이트되었습니다.');
      setIsMemberManageModalOpen(false);
      setSelectedMember(null);
      await fetchData();
    } catch (e: any) {
      alert('업데이트 실패: ' + e.message + '\n(데이터베이스 컬럼 설정을 확인해주세요.)');
    } finally {
      setLoading(false);
    }
  };

  // 명칭 수정 및 삭제
  const handleUpdateOrganization = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      setLoading(true);
      if (editTarget.type === 'division') await updateDivision(editTarget.id, editName);
      else await updateTeam(editTarget.id, editName);
      setIsEditModalOpen(false);
      setEditTarget(null);
      await fetchData();
      alert('정상적으로 수정되었습니다.');
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
      alert('성공적으로 삭제되었습니다.');
    } catch (e: any) { alert(e.message); }
  };

  if (loading && members.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const unassignedMembers = members.filter(m => !m.team_id);
  
  return (
    <div className="max-w-[1400px] mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0">
      {/* 1. 헤더 영역 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">전사 조직 관리</h1>
            <p className="text-sm text-slate-500 font-medium">조직 구조를 설계하고 리더를 임명하세요.</p>
          </div>
        </div>
        <button 
          onClick={() => router.push('/dashboard/hr')}
          className="w-full md:w-auto px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4 text-indigo-600" />
          직원 등록/보안
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* 본부 리스트 (Left) */}
        <div className="xl:col-span-4 bg-white rounded-[2rem] border border-slate-200 p-6 flex flex-col h-auto xl:h-[750px] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">본부 구성</h2>
            <div className="flex items-center bg-slate-50 rounded-full border border-slate-200 p-1">
              <input 
                type="text" placeholder="새 본부명..." value={newDivName}
                onChange={e => setNewDivName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDivision(); }}
                className="bg-transparent border-none outline-none text-[11px] px-3 w-28 text-slate-600 font-medium"
              />
              <button onClick={handleCreateDivision} className="flex-shrink-0 w-7 h-7 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-sm hover:bg-indigo-600 hover:text-white transition-all">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {divisions.map(div => {
              // 해당 본부의 본부장 찾기
              const teamIds = teams.filter(t => t.division_id === div.id).map(t => t.id);
              const head = members.find(m => m.is_division_head && m.team_id && teamIds.includes(m.team_id));
              
              return (
                <div key={div.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 tracking-tight">{div.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setEditTarget({id: div.id, type: 'division', name: div.name}); setEditName(div.name); setIsEditModalOpen(true); }} className="p-1 text-slate-400 hover:text-indigo-600"><Edit2 className="w-3 h-3" /></button>
                          <button onClick={() => setDeleteTarget({ id: div.id, type: 'division' })} className="p-1 text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                      {head ? (
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-indigo-500" />
                          <span className="text-[11px] font-bold text-indigo-600">본부장: {head.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">본부장 미임명</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 팀 및 구성원 (Right) */}
        <div className="xl:col-span-8 space-y-8 flex flex-col h-auto xl:h-[750px]">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-bold text-slate-800">팀 및 구성원 관리</h3>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-shadow shadow-lg shadow-indigo-100"
            >
              <Plus className="w-4 h-4" /> 팀 생성
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-8">
            {/* 미배정 인원 */}
            <div className="bg-white rounded-[2rem] border-2 border-slate-100 border-dashed p-8">
              <h3 className="text-[11px] font-black text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-widest">
                미배정 인원 ({unassignedMembers.length})
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {unassignedMembers.map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => openMemberManageModal(m)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm flex items-center gap-2"
                  >
                    {m.full_name}
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                  </button>
                ))}
              </div>
            </div>

            {/* 팀 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
              {teams.map(team => {
                const teamMembers = members.filter(m => m.team_id === team.id);
                const division = divisions.find(d => d.id === team.division_id);
                const leader = teamMembers.find(m => m.is_team_leader);

                return (
                  <div key={team.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 flex flex-col shadow-sm group hover:border-indigo-100 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded border border-indigo-100 uppercase tracking-tight">
                        {division?.name || '소속없음'}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditTarget({id: team.id, type: 'team', name: team.name}); setEditName(team.name); setIsEditModalOpen(true); }} className="p-1.5 text-slate-300 hover:text-indigo-600"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteTarget({ id: team.id, type: 'team' })} className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    
                    <div className="mb-6">
                      <h4 className="text-lg font-extrabold text-slate-900 mb-1">{team.name}</h4>
                      {leader ? (
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-xs font-black text-indigo-600">팀장: {leader.full_name}</span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 font-medium">팀장 미임명</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {teamMembers.map(m => (
                        <button 
                          key={m.id} 
                          onClick={() => openMemberManageModal(m)}
                          className={`px-3 py-1.5 border rounded-lg text-[11px] font-bold transition-all ${
                            m.is_division_head || m.is_team_leader 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                            : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-indigo-200'
                          }`}
                        >
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

      {/* 구성원 관리 모달 */}
      {isMemberManageModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-50 border-2 border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">{selectedMember.full_name} 관리</h2>
                  <p className="text-xs text-slate-400 font-medium">{selectedMember.email}</p>
                </div>
              </div>
              <button onClick={() => setIsMemberManageModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-10">
              {/* 시스템 권한 */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">시스템 권한</label>
                <div className="grid grid-cols-3 gap-3">
                  {['admin', 'sub_admin', 'member'].map(r => (
                    <button
                      key={r}
                      onClick={() => setManageRole(r)}
                      className={`py-3.5 rounded-2xl border-2 font-black text-[11px] uppercase transition-all ${
                        manageRole === r ? 'bg-white border-indigo-600 text-indigo-600 shadow-xl shadow-indigo-50' : 'bg-slate-50 border-transparent text-slate-400'
                      }`}
                    >
                      {r === 'admin' ? '관리자' : r === 'sub_admin' ? '부관리자' : '직원'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 리더 임명 */}
              <div className="bg-slate-50 p-6 rounded-3xl space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">조직 리더 임명 (단일 보직)</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => { setIsDivisionHead(!isDivisionHead); if(!isDivisionHead) setIsTeamLeader(false); }}
                    className={`flex items-center justify-center py-3.5 rounded-2xl font-black text-xs gap-2 border-2 transition-all ${
                      isDivisionHead ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" /> 본부장
                  </button>
                  <button 
                    onClick={() => { setIsTeamLeader(!isTeamLeader); if(!isTeamLeader) setIsDivisionHead(false); }}
                    className={`flex items-center justify-center py-3.5 rounded-2xl font-black text-xs gap-2 border-2 transition-all ${
                      isTeamLeader ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" /> 팀장
                  </button>
                </div>
                {(isDivisionHead || isTeamLeader) && (
                  <p className="text-[10px] text-indigo-600 font-bold text-center animate-pulse">* 임명 시 기존 리더는 자동 해임됩니다.</p>
                )}
              </div>

              {/* 팀 이동 */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">소속 팀 이동</label>
                <select 
                  value={manageTeamId}
                  onChange={e => setManageTeamId(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 appearance-none transition-all shadow-sm"
                >
                  <option value="">소속 없음 (미배정)</option>
                  {divisions.map(div => (
                    <optgroup key={div.id} label={`🏢 ${div.name}`}>
                      {teams.filter(t => t.division_id === div.id).map(team => (
                        <option key={team.id} value={team.id}>ㄴ {team.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-12 flex gap-4">
              <button 
                onClick={() => setIsMemberManageModalOpen(false)} 
                className="flex-1 py-5 bg-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200"
              >
                닫기
              </button>
              <button 
                onClick={handleUpdateMemberManage}
                className="flex-[2] py-5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-900 flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-[0.98]"
              >
                <Save className="w-4 h-4" /> 설정 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 명칭 수정 모달 */}
      {isEditModalOpen && editTarget && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[210] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase">명칭 수정</h2>
            <input 
              type="text" value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-4 text-sm font-bold outline-none mb-6 focus:border-indigo-400"
            />
            <div className="flex gap-3">
              <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 bg-slate-50 text-slate-500 font-bold rounded-xl text-xs uppercase">취소</button>
              <button onClick={handleUpdateOrganization} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl text-xs uppercase shadow-lg shadow-indigo-100">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 팀 생성 모달 */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[210] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">신규 팀 생성</h2>
            <div className="space-y-4 mb-8">
              <select 
                value={selectedDivForTeam} onChange={e => setSelectedDivForTeam(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-4 text-sm font-bold outline-none focus:border-indigo-400 appearance-none"
              >
                <option value="">본부 선택</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input 
                type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-4 text-sm font-bold outline-none focus:border-indigo-400"
                placeholder="팀 명칭 입력"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsTeamModalOpen(false)} className="flex-1 py-4 bg-slate-50 text-slate-500 font-bold rounded-xl text-xs">취소</button>
              <button onClick={handleCreateTeam} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-100">팀 생성</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 보안 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[250] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-10 w-full max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">작업 보안 확인</h2>
            <p className="text-sm text-slate-500 mb-8 font-medium">관리자 비밀번호를 입력하여 삭제를 확정해주세요.</p>
            <input 
              type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-6 py-4 text-sm font-black outline-none mb-8 text-center focus:border-rose-400"
              placeholder="••••••••"
            />
            <div className="flex gap-4">
              <button onClick={() => { setDeleteTarget(null); setDeletePassword(''); }} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-slate-200">취소</button>
              <button onClick={executeDelete} className="flex-1 py-4 bg-rose-600 text-white font-black rounded-xl text-xs uppercase tracking-widest hover:bg-rose-700 shadow-xl shadow-rose-100">항목 삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
