'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { Search, Building, Calculator, Filter, Save, FileText, ChevronDown } from 'lucide-react';
import { Profile, fetchCompanyUsers, updateMemberProfile } from '@/lib/api';

export default function PayrollManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Editable states per user
  const [editState, setEditState] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role === 'system_admin') {
        router.replace('/dashboard/system');
      } else if (profile && !['super_admin', 'admin'].includes(profile.role.toLowerCase())) {
        router.replace('/dashboard');
      }
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return;
      setLoading(true);
      try {
        const users = await fetchCompanyUsers(profile.company_id);
        setMembers(users);
        
        // Init edit states
        const initialStates: Record<string, any> = {};
        users.forEach(u => {
          initialStates[u.id] = {
            annual_salary: u.annual_salary || 0,
            salary_type: u.salary_type || 'ANNUAL',
            is_severance_included: u.is_severance_included || false,
            dependents: u.dependents || 1,
            children_under_20: u.children_under_20 || 0,
            non_taxable: u.non_taxable || 200000, // 기본 식대 비과세
          };
        });
        setEditState(initialStates);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [profile?.company_id]);

  const handleUpdateField = (userId: string, field: string, value: any) => {
    setEditState(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value }
    }));
  };

  const handleSave = async (userId: string) => {
    try {
      await updateMemberProfile(userId, editState[userId]);
      alert('설정이 저장되었습니다.');
    } catch (e: any) {
      alert('저장 실패: ' + e.message);
    }
  };

  const calculateNetPay = (userId: string) => {
    const state = editState[userId];
    if (!state || !state.annual_salary || state.annual_salary === 0) return null;

    // 단순화된 세금/4대보험 산출 로직 (Tax Logic v25.1 Placeholder)
    let monthlyBase = state.annual_salary;
    if (state.salary_type === 'ANNUAL') {
      monthlyBase = state.annual_salary / (state.is_severance_included ? 13 : 12);
    }
    
    const taxable = Math.max(0, monthlyBase - state.non_taxable);
    
    // 임의 공제율 통계 (국민연금 4.5%, 건보 3.545%, 장기 0.45%, 고용 0.9%, 간이세액)
    const deductionRate = 0.12; 
    const deductions = taxable * deductionRate;
    
    // 부양가족/자녀에 따른 세금 감면 (임의 시뮬레이션)
    const familyDeduction = (state.dependents * 15000) + (state.children_under_20 * 10000);
    const finalDeductions = Math.max(0, deductions - familyDeduction);
    
    return {
      gross: monthlyBase,
      net: monthlyBase - finalDeductions
    };
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  }

  const filteredMembers = members.filter(m => m.full_name.includes(searchQuery));

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      {/* 1. Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">급여 관리 고도화</h1>
            <p className="text-sm text-slate-500 font-medium">소득세법 기준의 정교한 산출과 인쇄 기능을 지원합니다.</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="이름으로 검색..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-80 pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/30 transition-all shadow-sm bg-white dark:bg-slate-800"
          />
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex gap-4 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-between gap-4 px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-600 shadow-sm w-48">
            <span className="flex items-center gap-2"><Building className="w-4 h-4 text-slate-400"/> 전체 본부</span>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </button>
          <button className="flex-1 md:flex-none flex items-center justify-between gap-4 px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-400 shadow-sm w-48">
            <span className="flex items-center gap-2"><Filter className="w-4 h-4"/> 팀 검색</span>
          </button>
        </div>
        <div className="w-full md:w-auto bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 flex overflow-hidden">
          <div className="px-4 py-4 border-r border-white/20 text-indigo-200 text-xs font-bold whitespace-nowrap">
            TAX LOGIC V25.1
          </div>
          <button className="px-6 py-4 bg-transparent text-white font-bold text-sm">
            소득세법 기준 자동 산출
          </button>
        </div>
      </div>

      {/* 3. Payroll Grid */}
      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-slate-100 bg-slate-50/50 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
          <div className="col-span-2 text-left">직원 정보</div>
          <div className="col-span-4">급여 기본 설정</div>
          <div className="col-span-3">선택입력 (공제관련)</div>
          <div className="col-span-2">실수령 산출결과</div>
          <div className="col-span-1">관리</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-50">
          {filteredMembers.map((member) => {
            const state = editState[member.id] || {};
            const netResult = calculateNetPay(member.id);

            return (
              <div key={member.id} className="grid grid-cols-12 gap-6 items-start px-8 py-8 w-full group hover:bg-slate-50/30 transition-colors">
                
                {/* 1. Identity */}
                <div className="col-span-2 flex flex-col items-start gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black text-lg">
                      {member.full_name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-800">{member.full_name}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{member.role}</div>
                    </div>
                  </div>
                </div>

                {/* 2. Salary Base Settings */}
                <div className="col-span-4 flex flex-col gap-4 pl-4 border-l border-slate-50">
                  <div className="flex gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button 
                        onClick={() => handleUpdateField(member.id, 'salary_type', 'ANNUAL')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${state.salary_type === 'ANNUAL' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                      >연봉</button>
                      <button 
                        onClick={() => handleUpdateField(member.id, 'salary_type', 'MONTHLY')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${state.salary_type === 'MONTHLY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                      >월급</button>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button 
                        onClick={() => handleUpdateField(member.id, 'is_severance_included', false)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!state.is_severance_included ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                      >퇴직금 별도</button>
                      <button 
                        onClick={() => handleUpdateField(member.id, 'is_severance_included', true)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${state.is_severance_included ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                      >퇴직금 포함</button>
                    </div>
                  </div>

                  <div className="relative">
                    <input 
                      type="number"
                      value={state.annual_salary}
                      onChange={(e) => handleUpdateField(member.id, 'annual_salary', Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-4 text-xl font-black text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/30 focus:border-indigo-500"
                    />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">원</span>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => handleUpdateField(member.id, 'annual_salary', (state.annual_salary || 0) + 10000000)} className="flex-1 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-50">+1000만</button>
                    <button onClick={() => handleUpdateField(member.id, 'annual_salary', (state.annual_salary || 0) + 1000000)} className="flex-1 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-50">+100만</button>
                    <button onClick={() => handleUpdateField(member.id, 'annual_salary', (state.annual_salary || 0) + 100000)} className="flex-1 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-50">+10만</button>
                  </div>
                </div>

                {/* 3. Deductions & Options */}
                <div className="col-span-3 flex flex-col gap-6 pl-8 border-l border-slate-50">
                  <div className="flex justify-between gap-4">
                    <div className="space-y-2 w-1/2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-tight flex items-center gap-1">
                        부양가족(본인포함) <span className="w-3 h-3 border border-slate-300 rounded-full flex items-center justify-center text-[7px]">i</span>
                      </label>
                      <div className="flex items-center justify-between border border-slate-200 rounded-xl bg-white px-2 py-1.5">
                        <button onClick={() => handleUpdateField(member.id, 'dependents', Math.max(1, state.dependents - 1))} className="w-6 h-6 flex items-center justify-center font-bold text-slate-400 hover:text-slate-700">-</button>
                        <span className="font-black text-sm">{state.dependents}</span>
                        <button onClick={() => handleUpdateField(member.id, 'dependents', state.dependents + 1)} className="w-6 h-6 flex items-center justify-center font-bold text-slate-400 hover:text-slate-700">+</button>
                      </div>
                    </div>
                    <div className="space-y-2 w-1/2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-tight">20세 이하 자녀수</label>
                      <div className="flex items-center justify-between border border-slate-200 rounded-xl bg-white px-2 py-1.5">
                        <button onClick={() => handleUpdateField(member.id, 'children_under_20', Math.max(0, state.children_under_20 - 1))} className="w-6 h-6 flex items-center justify-center font-bold text-slate-400 hover:text-slate-700">-</button>
                        <span className="font-black text-sm">{state.children_under_20}</span>
                        <button onClick={() => handleUpdateField(member.id, 'children_under_20', state.children_under_20 + 1)} className="w-6 h-6 flex items-center justify-center font-bold text-slate-400 hover:text-slate-700">+</button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-tight">비과세액(식대 등)</label>
                    <input 
                      type="number"
                      value={state.non_taxable}
                      onChange={(e) => handleUpdateField(member.id, 'non_taxable', Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>

                {/* 4. Results */}
                <div className="col-span-2 flex flex-col justify-center items-center h-full pl-8 border-l border-slate-50">
                  {netResult ? (
                    <div className="text-center space-y-1">
                      <div className="text-[10px] font-black text-emerald-500 tracking-widest uppercase">ESTIMATED NET</div>
                      <div className="text-2xl font-black text-slate-900 tracking-tight">
                        {Math.floor(netResult.net).toLocaleString()} <span className="text-sm font-bold text-slate-400">원</span>
                      </div>
                      <div className="text-[10px] font-medium text-slate-400 mt-2">
                        월 지급액: {Math.floor(netResult.gross).toLocaleString()}원
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-xs font-bold text-slate-300">
                      연봉을 입력하세요
                    </div>
                  )}
                </div>

                {/* 5. Actions */}
                <div className="col-span-1 flex flex-col gap-2 justify-center h-full items-end pl-8">
                  <button onClick={() => handleSave(member.id)} className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                    <Save className="w-3 h-3" />
                    설정 저장
                  </button>
                  <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white rounded-xl text-[10px] font-bold hover:bg-slate-900 transition-colors shadow-md">
                    <FileText className="w-3 h-3" />
                    상세 보기 / 인쇄
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
