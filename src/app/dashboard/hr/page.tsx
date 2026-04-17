'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { 
  Search, UserPlus, Shield, Edit2, Trash2, 
  Users, User, X, Mail, MapPin, CreditCard, Heart, Plus, Save, Calendar
} from 'lucide-react';
import { 
  Profile, fetchCompanyUsers, registerStaff, updateMemberProfile, adminResetPassword
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
  
  // 관리자 재인증 및 비밀번호 초기화 상태
  const [isAdminVerifying, setIsAdminVerifying] = useState(false);
  const [adminPasswordForDelete, setAdminPasswordForDelete] = useState('');
  const [isAdminVerifyingForReset, setIsAdminVerifyingForReset] = useState(false);
  const [adminPasswordForReset, setAdminPasswordForReset] = useState('');
  const [resetTempPassword, setResetTempPassword] = useState('');

  // 오늘 날짜 기본값 (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];

  // 등록 폼 상태
  const [newStaff, setNewStaff] = useState({
    fullName: '',
    email: '',
    tempPassword: '',
    hireDate: today
  });

  // 상세 정보 폼 상태
  const [detailForm, setDetailForm] = useState({
    residentNumber: '',
    address: '',
    phoneNumber: '',
    hireDate: '',
    additionalLeave: 0,
    status: 'active' as 'active' | 'suspended' | 'resigned',
    resignationDate: '',
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

  // 연차 계산 함수 (입사일 기준)
  const calculateAutoLeave = (hireDate: string) => {
    if (!hireDate) return 0;
    const hire = new Date(hireDate);
    const now = new Date();
    const years = now.getFullYear() - hire.getFullYear();
    const isBeforeHireMonthDay = 
      now.getMonth() < hire.getMonth() || 
      (now.getMonth() === hire.getMonth() && now.getDate() < hire.getDate());
    
    const tenureYears = isBeforeHireMonthDay ? years - 1 : years;
    
    if (tenureYears < 1) return 11; // 1년 미만: 월차 개념 최대 11개
    return Math.min(25, 15 + Math.floor((tenureYears - 1) / 2)); // 기본 15개, 2년마다 1개씩 증가 (최대 25개)
  };

  // 직원 등록 핸들러
  const handleRegister = async () => {
    const { fullName, email, tempPassword, hireDate } = newStaff;

    if (!fullName || !email || !tempPassword || !profile) {
      alert('필수 정보를 모두 입력해주세요.');
      return;
    }

    if (tempPassword.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    
    try {
      setLoading(true);
      await registerStaff({
        fullName,
        email,
        tempPassword,
        hireDate,
        companyId: profile.company_id,
        role: 'member',
        department: 'General',
        position: 'Professional'
      });
      alert('직원이 성공적으로 등록되었습니다.');
      setIsEnrollModalOpen(false);
      setNewStaff({ fullName: '', email: '', tempPassword: '', hireDate: today });
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
      phoneNumber: p.phone_number || '',
      hireDate: p.hire_date || today,
      additionalLeave: p.additional_annual_leave || 0,
      status: p.status || 'active',
      resignationDate: p.resignation_date || '',
      familyData: p.family_data || []
    });
    setIsAdminVerifying(false);
    setAdminPasswordForDelete('');
    setIsAdminVerifyingForReset(false);
    setAdminPasswordForReset('');
    setResetTempPassword('');
    setIsDetailModalOpen(true);
  };

  // 비밀번호 초기화 핸들러
  const handleResetPassword = async () => {
    if (!selectedProfile || !adminPasswordForReset || !resetTempPassword) {
      alert('관리자 비밀번호와 임시 비밀번호를 모두 입력해주세요.');
      return;
    }

    if (resetTempPassword.length < 6) {
      alert('새 비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    try {
      setLoading(true);
      // 1. 관리자 비밀번호 확인
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email!,
        password: adminPasswordForReset,
      });

      if (authError) throw new Error('관리자 비밀번호가 일치하지 않습니다.');

      // 2. 비밀번호 초기화 API 호출
      await adminResetPassword(selectedProfile.id, resetTempPassword);
      
      alert(`[${selectedProfile.full_name}] 사용자의 비밀번호가 성공적으로 초기화되었습니다.`);
      setIsAdminVerifyingForReset(false);
      setAdminPasswordForReset('');
      setResetTempPassword('');
    } catch (e: any) {
      alert('초기화 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 상세 정보 저장 핸들러
  const handleUpdateDetail = async () => {
    if (!selectedProfile) return;
    try {
      setLoading(true);
      await updateMemberProfile(selectedProfile.id, {
        resident_number: detailForm.residentNumber || '',
        address: detailForm.address || '',
        phone_number: detailForm.phoneNumber || '',
        hire_date: detailForm.hireDate || today,
        additional_annual_leave: detailForm.additionalLeave || 0,
        status: detailForm.status || 'active',
        resignation_date: detailForm.status === 'resigned' ? (detailForm.resignationDate || today) : '',
        family_data: detailForm.familyData || []
      });
      alert('인사 정보가 성공적으로 반영되었습니다.');
      setIsDetailModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert('수정 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 계정 완전 삭제 핸들러
  const handleDeleteMember = async () => {
    if (!selectedProfile || !adminPasswordForDelete) return;
    
    if (!confirm(`[${selectedProfile.full_name}] 사용자의 모든 데이터와 로그인 계정을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    try {
      setLoading(true);
      // 1. 관리자 비밀번호 확인 (재인증)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email!,
        password: adminPasswordForDelete,
      });

      if (authError) throw new Error('관리자 비밀번호가 일치하지 않습니다.');

      // 2. 통합 삭제 API 호출 (Auth + DB)
      const { adminDeleteUser } = await import('@/lib/api');
      await adminDeleteUser(selectedProfile.id);
      
      alert('사용자가 성공적으로 영구 삭제되었습니다.');
      setIsDetailModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert('삭제 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 가족 추가/삭제 로직 (동일)
  const addFamily = () => setDetailForm({ ...detailForm, familyData: [...detailForm.familyData, { name: '', birth: '' }] });
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

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* 1. 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight tracking-tighter">전사 인사 관리 시스템</h1>
            <p className="text-sm text-slate-500 font-medium">임직원의 인적 사항, 상태 및 연차 정보를 통합 관리합니다.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="이름 또는 이메일 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/30 transition-all shadow-sm"
            />
          </div>
          <button 
            onClick={() => setIsEnrollModalOpen(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl flex items-center gap-2 font-bold hover:bg-slate-900 transition-all shadow-lg shadow-indigo-200"
          >
            <UserPlus className="w-4 h-4" />
            신규 직원 등록
          </button>
        </div>
      </div>

      {/* 2. 직원 목록 */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">성명</th>
                <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">이메일</th>
                <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">상태 / 역할</th>
                <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">입사일</th>
                <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.map((m) => (
                <tr key={m.id} className={`hover:bg-indigo-50/30 transition-colors ${m.status === 'resigned' ? 'opacity-50 grayscale' : ''}`}>
                  <td className="px-8 py-5">
                    <button 
                      onClick={() => openDetailModal(m)}
                      className="group flex items-center gap-3 text-left"
                    >
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-all font-black text-xs uppercase">
                        {m.full_name.charAt(0)}
                      </div>
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600 border-b-2 border-transparent group-hover:border-indigo-200 transition-all">{m.full_name}</span>
                    </button>
                  </td>
                  <td className="px-8 py-5 text-sm text-slate-500">{m.email}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                       <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border 
                        ${m.status === 'suspended' ? 'bg-amber-50 text-amber-600 border-amber-200' : 
                          m.status === 'resigned' ? 'bg-slate-100 text-slate-500 border-slate-300' : 
                          'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                        {m.status || 'active'}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black text-slate-400 border border-slate-100 uppercase tracking-widest bg-slate-50">
                        {m.role}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-mono text-slate-400">
                    {m.status === 'resigned' ? (
                      <div className="flex flex-col">
                        <span className="line-through">{m.hire_date || '-'}</span>
                        <span className="text-[10px] text-rose-500 font-bold">퇴사: {m.resignation_date}</span>
                      </div>
                    ) : (
                      m.hire_date || '-'
                    )}
                  </td>
                  <td className="px-8 py-5 text-center">
                    <button 
                      onClick={() => openDetailModal(m)}
                      className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200 shadow-sm hover:shadow-indigo-100"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 등록 모달 (기존 유지하되 hireDate 처리 강화) */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[100] p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">신규 직원 등록</h2>
              <button onClick={() => setIsEnrollModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-5 mb-10">
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 block">성명</label>
                <div className="relative">
                   <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                   <input 
                    type="text" 
                    value={newStaff.fullName}
                    onChange={e => setNewStaff({...newStaff, fullName: e.target.value})}
                    placeholder="실명 입력"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-sm dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition-all font-bold group"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 block">이메일 계정</label>
                <div className="relative">
                   <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                   <input 
                    type="email" 
                    value={newStaff.email}
                    onChange={e => setNewStaff({...newStaff, email: e.target.value})}
                    placeholder="company@example.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-sm dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 block">입사일</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                    <input 
                      type="date" 
                      value={newStaff.hireDate}
                      onChange={e => setNewStaff({...newStaff, hireDate: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-[13px] dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 block">임시 비번</label>
                  <div className="relative">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                    <input 
                      type="text" 
                      value={newStaff.tempPassword}
                      onChange={e => setNewStaff({...newStaff, tempPassword: e.target.value})}
                      placeholder="최소 6자"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-[13px] dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={handleRegister}
              className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[13px] rounded-2xl hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100"
            >
              직원 계정 생성
            </button>
          </div>
        </div>
      )}

      {/* 4. 고도화된 상세 정보 수정 모달 */}
      {isDetailModalOpen && selectedProfile && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[100] p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 w-full max-w-4xl shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-10 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-2">인사 마스터 정보 관리</h2>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-black text-[10px] uppercase tracking-widest">{selectedProfile.role}</span>
                  <span className="text-sm text-slate-400 font-bold">{selectedProfile.full_name} · {selectedProfile.email}</span>
                </div>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-300 hover:text-slate-900 transition-all"><X className="w-6 h-6" /></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* 왼쪽: 기본 마스터 정보 */}
              <div className="lg:col-span-2 space-y-10">
                <section>
                  <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Core Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">휴대폰 번호</label>
                      <input 
                        type="text" 
                        value={detailForm.phoneNumber}
                        onChange={e => setDetailForm({...detailForm, phoneNumber: e.target.value})}
                        placeholder="010-0000-0000"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">주민등록번호</label>
                      <input 
                        type="text" 
                        value={detailForm.residentNumber}
                        onChange={e => setDetailForm({...detailForm, residentNumber: e.target.value})}
                        placeholder="000000-0000000"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">거주지 주소</label>
                      <input 
                        type="text" 
                        value={detailForm.address}
                        onChange={e => setDetailForm({...detailForm, address: e.target.value})}
                        placeholder="동/호수까지 상세히 입력"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-500" />
                    Family & Relations
                  </h3>
                  <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                    <button onClick={addFamily} className="w-full mb-4 py-3 border-2 border-dashed border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-white rounded-2xl transition-all flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-widest">
                       <Plus className="w-4 h-4" /> 가족 구성원 추가
                    </button>
                    <div className="space-y-3">
                      {detailForm.familyData.map((f, i) => (
                        <div key={i} className="flex gap-4 items-center animate-in slide-in-from-top-2">
                          <input className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:border-indigo-400 shadow-sm" placeholder="이름" value={f.name} onChange={e => updateFamily(i, 'name', e.target.value)} />
                          <input className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:border-indigo-400 shadow-sm" placeholder="YYMMDD" value={f.birth} onChange={e => updateFamily(i, 'birth', e.target.value)} />
                          <button onClick={() => removeFamily(i)} className="text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              {/* 오른쪽: 연차 및 상태 관리 (사이드바) */}
              <div className="space-y-10 border-l border-slate-100 pl-10">
                <section>
                  <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Leave Management
                  </h3>
                  <div className="space-y-6 bg-indigo-50/50 rounded-[2rem] p-8 border border-indigo-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">최초 입사일</label>
                      <input 
                        type="date" 
                        value={detailForm.hireDate}
                        onChange={e => setDetailForm({...detailForm, hireDate: e.target.value})}
                        className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl px-5 py-4 text-sm font-black dark:text-white outline-none focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900/30 shadow-sm"
                      />
                    </div>
                    
                    <div className="pt-4 border-t border-indigo-100">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-slate-500">시스템 자동 연차</span>
                        <span className="font-black text-indigo-600 underline underline-offset-4">{calculateAutoLeave(detailForm.hireDate)}일</span>
                      </div>
                      <div className="flex justify-between items-center mb-6">
                        <span className="text-xs font-bold text-slate-500">추가 부여 연차 (수동)</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            step="0.5"
                            value={detailForm.additionalLeave}
                            onChange={e => setDetailForm({...detailForm, additionalLeave: Number(e.target.value)})}
                            className="w-16 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 rounded-lg px-2 py-1 text-center text-sm font-black dark:text-white outline-none"
                          />
                          <span className="text-xs font-bold text-slate-400">일</span>
                        </div>
                      </div>
                      <div className="p-4 bg-indigo-600 rounded-2xl text-white flex justify-between items-center shadow-lg shadow-indigo-100">
                        <span className="text-[10px] font-black uppercase tracking-widest">총 가용 연차</span>
                        <span className="text-xl font-black">{calculateAutoLeave(detailForm.hireDate) + detailForm.additionalLeave}D</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[11px] font-black text-rose-600 uppercase tracking-[0.3em] mb-6">Account Status</h3>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => setDetailForm({...detailForm, status: detailForm.status === 'suspended' ? 'active' : 'suspended'})}
                        className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all ${detailForm.status === 'suspended' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-50 text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}
                      >
                        {detailForm.status === 'suspended' ? '업무정지 해제하기' : '업무정지 설정하기'}
                      </button>

                      {detailForm.status === 'resigned' ? (
                        <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl">
                           <div className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-3">퇴사 처리 완료</div>
                           <input 
                            type="date" 
                            value={detailForm.resignationDate}
                            onChange={e => setDetailForm({...detailForm, resignationDate: e.target.value})}
                            className="w-full bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 text-xs font-bold dark:text-white outline-none"
                          />
                           <button onClick={() => setDetailForm({...detailForm, status: 'active', resignationDate: ''})} className="mt-4 text-[10px] font-bold text-slate-400 hover:text-indigo-600 underline">퇴사 취소 및 복직 처리</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => {
                            setDetailForm({...detailForm, status: 'resigned', resignationDate: today});
                          }}
                          className="w-full py-4 bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                        >
                          임직원 퇴사 처리
                        </button>
                      )}
                    </div>

                    <div className="h-px bg-slate-100 my-6"></div>

                    {/* 위험 구역 (완전 삭제) */}
                    {!isAdminVerifying ? (
                      <button 
                        onClick={() => setIsAdminVerifying(true)}
                        className="w-full border border-slate-200 text-slate-400 hover:border-rose-400 hover:text-rose-600 py-3 rounded-xl text-[10px] font-bold uppercase transition-all"
                      >
                        계정 영구 삭제 (관리자 전용)
                      </button>
                    ) : (
                      <div className="space-y-3 animate-in slide-in-from-bottom-2">
                        <label className="text-[9px] font-black text-rose-600 uppercase">보안 확인: 관리자 비번 입력</label>
                        <input 
                          type="password" 
                          value={adminPasswordForDelete}
                          onChange={e => setAdminPasswordForDelete(e.target.value)}
                          className="w-full bg-rose-50/30 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 rounded-xl px-4 py-3 text-xs dark:text-white outline-none focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900/40"
                          placeholder="비밀번호 확인"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleDeleteMember} className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase">완전 삭제</button>
                          <button onClick={() => setIsAdminVerifying(false)} className="px-3 py-3 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase">취소</button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <div className="h-px bg-slate-100 my-4"></div>

                <section>
                  <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Security Management
                  </h3>
                  
                  {!isAdminVerifyingForReset ? (
                    <button 
                      onClick={() => setIsAdminVerifyingForReset(true)}
                      className="w-full py-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      <Shield className="w-4 h-4" /> 비밀번호 초기화 및 임시 비번 발급
                    </button>
                  ) : (
                    <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100 space-y-4 animate-in slide-in-from-top-2">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">임시 비밀번호 설정</label>
                        <input 
                          type="text" 
                          value={resetTempPassword}
                          onChange={e => setResetTempPassword(e.target.value)}
                          placeholder="최소 6자 이상"
                          className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900/40"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">관리자 비밀번호 확인</label>
                        <input 
                          type="password" 
                          value={adminPasswordForReset}
                          onChange={e => setAdminPasswordForReset(e.target.value)}
                          placeholder="현재 본인의 비밀번호"
                          className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 rounded-xl px-4 py-3 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900/40"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleResetPassword}
                          className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100"
                        >
                          초기화 실행
                        </button>
                        <button 
                          onClick={() => setIsAdminVerifyingForReset(false)}
                          className="px-4 py-3 bg-white text-slate-500 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="mt-12 flex gap-4 pt-10 border-t border-slate-100">
               <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="px-10 py-5 border-2 border-slate-100 text-slate-400 font-black uppercase tracking-widest text-[13px] rounded-[2rem] hover:bg-slate-50 transition-all"
              >
                창 닫기
              </button>
              <button 
                onClick={handleUpdateDetail}
                className="flex-1 py-5 bg-indigo-600 text-white font-black uppercase tracking-widest text-[13px] rounded-[2rem] flex items-center justify-center gap-3 hover:bg-slate-900 transition-all shadow-2xl shadow-indigo-100"
              >
                <Save className="w-5 h-5" />
                모든 변경 사항 서버 저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
