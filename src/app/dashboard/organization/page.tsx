'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { 
  Search, UserPlus, Shield, Trash2, Plus, Users, User, X, 
  ArrowRight, Edit2, Save, LogOut, CheckCircle2, ChevronRight
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
  
  // 선택된 관리 타켓
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [manageRole, setManageRole] = useState('');
  const [manageTeamId, setManageTeamId] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'team' | 'division' } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; type: 'team' | 'division'; name: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
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

      // 2. 소속 팀 변경
      const finalTeamId = manageTeamId === '' ? null : manageTeamId;
      if (finalTeamId !== selectedMember.team_id) {
        await updateMemberProfile(selectedMember.id, {
          team_id: finalTeamId as any
        });
      }

      alert('구성원 배정 정보가 성공적으로 업데이트되었습니다.');
      setIsMemberManageModalOpen(false);
      setSelectedMember(null);
      await fetchData();
    } catch (e: any) {
      alert('업데이트 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 기존 소속 해제 로직 (유지하되 팝업에서도 가능하게 함)
  const handleRemoveFromTeam = async (memberId: string) => {
    if (!confirm('팀 배정을 해제하시겠습니까?')) return;
    try {
      setLoading(true);
      await updateMemberProfile(memberId, { team_id: null as any });
      fetchData();
    } catch (e: any) { alert('해제 실패: ' + e.message); } finally { setLoading(false); }
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
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      {/* 1. 헤더 영역 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">전사 조직 관리 시스템</h1>
            <p className="text-sm text-slate-500 font-medium">구성원의 역할을 부여하고 적재적소에 배치하세요.</p>
          </div>
        </div>
        <button 
          onClick={() => router.push('/dashboard/hr')}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl flex items-center gap-2 font-bold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4 text-indigo-600" />
          인사관리(직원등록)
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* 본부 리스트 (Left) */}
        <div className="xl:col-span-4 bg-white rounded-[2rem] border border-slate-200 p-6 flex flex-col h-[700px]">
          <div className="flex items-center justify-between mb-8 px-2">
            <h2 className="text-lg font-bold text-slate-800">본부 구성</h2>
            <div className="flex items-center bg-slate-50 rounded-full border border-slate-200 p-1">
              <input 
                type="text" placeholder="새 본부명..." value={newDivName}
                onChange={e => setNewDivName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDivision(); }}
                className="bg-transparent border-none outline-none text-xs px-3 w-28 text-slate-600 dark:text-slate-300 font-medium"
              />
              <button onClick={handleCreateDivision} className="w-7 h-7 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-sm hover:bg-indigo-600 hover:text-white transition-all">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {divisions.map(div => (
              <div key={div.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <Users className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="font-bold text-slate-700">{div.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => { setEditTarget({id: div.id, type: 'division', name: div.name}); setEditName(div.name); setIsEditModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteTarget({ id: div.id, type: 'division' })} className="p-1.5 text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 팀 및 구성원 배정 (Right) */}
        <div className="xl:col-span-8 space-y-8 flex flex-col h-[700px]">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-bold text-slate-800">소속 팀 및 구성원 관리</h2>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-shadow shadow-lg shadow-indigo-100"
            >
              <Plus className="w-4 h-4" /> 신규 팀 생성
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
            {/* 미배정 인원 카드 */}
            <div className="bg-white rounded-[2rem] border-2 border-indigo-100 border-dashed p-8 flex flex-col">
              <h3 className="text-sm font-black text-indigo-600 mb-6 flex items-center gap-2 uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                팀 미배정 구성원 ({unassignedMembers.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {unassignedMembers.map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => openMemberManageModal(m)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all hover:translate-y-[-2px] flex items-center gap-2 group shadow-sm"
                  >
                    {m.full_name}
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))}
              </div>
            </div>

            {/* 팀 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
              {teams.map(team => {
                const teamMembers = members.filter(m => m.team_id === team.id);
                const division = divisions.find(d => d.id === team.division_id);
                return (
                  <div key={team.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 flex flex-col shadow-sm group hover:border-indigo-100 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded uppercase border border-indigo-100">
                        {division?.name || '소속없음'}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditTarget({id: team.id, type: 'team', name: team.name}); setEditName(team.name); setIsEditModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteTarget({ id: team.id, type: 'team' })} className="p-1.5 text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                      {team.name}
                      <span className="text-xs text-slate-400 font-medium">({teamMembers.length})</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {teamMembers.map(m => (
                        <div key={m.id} className="relative group/user">
                          <button 
                            onClick={() => openMemberManageModal(m)}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all"
                          >
                            {m.full_name}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRemoveFromTeam(m.id); }}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-white border border-slate-200 text-slate-400 rounded-full flex items-center justify-center opacity-0 group-hover/user:opacity-100 hover:text-rose-500 transition-all shadow-sm"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      {teamMembers.length === 0 && (
                        <div className="text-xs text-slate-400 italic py-2">구성원이 없습니다.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 5. 통합 구성원 관리 모달 (NEW) */}
      {isMemberManageModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[120] p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-50 border-2 border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">{selectedMember.full_name}</h2>
                  <p className="text-sm text-slate-500 font-medium">{selectedMember.email}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsMemberManageModalOpen(false)} 
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:text-slate-900 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-10">
              {/* 역할(Role) 섹션 */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">역할 및 권한 지정</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'admin', label: '관리자', icon: Shield, color: 'indigo' },
                    { id: 'sub_admin', label: '부관리자', icon: User, color: 'emerald' },
                    { id: 'member', label: '일반직원', icon: Users, color: 'slate' }
                  ].map((role) => (
                    <button
                      key={role.id}
                      onClick={() => setManageRole(role.id as any)}
                      className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                        manageRole === role.id 
                        ? `bg-${role.id === 'member' ? 'slate' : role.id === 'admin' ? 'indigo' : 'emerald'}-50 border-${role.id === 'member' ? 'slate' : role.id === 'admin' ? 'indigo' : 'emerald'}-600` 
                        : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <role.icon className={`w-5 h-5 ${manageRole === role.id ? `text-${role.id === 'member' ? 'slate' : role.id === 'admin' ? 'indigo' : 'emerald'}-600` : 'text-slate-400'}`} />
                      <span className={`text-xs font-black ${manageRole === role.id ? 'text-slate-900' : 'text-slate-500'}`}>{role.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 본부/팀 배정 섹션 */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">본부 및 팀 이동</label>
                <div className="relative">
                  <select 
                    value={manageTeamId}
                    onChange={e => setManageTeamId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/40 focus:border-indigo-400 appearance-none transition-all"
                  >
                    <option value="" className="dark:bg-slate-800">팀 배정 해제 (미배정 상태로 이동)</option>
                    {divisions.map(div => (
                      <optgroup key={div.id} label={`🏢 ${div.name}`} className="dark:bg-slate-800">
                        {teams.filter(t => t.division_id === div.id).map(team => (
                          <option key={team.id} value={team.id} className="dark:bg-slate-800">ㄴ {team.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none rotate-90" />
                </div>
              </div>
            </div>

            <div className="mt-12 flex gap-3">
              <button 
                onClick={() => setIsMemberManageModalOpen(false)} 
                className="flex-1 py-5 bg-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest rounded-3xl hover:bg-slate-200 transition-all"
              >
                취소
              </button>
              <button 
                onClick={handleUpdateMemberManage}
                className="flex-[2] py-5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-3xl hover:bg-slate-900 flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 transition-all"
              >
                <Save className="w-4 h-4" />
                변경 사항 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기타 기존 모달 (수정/삭제 등) */}
      {isEditModalOpen && editTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[130] p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">명칭 수정</h2>
            <input 
              type="text" value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm dark:text-white outline-none mb-6 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
            />
            <div className="flex gap-3">
              <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl uppercase text-xs tracking-widest">취소</button>
              <button onClick={handleUpdateOrganization} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl uppercase text-xs tracking-widest flex items-center justify-center gap-2"><Save className="w-4 h-4" /> 적용</button>
            </div>
          </div>
        </div>
      )}

      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[130] p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">신규 팀 생성</h2>
            <div className="space-y-4 mb-8">
              <select 
                value={selectedDivForTeam} onChange={e => setSelectedDivForTeam(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm dark:text-white outline-none"
              >
                <option value="">소속 본부 선택</option>
                {divisions.map(d => <option key={d.id} value={d.id} className="dark:bg-slate-800">{d.name}</option>)}
              </select>
              <input 
                type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm dark:text-white outline-none"
                placeholder="팀 이름 (예: 플랫폼팀)"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsTeamModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl uppercase text-xs tracking-widest">취소</button>
              <button onClick={handleCreateTeam} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl uppercase text-xs tracking-widest">팀 생성</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[140] p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black text-rose-600 mb-2 uppercase tracking-tight">보안 확인 (삭제)</h2>
            <p className="text-sm text-slate-500 mb-6">항목을 삭제하려면 관리자 비밀번호가 필요합니다.</p>
            <input 
              type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm dark:text-white outline-none mb-6 focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-900/40"
              placeholder="비밀번호 입력..."
            />
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeletePassword(''); }} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-2xl uppercase text-xs tracking-widest">영구 삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
