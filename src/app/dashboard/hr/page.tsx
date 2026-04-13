'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { 
  Search, UserPlus, Shield, Edit2, Trash2, 
  Users, User, X, Mail, MapPin, CreditCard, Heart, Plus, Save
} from 'lucide-react';
import { 
  Profile, fetchCompanyUsers, registerStaff, updateMemberProfile 
} from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function HRManagement() {
  const { profile, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 모달 상태
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  // 등록 폼 상태
  const [newStaff, setNewStaff] = useState({
    fullName: '',
    email: '',
    tempPassword: ''
  });

  // 상세 정보 폼 상태
  const [detailForm, setDetailForm] = useState({
    residentNumber: '',
    address: '',
    familyData: [] as { name: string; birth: string }[]
  });

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
      const users = await fetchCompanyUsers(profile.company_id);
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

  // 직원 등록 핸들러
  const handleRegister = async () => {
    if (!newStaff.fullName || !newStaff.email || !newStaff.tempPassword || !profile) {
      alert('필수 정보를 모두 입력해주세요.');
      return;
    }
    
    try {
      setLoading(true);
      await registerStaff({
        ...newStaff,
        companyId: profile.company_id,
        role: 'member',
        department: 'General',
        position: 'Professional'
      });
      alert('직원이 성공적으로 등록되었습니다.');
      setIsEnrollModalOpen(false);
      setNewStaff({ fullName: '', email: '', tempPassword: '' });
      fetchData();
    } catch (e: any) {
      alert('등록 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 상세 정보 수정 모달 오픈
  const openDetailModal = (p: Profile) => {
    setSelectedProfile(p);
    setDetailForm({
      residentNumber: p.resident_number || '',
      address: p.address || '',
      familyData: p.family_data || []
    });
    setIsDetailModalOpen(true);
  };

  // 상세 정보 저장 핸들러
  const handleUpdateDetail = async () => {
    if (!selectedProfile) return;
    try {
      setLoading(true);
      await updateMemberProfile(selectedProfile.id, {
        resident_number: detailForm.residentNumber,
        address: detailForm.address,
        family_data: detailForm.familyData
      });
      alert('정보가 수정되었습니다.');
      setIsDetailModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert('수정 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 가족 추가/삭제
  const addFamily = () => {
    setDetailForm({
      ...detailForm,
      familyData: [...detailForm.familyData, { name: '', birth: '' }]
    });
  };

  const removeFamily = (index: number) => {
    const newData = [...detailForm.familyData];
    newData.splice(index, 1);
    setDetailForm({ ...detailForm, familyData: newData });
  };

  const updateFamily = (index: number, field: 'name' | 'birth', value: string) => {
    const newData = [...detailForm.familyData];
    newData[index] = { ...newData[index], [field]: value };
    setDetailForm({ ...detailForm, familyData: newData });
  };

  const filteredMembers = members.filter(m => 
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading && members.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* 1. 헤더 영역 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">전사 인사 관리 시스템</h1>
            <p className="text-sm text-slate-500 font-medium">임직원의 인적 사항 및 가족 정보를 통합 관리합니다.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="이름 또는 이메일 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all shadow-sm"
            />
          </div>
          <button 
            onClick={() => setIsEnrollModalOpen(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl flex items-center gap-2 font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            <UserPlus className="w-4 h-4" />
            신규 직원 등록
          </button>
        </div>
      </div>

      {/* 2. 직원 목록 테이블 */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">이름</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">이메일</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">역할</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">주민번호</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{m.full_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{m.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border 
                      ${m.role === 'super_admin' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                        m.role === 'admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                        'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                    {m.resident_number ? m.resident_number.replace(/-?\d{7}$/, '-*******') : '-'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => openDetailModal(m)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                      title="정보 수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-medium italic">
                    일치하는 구성원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 등록 모달 */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">신규 직원 등록</h2>
              <button onClick={() => setIsEnrollModalOpen(false)} className="text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">성명</label>
                <div className="relative">
                   <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                    type="text" 
                    value={newStaff.fullName}
                    onChange={e => setNewStaff({...newStaff, fullName: e.target.value})}
                    placeholder="실명을 입력하세요"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">이메일 계정</label>
                <div className="relative">
                   <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                    type="email" 
                    value={newStaff.email}
                    onChange={e => setNewStaff({...newStaff, email: e.target.value})}
                    placeholder="company@example.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">임시 비밀번호</label>
                <div className="relative">
                   <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                    type="text" 
                    value={newStaff.tempPassword}
                    onChange={e => setNewStaff({...newStaff, tempPassword: e.target.value})}
                    placeholder="최소 6자 이상"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={handleRegister}
              className="w-full py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-slate-900 transition-colors shadow-lg shadow-indigo-100"
            >
              직원 계정 생성하기
            </button>
          </div>
        </div>
      )}

      {/* 4. 상세 정보 수정 모달 */}
      {isDetailModalOpen && selectedProfile && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">인사 정보 관리</h2>
                <p className="text-sm text-indigo-600 font-bold">{selectedProfile.full_name} ({selectedProfile.email})</p>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-slate-900"><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-8">
              {/* 기본 상세 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">주민등록번호</label>
                  <div className="relative">
                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      value={detailForm.residentNumber}
                      onChange={e => setDetailForm({...detailForm, residentNumber: e.target.value})}
                      placeholder="000000-0000000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">거주지 주소</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      value={detailForm.address}
                      onChange={e => setDetailForm({...detailForm, address: e.target.value})}
                      placeholder="서울특별서 ... 상세주소"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100"></div>

              {/* 가족 관계 */}
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-black text-slate-900 tracking-widest uppercase flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-500" />
                    가족 인적 사항
                  </h3>
                  <button onClick={addFamily} className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter flex items-center gap-1 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all">
                    <Plus className="w-3 h-3" />
                    구성원 추가
                  </button>
                </div>
                
                <div className="space-y-3">
                  {detailForm.familyData.map((f, i) => (
                    <div key={i} className="flex gap-3 items-center group animate-in slide-in-from-left-2 duration-300">
                      <input 
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-300" 
                        placeholder="이름" 
                        value={f.name}
                        onChange={e => updateFamily(i, 'name', e.target.value)}
                      />
                      <input 
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-300" 
                        placeholder="생년월일 (YYMMDD)" 
                        value={f.birth}
                        onChange={e => updateFamily(i, 'birth', e.target.value)}
                      />
                      <button onClick={() => removeFamily(i)} className="p-3 text-slate-300 hover:text-rose-500 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {detailForm.familyData.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">등록된 가족 정보가 없습니다.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-10">
              <button 
                onClick={handleUpdateDetail}
                className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors shadow-xl shadow-indigo-100"
              >
                <Save className="w-4 h-4" />
                변경 사항 저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
