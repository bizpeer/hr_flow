import React, { useState, useEffect } from 'react';
import { 
  Plus, Minus, Printer, X, Users, MoreVertical, Banknote, AlertCircle, Info, Calculator, Loader2, Search, Building, Filter, PieChart
} from 'lucide-react';
import { 
  collection, query, onSnapshot, doc, updateDoc, where 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import type { UserData } from '../store/authStore';

const MEAL_ALLOWANCE_DEFAULT = 200000;

const calculateNetPay = (emp: Partial<UserData> & { currentVal?: number }, taxTable: any) => {
  const salary = emp.currentVal || emp.annualSalary || 0;
  if (salary <= 0) return null;

  const type = emp.salaryType || 'ANNUAL';
  const isSeveranceIncluded = emp.isSeveranceIncluded || false;
  const dependents = emp.dependents || 1;
  const children = emp.childrenUnder20 || 0;
  const nonTaxable = emp.nonTaxable !== undefined ? emp.nonTaxable : MEAL_ALLOWANCE_DEFAULT;

  const monthlyGross = isSeveranceIncluded ? Math.floor(salary / 13) : Math.floor(salary / 12);

  const taxableIncome = Math.max(0, monthlyGross - nonTaxable);

  // 1. 국민연금 (4.75%, 상한액 302,570원, 하한액 19,000원 - 2026 기준)
  let pension = Math.floor(taxableIncome * 0.0475);
  pension = Math.floor(pension / 10) * 10; // 원 단위 절사
  if (pension > 302570) pension = 302570;
  if (taxableIncome > 0 && pension < 19000) pension = 19000;

  // 2. 건강보험 (3.595%)
  let health = Math.floor(taxableIncome * 0.03595);
  health = Math.floor(health / 10) * 10; // 원 단위 절사

  // 3. 장기요양보험 (건강보험의 13.14%)
  let longTerm = Math.floor(health * 0.1314);
  longTerm = Math.floor(longTerm / 10) * 10; // 원 단위 절사

  // 4. 고용보험 (0.9%)
  let employment = Math.floor(taxableIncome * 0.009);
  employment = Math.floor(employment / 10) * 10; // 원 단위 절사

  const totalInsurance = pension + health + longTerm + employment;

  // 5. 소득세 (간이세액표 기반 조회)
  let incomeTax = 0;
  
  if (taxTable && taxTable.brackets && taxableIncome > 0) {
    const monthlyIncome = Math.floor(taxableIncome / 1000); // 세액표는 천원 단위 기준
    const bracket = taxTable.brackets.find((b: any) => monthlyIncome >= b.min && monthlyIncome < b.max);
    
    if (bracket) {
      // dependents - 1 (컬럼 인덱스, 0: 1인, 1: 2인, 2: 3인...)
      const colIdx = Math.min(Math.max(0, dependents - 1), 10);
      incomeTax = bracket.taxes[colIdx] || 0;
      
      // 자녀 세액공제 반영 (2026.03.01 기준 반영)
      if (children > 0) {
        let childCredit = 0;
        if (children === 1) childCredit = 20830;
        else if (children === 2) childCredit = 45830;
        else if (children >= 3) childCredit = 45830 + (children - 2) * 33330;
        
        incomeTax = Math.max(0, incomeTax - childCredit);
      }
    } else {
      // 테이블에 해당 구간이 없는 경우 Fallback
      const taxBase = taxableIncome - totalInsurance;
      if (taxBase <= 1200000) incomeTax = 0;
      else if (taxBase <= 4600000) incomeTax = Math.floor(taxBase * 0.06);
      else if (taxBase <= 8800000) incomeTax = Math.floor(taxBase * 0.15 - 108000);
      else incomeTax = Math.floor(taxBase * 0.24 - 522000);
    }
  } else if (taxableIncome > 0) {
    // 세액표 데이터 자체가 없는 경우 Fallback
    const taxBase = taxableIncome - totalInsurance;
    if (taxBase <= 1200000) incomeTax = 0;
    else if (taxBase <= 4600000) incomeTax = Math.floor(taxBase * 0.06);
    else if (taxBase <= 8800000) incomeTax = Math.floor(taxBase * 0.15 - 108000);
    else incomeTax = Math.floor(taxBase * 0.24 - 522000);
  }

  // 6. 지방소득세 (소득세의 10%)
  const localTax = Math.floor(incomeTax * 0.1);

  const totalDeductions = totalInsurance + incomeTax + localTax;
  const netPay = monthlyGross - totalDeductions;

  return {
    monthlyGross,
    pension,
    health,
    longTerm,
    employment,
    totalInsurance,
    incomeTax,
    localTax,
    totalDeductions,
    netPay,
    nonTaxable,
    dependents,
    children,
    isSeveranceIncluded,
    salaryBasis: type
  };
};

export const SalaryManagement: React.FC = () => {
  const { userData } = useAuthStore();
  const isAdminOrMaster = userData?.role === 'SUPER_ADMIN' || userData?.role === 'ADMIN';
  const [employees, setEmployees] = useState<UserData[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxTable, setTaxTable] = useState<any>(null);
  
  // Filters
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // States for individual edits
  const [editingData, setEditingData] = useState<Record<string, Partial<UserData>>>({});
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<UserData | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyId = userData.companyId;

    const unsubDivs = onSnapshot(query(collection(db, 'divisions'), where('companyId', '==', companyId)), (snap) => {
      setDivisions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('companyId', '==', companyId)), (snap) => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q = query(collection(db, 'UserProfile'), where('companyId', '==', companyId));
    const unsubEmployees = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData));
      setEmployees(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      
      const initialEdits: Record<string, Partial<UserData>> = {};
      data.forEach(emp => {
        initialEdits[emp.uid] = {
           annualSalary: emp.annualSalary || 0,
           salaryType: emp.salaryType || 'ANNUAL',
           isSeveranceIncluded: emp.isSeveranceIncluded || false,
           dependents: emp.dependents || 1,
           childrenUnder20: emp.childrenUnder20 || 0,
           nonTaxable: emp.nonTaxable !== undefined ? emp.nonTaxable : MEAL_ALLOWANCE_DEFAULT
        };
      });
      setEditingData(initialEdits);
      setLoading(false);
    });

    const unsubTax = onSnapshot(doc(db, 'system_config', 'tax_table'), (doc) => {
      if (doc.exists()) setTaxTable(doc.data());
    });

    return () => { unsubDivs(); unsubTeams(); unsubEmployees(); unsubTax(); };
  }, [userData?.companyId]);

  const handleUpdateField = (uid: string, field: string, value: any) => {
    setEditingData((prev: any) => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        [field]: value
      }
    }));
  };

  const isChangedAny = Object.keys(editingData).some((uid: any) => {
    const emp = employees.find((e: any) => e.uid === uid);
    if (!emp) return false;
    const data = editingData[uid];
    return JSON.stringify(data) !== JSON.stringify({
       annualSalary: emp.annualSalary || 0,
       salaryType: emp.salaryType || 'ANNUAL',
       isSeveranceIncluded: emp.isSeveranceIncluded || false,
       dependents: emp.dependents || 1,
       childrenUnder20: emp.childrenUnder20 || 0,
       nonTaxable: emp.nonTaxable !== undefined ? emp.nonTaxable : MEAL_ALLOWANCE_DEFAULT
    });
  });

  const handleSalaryAdd = (uid: string, amount: number) => {
    const currentData = editingData[uid] || {};
    const factor = (currentData.salaryType === 'MONTHLY') ? (currentData.isSeveranceIncluded ? 13 : 12) : 1;
    const currentBase = currentData.salaryType === 'MONTHLY' 
      ? Math.floor((currentData.annualSalary || 0) / factor)
      : (currentData.annualSalary || 0);
      
    handleUpdateField(uid, 'annualSalary', currentBase + amount);
  };

  const handleSave = async (uid: string) => {
    const data = editingData[uid];
    if (!data) return;

    if (!isAdminOrMaster) {
      alert('최고 관리자 또는 관리자(ADMIN)만 수정 가능합니다.');
      return;
    }
    setIsSaving(uid);
    try {
      await updateDoc(doc(db, 'UserProfile', uid), data);
    } catch (e) {
      alert('저장 실패: ' + (e as Error).message);
    } finally {
      setIsSaving(null);
    }
  };

  const filteredEmployees = employees
    .filter((emp: any) => {
      if (emp.status === 'RESIGNED') return false;
      return (selectedDivision === 'ALL' || emp.divisionId === selectedDivision) &&
             (selectedTeam === 'ALL' || emp.teamId === selectedTeam) &&
             (emp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    });

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

  return (
    <div className="flex-1 p-4 md:p-8 bg-slate-50 min-h-screen font-sans print:p-0 print:bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto space-y-6 print:hidden">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200/60">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl text-white shadow-xl shadow-indigo-100 ring-4 ring-white">
               <Banknote className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-1">급여 체계 관리</h1>
              <p className="text-slate-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-indigo-400" />
                2026년 대한민국 소득세법 및 4대 보험 표준 로직 적용됨
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isChangedAny && (
               <div className="px-4 py-2 bg-rose-50 text-rose-500 text-[10px] font-black rounded-lg animate-pulse border border-rose-100">저장되지 않은 변경사항이 있습니다</div>
            )}
            <div className="relative group w-full lg:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" placeholder="검색..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-6 py-3.5 bg-white rounded-2xl shadow-sm border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-bold text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <div className="bg-white p-4 rounded-[1.25rem] border border-slate-100 shadow-sm flex items-center gap-3 hover:border-indigo-200 transition-colors">
              <Building className="w-5 h-5 text-indigo-400" />
              <select 
                value={selectedDivision} onChange={(e) => {setSelectedDivision(e.target.value); setSelectedTeam('ALL');}}
                className="flex-1 bg-transparent border-none outline-none font-black text-slate-700 text-xs appearance-none cursor-pointer"
              >
                 <option value="ALL">전체 본부</option>
                 {divisions.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
           </div>
           <div className="bg-white p-4 rounded-[1.25rem] border border-slate-100 shadow-sm flex items-center gap-3 hover:border-emerald-200 transition-colors">
              <Filter className="w-5 h-5 text-emerald-400" />
              <select 
                value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
                disabled={selectedDivision === 'ALL'}
                className="flex-1 bg-transparent border-none outline-none font-black text-slate-700 text-xs appearance-none disabled:opacity-30 cursor-pointer"
              >
                 <option value="ALL">팀 검색</option>
                 {teams.filter((t: any) => t.divisionId === selectedDivision).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
           </div>
           <div className="md:col-span-2 premium-card p-4 bg-slate-900 text-white shadow-indigo-900/10 flex items-center justify-between px-8 border-none overflow-hidden relative">
              <div className="relative z-10 flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Standard Update</span>
                <span className="text-sm font-black">2026.03 개정 세법 및 4.75% 연금율 적용</span>
              </div>
              <PieChart className="w-10 h-10 text-white/5 absolute -right-2 -bottom-2" />
           </div>
        </div>

        {/* List Section */}
        <div className="space-y-4">
           
           {/* Desktop Table View */}
           <div className="hidden lg:block premium-card overflow-hidden">
              <div className="overflow-x-auto">
                 <table className="w-full min-w-[1200px]">
                    <thead>
                       <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">직원 정보</th>
                          <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">급여 기본 설정</th>
                          <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">선택입력 (공제관련)</th>
                          <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">실수령 산출결과</th>
                          <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">관리</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {filteredEmployees.map((emp: any) => {
                          const data = editingData[emp.uid] || {};
                          const res = calculateNetPay({ ...emp, currentVal: data.annualSalary, ...data }, taxTable);
                          const isChanged = JSON.stringify(data) !== JSON.stringify({
                             annualSalary: emp.annualSalary || 0,
                             salaryType: emp.salaryType || 'ANNUAL',
                             isSeveranceIncluded: emp.isSeveranceIncluded || false,
                             dependents: emp.dependents || 1,
                             childrenUnder20: emp.childrenUnder20 || 0,
                             nonTaxable: emp.nonTaxable !== undefined ? emp.nonTaxable : MEAL_ALLOWANCE_DEFAULT
                          });

                          return (
                             <tr key={emp.uid} className="hover:bg-slate-50/50 transition-all group">
                                <td className="px-8 py-6">
                                   <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black shadow-sm group-hover:rotate-6 transition-transform">{emp.name[0]}</div>
                                      <div>
                                         <div className="text-md font-black text-slate-800">{emp.name}</div>
                                         <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{emp.role}</div>
                                      </div>
                                   </div>
                                </td>
                                
                                <td className="px-8 py-6">
                                   <div className="space-y-4">
                                      <div className="flex gap-2">
                                         <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                            <button 
                                              onClick={() => handleUpdateField(emp.uid, 'salaryType', 'ANNUAL')}
                                              className={`px-4 py-1.5 text-[9px] font-black rounded-lg transition-all ${data.salaryType === 'ANNUAL' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                                            >연봉</button>
                                            <button 
                                              onClick={() => handleUpdateField(emp.uid, 'salaryType', 'MONTHLY')}
                                              className={`px-4 py-1.5 text-[9px] font-black rounded-lg transition-all ${data.salaryType === 'MONTHLY' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                                            >월급</button>
                                         </div>
                                         <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                            <button 
                                              onClick={() => handleUpdateField(emp.uid, 'isSeveranceIncluded', false)}
                                              className={`px-4 py-1.5 text-[9px] font-black rounded-lg transition-all ${!data.isSeveranceIncluded ? 'bg-slate-800 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                            >별도</button>
                                            <button 
                                              onClick={() => handleUpdateField(emp.uid, 'isSeveranceIncluded', true)}
                                              className={`px-4 py-1.5 text-[9px] font-black rounded-lg transition-all ${data.isSeveranceIncluded ? 'bg-slate-800 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                            >포함</button>
                                         </div>
                                      </div>
                                      
                                      <div className="space-y-2">
                                         <div className="relative group/input">
                                            <input 
                                              type="text" 
                                              value={(data.salaryType === 'MONTHLY' 
                                                ? Math.floor((data.annualSalary || 0) / (data.isSeveranceIncluded ? 13 : 12))
                                                : (data.annualSalary || 0)
                                              ).toLocaleString()} 
                                              onChange={(e) => handleUpdateField(emp.uid, 'annualSalary', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                                              className="w-full pl-5 pr-10 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-slate-800 outline-none group-hover/input:border-slate-100 focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
                                            />
                                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300 group-focus-within/input:text-indigo-400">원</span>
                                         </div>
                                         
                                         <div className="px-2 py-2 flex justify-between items-center text-[10px] font-bold text-slate-400">
                                            <span>
                                               {data.salaryType === 'ANNUAL' ? '월 환산: ' : '연 환산: '}
                                               <span className="text-indigo-500 font-extrabold ml-1">
                                                  {(data.salaryType === 'ANNUAL' 
                                                    ? Math.floor((data.annualSalary || 0) / (data.isSeveranceIncluded ? 13 : 12))
                                                    : (data.annualSalary || 0)
                                                  ).toLocaleString()}원
                                               </span>
                                            </span>
                                            <div className="flex gap-1">
                                              <button onClick={() => handleSalaryAdd(emp.uid, 5000000)} className="px-1.5 py-0.5 bg-slate-100 rounded text-[8px] hover:bg-slate-200">+500</button>
                                              <button onClick={() => handleSalaryAdd(emp.uid, 1000000)} className="px-1.5 py-0.5 bg-slate-100 rounded text-[8px] hover:bg-slate-200">+100</button>
                                            </div>
                                         </div>
                                      </div>
                                   </div>
                                </td>
   
                                <td className="px-8 py-6">
                                   <div className="space-y-4">
                                      <div className="flex items-center gap-6">
                                         <div className="flex-1 space-y-2">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">부양 가족 <Info className="w-3 h-3 text-slate-200" /></div>
                                            <div className="flex items-center bg-slate-50 rounded-xl p-1 border border-transparent hover:border-slate-100 transition-all">
                                               <button onClick={() => handleUpdateField(emp.uid, 'dependents', Math.max(1, (data.dependents || 1) - 1))} className="p-2 hover:bg-white rounded-lg shadow-sm"><Minus className="w-3 h-3 text-slate-400" /></button>
                                               <span className="flex-1 text-center text-xs font-black text-slate-700">{data.dependents || 1}</span>
                                               <button onClick={() => handleUpdateField(emp.uid, 'dependents', (data.dependents || 1) + 1)} className="p-2 hover:bg-white rounded-lg shadow-sm"><Plus className="w-3 h-3 text-slate-400" /></button>
                                            </div>
                                         </div>
                                         <div className="flex-1 space-y-2">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">자녀 수</div>
                                            <div className="flex items-center bg-slate-50 rounded-xl p-1 border border-transparent hover:border-slate-100 transition-all">
                                               <button onClick={() => handleUpdateField(emp.uid, 'childrenUnder20', Math.max(0, (data.childrenUnder20 || 0) - 1))} className="p-2 hover:bg-white rounded-lg shadow-sm"><Minus className="w-3 h-3 text-slate-400" /></button>
                                               <span className="flex-1 text-center text-xs font-black text-slate-700">{data.childrenUnder20 || 0}</span>
                                               <button onClick={() => handleUpdateField(emp.uid, 'childrenUnder20', (data.childrenUnder20 || 0) + 1)} className="p-2 hover:bg-white rounded-lg shadow-sm"><Plus className="w-3 h-3 text-slate-400" /></button>
                                            </div>
                                         </div>
                                      </div>
                                      <div className="space-y-2">
                                         <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">비과세액 (월)</div>
                                         <input 
                                           type="text" value={(data.nonTaxable !== undefined ? data.nonTaxable : MEAL_ALLOWANCE_DEFAULT).toLocaleString()}
                                           onChange={(e) => handleUpdateField(emp.uid, 'nonTaxable', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                                           className="w-full px-4 py-2.5 bg-slate-50 border border-transparent rounded-xl text-xs font-black text-slate-600 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                                         />
                                      </div>
                                   </div>
                                </td>
   
                                <td className="px-8 py-6">
                                   {res ? (
                                      <div className="space-y-1 py-2">
                                         <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Monthly Net Pay</div>
                                         <div className="text-3xl font-black text-slate-900 tracking-tighter">{res.netPay.toLocaleString()} <span className="text-sm font-bold text-slate-400">원</span></div>
                                         <div className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                                            지급액: {res.monthlyGross.toLocaleString()}원
                                         </div>
                                      </div>
                                   ) : (
                                      <div className="h-20 flex items-center justify-center opacity-20 border-2 border-dashed border-slate-100 rounded-2xl"><Users className="w-6 h-6" /></div>
                                   )}
                                </td>
   
                                <td className="px-8 py-6 relative">
                                   <div className="flex items-center justify-end gap-3">
                                      <button 
                                        onClick={() => handleSave(emp.uid)}
                                        disabled={!isChanged || isSaving === emp.uid}
                                        className={`px-5 py-3 rounded-2xl text-[11px] font-black transition-all ${isChanged ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}
                                      >
                                         {isSaving === emp.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : '설정 저장'}
                                      </button>
                                      
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === emp.uid ? null : emp.uid); }}
                                        className={`p-3 rounded-2xl transition-all ${activeMenuId === emp.uid ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                      >
                                         <MoreVertical className="w-4 h-4" />
                                      </button>

                                      {/* Dropdown Menu */}
                                      {activeMenuId === emp.uid && (
                                        <div className="absolute right-8 top-16 w-52 bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 z-50 p-2 animate-in fade-in zoom-in-95 duration-200">
                                          <button 
                                            onClick={() => setSelectedDetails(emp)}
                                            disabled={!res}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-700 text-[11px] font-black rounded-xl transition-all"
                                          >
                                            <Calculator className="w-4 h-4 text-indigo-500" /> 상세 내역 및 인쇄
                                          </button>
                                          <button 
                                            onClick={() => alert('기능 준비 중입니다.')}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-slate-400 text-[11px] font-black rounded-xl transition-all"
                                          >
                                            <Printer className="w-4 h-4" /> 급여명세서 메일 발송
                                          </button>
                                        </div>
                                      )}
                                   </div>
                                </td>
                             </tr>
                          );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>

           {/* Mobile Card View */}
           <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
               {filteredEmployees.map((emp: any) => {
                  const data = editingData[emp.uid] || {};
                  const res = calculateNetPay({ ...emp, currentVal: data.annualSalary, ...data }, taxTable);
                  const isChanged = JSON.stringify(data) !== JSON.stringify({
                     annualSalary: emp.annualSalary || 0,
                     salaryType: emp.salaryType || 'ANNUAL',
                     isSeveranceIncluded: emp.isSeveranceIncluded || false,
                     dependents: emp.dependents || 1,
                     childrenUnder20: emp.childrenUnder20 || 0,
                     nonTaxable: emp.nonTaxable !== undefined ? emp.nonTaxable : MEAL_ALLOWANCE_DEFAULT
                  });

                  return (
                     <div key={emp.uid} className="premium-card p-6 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">{emp.name[0]}</div>
                              <div>
                                 <h3 className="text-sm font-black text-slate-900">{emp.name}</h3>
                                 <p className="text-[10px] font-bold text-slate-400">{emp.role}</p>
                              </div>
                           </div>
                           <button onClick={() => setSelectedDetails(emp)} className="p-2 bg-slate-50 rounded-xl text-slate-400"><Calculator className="w-5 h-5" /></button>
                        </div>

                        <div className="space-y-4">
                           <div className="relative">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">급여 금액 (원)</label>
                              <input 
                                type="text"
                                value={(data.salaryType === 'MONTHLY' 
                                  ? Math.floor((data.annualSalary || 0) / (data.isSeveranceIncluded ? 13 : 12))
                                  : (data.annualSalary || 0)
                                ).toLocaleString()}
                                onChange={(e) => handleUpdateField(emp.uid, 'annualSalary', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                                className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-slate-800 outline-none focus:border-indigo-500 transition-all font-mono"
                              />
                              <div className="flex gap-2 mt-2">
                                 <button onClick={() => handleUpdateField(emp.uid, 'salaryType', 'ANNUAL')} className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all ${data.salaryType === 'ANNUAL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>연봉</button>
                                 <button onClick={() => handleUpdateField(emp.uid, 'salaryType', 'MONTHLY')} className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all ${data.salaryType === 'MONTHLY' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>월급</button>
                              </div>
                           </div>

                           {res && (
                              <div className="p-5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                                 <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1">Estimated Net</p>
                                 <p className="text-2xl font-black">{res.netPay.toLocaleString()}원</p>
                              </div>
                           )}

                           <button 
                             onClick={() => handleSave(emp.uid)}
                             disabled={!isChanged || isSaving === emp.uid}
                             className={`w-full py-4 rounded-2xl font-black text-xs transition-all ${isChanged ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}
                           >
                              {isSaving === emp.uid ? '저장 중...' : '급여 설정 업데이트'}
                           </button>
                        </div>
                     </div>
                  );
               })}
           </div>
        </div>
      </div>

      {/* Details & Print Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 print:relative print:p-0 print:bg-white">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500 print:shadow-none print:border-none print:w-full print:max-w-none print:rounded-none">
            
            {/* Modal Header */}
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white print:bg-transparent print:text-black print:p-4 print:border-b-2 print:border-black">
              <div className="flex items-center gap-3">
                 <Calculator className="w-6 h-6 text-indigo-400 print:hidden" />
                 <div>
                    <h2 className="text-xl font-black tracking-tight">{selectedDetails.name}님 급여 산출 명세서</h2>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 print:text-black print:text-[8pt] italic">2026년 대한민국 소득세법 기준 산출 내역 (본인 포함 {editingData[selectedDetails.uid]?.dependents || 1}인 부양, 자식 {editingData[selectedDetails.uid]?.childrenUnder20 || 0}인)</p>
                 </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                 <button onClick={handlePrint} className="p-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all"><Printer className="w-5 h-5" /></button>
                 <button onClick={() => setSelectedDetails(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all"><X className="w-5 h-5" /></button>
              </div>
            </div>
            
            <div className="p-8 space-y-8 print:p-4 print:space-y-6">
              {(() => {
                const draft = editingData[selectedDetails.uid] || {};
                const res = calculateNetPay({ ...selectedDetails, currentVal: draft.annualSalary, ...draft }, taxTable);
                if (!res) return null;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 print:border-2 print:border-slate-200">
                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2 print:text-[10pt] print:text-black">월 지급 총액 (Gross)</div>
                        <div className="text-2xl font-black text-slate-800 print:text-[18pt]">{res.monthlyGross.toLocaleString()}원</div>
                        <div className="text-[9px] font-bold text-slate-400 mt-2 flex items-center gap-1">
                           <AlertCircle className="w-3 h-3" />
                           {res.salaryBasis === 'ANNUAL' ? '연봉의 1/' + (res.isSeveranceIncluded ? '13' : '12') : '월 정기고급'} (퇴지금 {res.isSeveranceIncluded ? '포함' : '별도'})
                        </div>
                      </div>
                      <div className="p-6 bg-indigo-600 text-white rounded-2xl shadow-xl ring-4 ring-indigo-50 print:bg-slate-100 print:text-black print:ring-0 print:border-2 print:border-black">
                        <div className="text-[10px] font-black text-indigo-200 uppercase mb-2 print:text-[10pt] print:text-black">월 예상 실수령액 (Monthly Net)</div>
                        <div className="text-3xl font-black">{res.netPay.toLocaleString()}원</div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="border-t-2 border-dashed border-slate-100 pt-6 print:border-t-2 print:border-black">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 print:text-[12pt] print:text-black">
                           <Users className="w-4 h-4 print:hidden" />
                           기본 공제 및 비과세 정보
                        </h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                           <div className="p-3 bg-slate-50/50 rounded-xl">
                              <div className="text-9px] font-bold text-slate-400 mb-1">비과세액</div>
                              <div className="text-sm font-black text-slate-700">{res.nonTaxable.toLocaleString()}원</div>
                           </div>
                           <div className="p-3 bg-slate-50/50 rounded-xl">
                              <div className="text-9px] font-bold text-slate-400 mb-1">부양가족</div>
                              <div className="text-sm font-black text-slate-700">{res.dependents}명</div>
                           </div>
                           <div className="p-3 bg-slate-50/50 rounded-xl">
                              <div className="text-9px] font-bold text-slate-400 mb-1">20세이하 자녀</div>
                              <div className="text-sm font-black text-slate-700">{res.children}명</div>
                           </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                               <Info className="w-3.5 h-3.5" /> 4대 보험 (근로자 부담)
                            </h3>
                            <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl text-sm font-medium border border-slate-100">
                               <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">국민연금 (4.75%)</span>
                                  <span className="font-bold text-slate-800">{res.pension.toLocaleString()}원</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">건강보험 (3.595%)</span>
                                  <span className="font-bold text-slate-800">{res.health.toLocaleString()}원</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">장기요양 (13.14%)</span>
                                  <span className="font-bold text-slate-800">{res.longTerm.toLocaleString()}원</span>
                               </div>
                               <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                                  <span className="text-slate-500 text-xs">고용보험 (0.9%)</span>
                                  <span className="font-bold text-slate-800">{res.employment.toLocaleString()}원</span>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-2">
                               <Calculator className="w-3.5 h-3.5" /> 세금 (소득세/지방세)
                            </h3>
                            <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl text-sm font-medium border border-slate-100">
                               <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">근로소득세</span>
                                  <span className="font-bold text-slate-800">{res.incomeTax.toLocaleString()}원</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-xs">지방소득세 (10%)</span>
                                  <span className="font-bold text-slate-800">{res.localTax.toLocaleString()}원</span>
                               </div>
                               <div className="mt-6 pt-4 border-t-2 border-slate-100 flex justify-between items-center">
                                  <span className="text-[10px] font-black text-rose-500 uppercase">총 공제 합계</span>
                                  <span className="text-lg font-black text-rose-500">-{res.totalDeductions.toLocaleString()}원</span>
                               </div>
                            </div>
                         </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 border-l-4 border-indigo-500 p-5 rounded-2xl print:bg-white print:border-black print:mt-10">
                       <p className="text-[9px] text-slate-400 leading-relaxed font-medium print:text-[8pt] print:text-black">
                          본 명세서는 2026년도 대한민국 소득세법 및 각 보험 요율 기준에 따른 예상 산출 내역입니다.<br/>
                          실제 지급액은 회사별 수당 체계, 비과세 적용 범위, 부양가족 상세 요건 등에 따라 상이할 수 있습니다.
                       </p>
                       <div className="mt-4 flex justify-between items-end">
                          <div className="text-[10px] font-black text-white/50 print:text-black print:text-[8pt]">Issue Date: {new Date().toLocaleDateString()}</div>
                          <div className="text-xs font-black text-indigo-400 italic print:text-black print:text-[10pt]">HR FLOW System Verification</div>
                       </div>
                    </div>
                  </>
                );
              })()}
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100 text-center print:hidden">
               <button onClick={() => setSelectedDetails(null)} className="px-8 py-3 bg-slate-200 text-slate-600 font-black rounded-xl hover:bg-slate-300 transition-all">창 닫기</button>
            </div>

          </div>
        </div>
      )}

      {/* Global CSS for Print */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print\\:relative, .print\\:relative * { visibility: visible; }
          .print\\:relative { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            height: auto;
            background: white !important;
          }
          .print\\:hidden { display: none !important; }
        }
      `}} />
    </div>
  );
};

