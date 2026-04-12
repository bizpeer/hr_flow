'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Search, UserPlus, Shield, Trash2, Plus, Clock, Users, User, X } from 'lucide-react';
import { 
  Profile, Division, Team, 
  getDivisions, getTeams, fetchCompanyUsers, 
  createDivision, deleteDivision, 
  createTeam, deleteTeam, setLeader, registerStaff
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
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'team' | 'division' } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // 폼 상태
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

  const handleCreateDivision = async () => {
    if (!newDivName.trim() || !profile) return;
    try {
      await createDivision(newDivName, profile.company_id);
      setNewDivName('');
      fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !selectedDivForTeam || !profile) return;
    try {
      await createTeam(newTeamName, selectedDivForTeam, profile.company_id);
      setNewTeamName('');
      setIsTeamModalOpen(false);
      fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteDivision = (id: string) => {
    setDeleteTarget({ id, type: 'division' });
  };

  const handleDeleteTeam = (id: string) => {
    setDeleteTarget({ id, type: 'team' });
  };

  const executeDelete = async () => {
    if (!deleteTarget || !deletePassword || !user?.email) {
        alert('삭제 타겟이 없거나 비밀번호가 입력되지 않았습니다.');
        return;
    }
    
    try {
        // 비밀번호 검증 (Re-auth)
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // 데이터 구성
  const unassignedMembers = members.filter(m => !m.team_id || typeof m.team_id === 'undefined');
  
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
            <p className="text-sm text-slate-500 font-medium">본부 및 팀의 구조를 설계하고 인사 정보를 통합 관리합니다.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="구성원 이름 검색..." 
              className="w-64 pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all shadow-sm"
            />
          </div>
          <button className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-indigo-600 hover:bg-slate-50 transition-colors shadow-sm">
            <Clock className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsEnrollOpen(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl flex items-center gap-2 font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            <UserPlus className="w-4 h-4" />
            직원 등록
          </button>
        </div>
      </div>

      {/* 2. 보안 제어판 (Dark Banner) */}
      <div className="bg-[#0f172a] rounded-[2rem] p-6 lg:p-8 flex flex-col md:flex-row items-center justify-between shadow-xl">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">시스템 마스터 제어판</h2>
            <p className="text-slate-400 text-sm">부관리자 임명 및 시스템 전역 보안 설정을 관리할 수 있습니다.</p>
          </div>
        </div>
        <button className="mt-4 md:mt-0 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-rose-400 font-bold text-sm flex items-center gap-2 hover:bg-rose-500/10 transition-colors">
          <Trash2 className="w-4 h-4" />
          전체 이력 삭제
        </button>
      </div>

      {/* 3. 메인 콘텐츠 (Grid) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* 본부 구성 (Left Side) */}
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
                <div key={div.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-3 group hover:border-indigo-200 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-3 text-slate-800">
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="font-bold">{div.name}</span>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteDivision(div.id); }}
                      className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-500">본부장:</span>
                      {divHead ? (
                        <span className="font-bold text-indigo-600">{divHead.full_name} ({divHead.email})</span>
                      ) : (
                        <span className="font-bold text-indigo-600">미임명</span>
                      )}
                    </div>
                    <span className="text-slate-300 group-hover:text-indigo-400 transition-colors">›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 소속 팀 관리 (Right Side) */}
        <div className="xl:col-span-8 bg-slate-50/50 rounded-[2rem] flex flex-col">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-lg font-bold text-slate-800 px-2">소속 팀 관리</h2>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="px-5 py-2.5 bg-emerald-500 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-200"
            >
              <Plus className="w-4 h-4" />
              팀 생성
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-0 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 미배정 구성원 카드 */}
              <div className="bg-white rounded-[2rem] border-2 border-yellow-200 border-dashed p-6 flex flex-col min-h-[250px]">
                <h3 className="text-sm font-bold text-yellow-700 mb-6 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  미배정 구성원
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedMembers.map(m => (
                    <div key={m.id} className="px-4 py-2 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 flex items-center gap-2 shadow-sm">
                      {m.full_name}
                      {m.email && <span className="text-[10px] text-slate-400">({m.email.split('@')[0]})</span>}
                    </div>
                  ))}
                  {unassignedMembers.length === 0 && (
                    <p className="text-sm text-slate-400 font-medium">배정 대기 중인 구성원이 없습니다.</p>
                  )}
                </div>
              </div>

              {/* 팀 카드 배열 */}
              {teams.map(team => {
                const division = divisions.find(d => d.id === team.division_id);
                const teamMembers = members.filter(m => m.team_id === team.id);
                const teamLeader = teamMembers.find(m => m.is_team_leader);

                return (
                  <div key={team.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 flex flex-col shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-100">
                        {division?.name || '소속 없음'}
                      </span>
                      <button onClick={() => handleDeleteTeam(team.id)} className="text-slate-300 hover:text-rose-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-6">{team.name}</h3>
                    
                    <div className="space-y-6">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <span className="text-xs text-slate-500 font-medium">팀 리더</span>
                        {teamLeader ? (
                          <button className="text-xs font-bold text-emerald-600 flex items-center gap-1 hover:bg-emerald-50 px-2 py-1 rounded">
                            {teamLeader.full_name} <span className="text-[#a1a1aa] font-normal">({teamLeader.email})</span>
                            <span className="text-[10px]">▼</span>
                          </button>
                        ) : (
                          <button className="text-xs font-bold text-slate-400 flex items-center gap-1 hover:bg-slate-50 px-2 py-1 rounded">
                            미지정 <span className="text-[10px]">▼</span>
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium mb-3">구성원 ({teamMembers.length})</div>
                        <div className="flex flex-wrap gap-2">
                          {teamMembers.map(m => (
                            <div key={m.id} className="px-3 py-1.5 rounded-full border border-slate-100 bg-slate-50 text-xs font-medium text-slate-600 flex items-center gap-2">
                              {m.full_name}
                              {m.id !== teamLeader?.id && <button className="text-slate-300 hover:text-rose-500"><X className="w-3 h-3" /></button>}
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
      
      {/* Team Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-6">신규 팀 생성</h2>
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block">소속 본부</label>
                <select 
                  value={selectedDivForTeam}
                  onChange={e => setSelectedDivForTeam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                >
                  <option value="">본부를 선택하세요</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block">팀 이름</label>
                <input 
                  type="text" 
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none"
                  placeholder="예: 마케팅팀"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsTeamModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">취소</button>
              <button onClick={handleCreateTeam} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">팀 생성</button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Modal (Simplified for Employee Registration) */}
      {isEnrollOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl">
            <h2 className="text-xl font-bold mb-6">신규 구성원 임시 등록</h2>
            <div className="space-y-4 mb-8">
               <p className="text-sm text-slate-500">임시직원을 등록하여 배치할 수 있습니다. (실제 가입 및 등록 절차는 별도의 가이드 참고)</p>
               {/* 폼 간소화 (Mock registration or real depending on backend) */}
               <div className="px-4 py-8 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400">
                  직원 등록 양식 폼 (준비 중)
               </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsEnrollOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Password Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-rose-600 mb-2">보안 확인 (삭제)</h2>
            <p className="text-sm text-slate-500 mb-6">항목을 삭제하려면 관리자 비밀번호를 입력해주세요.</p>
            <input 
              type="password" 
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none mb-6 focus:border-rose-300 focus:ring-4 focus:ring-rose-50"
              placeholder="비밀번호 입력..."
            />
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeletePassword(''); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700">영구 삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
