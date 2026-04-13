'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Search, UserPlus, Shield, Trash2, Plus, Clock, Users, User, X, ArrowRight, Edit2, Save } from 'lucide-react';
import { 
  Profile, Division, Team, 
  getDivisions, getTeams, fetchCompanyUsers, 
  createDivision, deleteDivision, updateDivision,
  createTeam, deleteTeam, updateTeam, setLeader, updateMemberProfile
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
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [selectedMemberForAssign, setSelectedMemberForAssign] = useState<Profile | null>(null);
  const [selectedTeamForAssign, setSelectedTeamForAssign] = useState('');
  
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'team' | 'division' } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; type: 'team' | 'division'; name: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // 폼 상태
  const [newDivName, setNewDivName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedDivForTeam, setSelectedDivForTeam] = useState('');
  const [editName, setEditName] = useState('');

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

  const handleCreateDivision = async () => {
    if (!newDivName.trim() || !profile) return;
    try {
      setLoading(true);
      await createDivision(newDivName, profile.company_id);
      setNewDivName('');
      await fetchData(); // 최신 목록 즉시 갱신
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

  const handleUpdateOrganization = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      setLoading(true);
      if (editTarget.type === 'division') {
        await updateDivision(editTarget.id, editName);
      } else {
        await updateTeam(editTarget.id, editName);
      }
      setIsEditModalOpen(false);
      setEditTarget(null);
      await fetchData();
      alert('정보가 성공적으로 수정되었습니다.');
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const handleAssignTeam = async () => {
    if (!selectedMemberForAssign || !selectedTeamForAssign) return;
    try {
      setLoading(true);
      await updateMemberProfile(selectedMemberForAssign.id, {
        team_id: selectedTeamForAssign
      });
      setIsAssignModalOpen(false);
      setSelectedMemberForAssign(null);
      setSelectedTeamForAssign('');
      fetchData();
    } catch (e: any) {
      alert('배정 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromTeam = async (memberId: string) => {
    if (!confirm('팀 배정을 해제하시겠습니까?')) return;
    try {
      setLoading(true);
      await updateMemberProfile(memberId, {
        team_id: undefined 
      });
      fetchData();
    } catch (e: any) {
      alert('해제 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget || !deletePassword || !user?.email) {
        alert('삭제 타겟이 없거나 비밀번호가 입력되지 않았습니다.');
        return;
    }
    
    try {
        const { error: authError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: deletePassword,
        });

        if (authError) throw new Error('비밀번호가 일치하지 않습니다. 관리자 보안 확인에 실패했습니다.');

        if (deleteTarget.type === 'division') {
            await deleteDivision(deleteTarget.id);
        } else {
            await deleteTeam(deleteTarget.id);
        }

        setDeleteTarget(null);
        setDeletePassword('');
        fetchData();
        alert('성공적으로 삭제되었습니다.');
    } catch (e: any) {
        alert(e.message);
    }
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
            <p className="text-sm text-slate-500 font-medium">본부 및 팀의 구조를 설계하고 구성원을 적재적소에 배치합니다.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard/hr')}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl flex items-center gap-2 font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4 text-indigo-600" />
            인사관리(직원등록) 바로가기
          </button>
        </div>
      </div>

      {/* 2. 메인 콘텐츠 (Grid) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* 본부 구성 (Left Side) - 수정 버튼 추가 */}
        <div className="xl:col-span-4 bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm overflow-hidden flex flex-col h-[700px]">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">본부 구성</h2>
            </div>
            <div className="flex items-center bg-slate-50 rounded-full border border-slate-200 p-1">
              <input 
                type="text"
                placeholder="새 본부명..."
                value={newDivName}
                onChange={e => setNewDivName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDivision(); }}
                className="bg-transparent border-none outline-none text-xs px-3 w-28 text-slate-600 font-medium"
              />
              <button onClick={handleCreateDivision} className="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-sm">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {divisions.map(div => {
              const divHead = members.find(m => m.is_division_head && m.team_id && teams.find(t => t.id === m.team_id)?.division_id === div.id);
              return (
                <div key={div.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-3 group hover:border-indigo-200 transition-colors">
                  <div className="flex items-center justify-between gap-3 text-slate-800">
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="font-bold">{div.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                            onClick={() => { setEditTarget({id: div.id, type: 'division', name: div.name}); setEditName(div.name); setIsEditModalOpen(true); }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => setDeleteTarget({ id: div.id, type: 'division' })}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-500">본부장:</span>
                      {divHead ? (
                        <span className="font-bold text-indigo-600">{divHead.full_name}</span>
                      ) : (
                        <span className="font-bold text-slate-400">미임명</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 소속 팀 관리 (Right Side) - 수정 버튼 추가 */}
        <div className="xl:col-span-8 bg-slate-50/50 rounded-[2rem] flex flex-col">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-lg font-bold text-slate-800 px-2">소속 팀 및 팀원 배정</h2>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
            >
              <Plus className="w-4 h-4" />
              신규 팀 생성
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-0 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 미배정 구성원 카드 */}
              <div className="bg-white rounded-[2rem] border-2 border-indigo-100 border-dashed p-6 flex flex-col min-h-[300px]">
                <h3 className="text-sm font-black text-indigo-600 mb-6 flex items-center gap-2 uppercase tracking-widest">
                  <div className="w-2 h-2 rounded-full bg-indigo-600" />
                  팀 미배정 구성원 ({unassignedMembers.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedMembers.map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => { setSelectedMemberForAssign(m); setIsAssignModalOpen(true); }}
                      className="px-4 py-2 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 flex items-center gap-2 shadow-sm hover:border-indigo-400 hover:text-indigo-600 transition-all group"
                    >
                      {m.full_name}
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                  ))}
                </div>
              </div>

              {/* 팀 카드 배열 */}
              {teams.map(team => {
                const division = divisions.find(d => d.id === team.division_id);
                const teamMembers = members.filter(m => m.team_id === team.id);
                const teamLeader = teamMembers.find(m => m.is_team_leader);

                return (
                  <div key={team.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 flex flex-col shadow-sm group">
                    <div className="flex items-start justify-between mb-2">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-100">
                        {division?.name || '소속 없음'}
                      </span>
                      <div className="flex items-center gap-1 opacity-10 md:opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                            onClick={() => { setEditTarget({id: team.id, type: 'team', name: team.name}); setEditName(team.name); setIsEditModalOpen(true); }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget({ id: team.id, type: 'team' })} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-6">{team.name}</h3>
                    
                    <div className="space-y-6">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <span className="text-xs text-slate-500 font-medium">팀 리더</span>
                        {teamLeader ? (
                          <span className="text-xs font-bold text-emerald-600 px-2 py-1 bg-emerald-50 rounded-lg">
                            {teamLeader.full_name}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">미지정</span>
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium mb-3 uppercase tracking-widest">구성원 ({teamMembers.length})</div>
                        <div className="flex flex-wrap gap-2">
                          {teamMembers.map(m => (
                            <div key={m.id} className="px-3 py-1.5 rounded-full border border-slate-100 bg-slate-50 text-xs font-medium text-slate-600 flex items-center gap-2 group relative">
                              {m.full_name}
                              <button onClick={() => handleRemoveFromTeam(m.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      
      {/* 4. Edit Modal (Division / Team) */}
      {isEditModalOpen && editTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">명칭 수정</h2>
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-black text-slate-500 mb-2 block uppercase tracking-widest">
                  기존 {editTarget.type === 'division' ? '본부' : '팀'}명: <span className="text-indigo-600">{editTarget.name}</span>
                </label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                  placeholder="변경할 이름을 입력하세요"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 uppercase text-xs tracking-widest">취소</button>
              <button onClick={handleUpdateOrganization} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-slate-900 transition-colors uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                <Save className="w-4 h-4" />
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Create Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">신규 팀 생성</h2>
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-black text-slate-500 mb-2 block uppercase tracking-widest">소속 본부</label>
                <select 
                  value={selectedDivForTeam}
                  onChange={e => setSelectedDivForTeam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="">본부를 선택하세요</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 mb-2 block uppercase tracking-widest">팀 이름</label>
                <input 
                  type="text" 
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                  placeholder="예: 마케팅팀"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsTeamModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 uppercase text-xs tracking-widest">취소</button>
              <button onClick={handleCreateTeam} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-slate-900 transition-colors uppercase text-xs tracking-widest">팀 생성</button>
            </div>
          </div>
        </div>
      )}

      {/* Member Assign Modal */}
      {isAssignModalOpen && selectedMemberForAssign && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">팀 배정</h2>
            <div className="mb-6 p-4 bg-indigo-50 rounded-2xl">
              <p className="text-sm font-bold text-indigo-900">{selectedMemberForAssign.full_name}</p>
              <p className="text-xs text-indigo-600">{selectedMemberForAssign.email}</p>
            </div>
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-black text-slate-500 mb-2 block uppercase tracking-widest">팀 선택</label>
                <select 
                  value={selectedTeamForAssign}
                  onChange={e => setSelectedTeamForAssign(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="">배정할 팀을 선택하세요</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({divisions.find(d => d.id === team.division_id)?.name || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsAssignModalOpen(false); setSelectedMemberForAssign(null); }} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 uppercase text-xs tracking-widest">취소</button>
              <button onClick={handleAssignTeam} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-slate-900 transition-colors uppercase text-xs tracking-widest">배정 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Password Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black text-rose-600 mb-2 uppercase tracking-tight">보안 확인 (삭제)</h2>
            <p className="text-sm text-slate-500 mb-6">항목을 삭제하려면 관리자 비밀번호를 입력해주세요.</p>
            <input 
              type="password" 
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm outline-none mb-6 focus:ring-4 focus:ring-rose-100"
              placeholder="비밀번호 입력..."
            />
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeletePassword(''); }} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200">취소</button>
              <button onClick={executeDelete} className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 uppercase text-xs tracking-widest">영구 삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
