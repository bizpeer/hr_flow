'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { 
  Banknote, 
  Search, 
  Building, 
  Filter, 
  PieChart, 
  TrendingUp, 
  Calculator, 
  CreditCard, 
  Minus, 
  Plus, 
  Info, 
  Receipt, 
  Save, 
  Loader2, 
  Printer, 
  X,
  ChevronRight
} from 'lucide-react';
import { 
  getDivisions, 
  getTeams, 
  fetchCompanyUsers, 
  updateMemberProfile, 
  Profile, 
  Division, 
  Team 
} from '@/lib/api';
import { format } from 'date-fns';
import { calculateNetPay, MEAL_ALLOWANCE_DEFAULT, SalaryCalculationResult } from '@/lib/salaryUtils';

export default function PayrollEngine() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Local Edit State
  const [editingData, setEditingData] = useState<Record<string, Partial<Profile>>>({});
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<Profile | null>(null);

  useEffect(() => {
    if (!profile) return;

    const fetchData = async () => {
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
        setEmployees(users);

        // Initialize editing state
        const initialEdits: Record<string, Partial<Profile>> = {};
        users.forEach(emp => {
          initialEdits[emp.id] = {
            annual_salary: emp.annual_salary || 0,
            salary_type: emp.salary_type || 'ANNUAL',
            is_severance_included: emp.is_severance_included || false,
            dependents: emp.dependents || 1,
            children_under_20: emp.children_under_20 || 0,
            non_taxable: emp.non_taxable !== undefined ? emp.non_taxable : MEAL_ALLOWANCE_DEFAULT
          };
        });
        setEditingData(initialEdits);
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.company_id, profile?.role]);

  const handleUpdateField = (uid: string, field: keyof Profile, value: any) => {
    setEditingData(prev => ({
      ...prev,
      [uid]: { ...prev[uid], [field]: value }
    }));
  };

  const handleSalaryAdd = (uid: string, amount: number) => {
    const current = (editingData[uid]?.annual_salary as number) || 0;
    handleUpdateField(uid, 'annual_salary', current + amount);
  };

  const handleSave = async (uid: string) => {
    const data = editingData[uid];
    if (!data) return;

    setIsSaving(uid);
    try {
      await updateMemberProfile(uid, data);
      // Update local employees state to reflect changes
      setEmployees(prev => prev.map(emp => emp.id === uid ? { ...emp, ...data } : emp));
    } catch (e: any) {
      alert('저장 실패: ' + e.message);
    } finally {
      setIsSaving(null);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const divisionMatch = selectedDivision === 'ALL' || divisions.find(d => d.id === selectedDivision)?.id === (teams.find(t => t.id === emp.team_id)?.division_id);
    const teamMatch = selectedTeam === 'ALL' || emp.team_id === selectedTeam;
    const nameMatch = emp.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    return divisionMatch && teamMatch && nameMatch;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">급여 시스템을 준비 중입니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20 print:p-0">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 print:hidden">
        <div className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-indigo-600 rounded-[2rem] text-white flex items-center justify-center shadow-2xl shadow-indigo-600/30">
              <Banknote className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Payroll Engine</h1>
              <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Advanced compensation & tax system
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600" />
            <input 
              type="text" 
              placeholder="SEARCH EMPLOYEE NAME..."
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-6 py-4 text-sm font-black text-slate-700 focus:ring-4 focus:ring-indigo-100 outline-none shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Stats & Filters Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <FilterCard 
          label="Division" 
          icon={<Building className="w-5 h-5" />} 
          value={selectedDivision} 
          onChange={(val: string) => { setSelectedDivision(val); setSelectedTeam('ALL'); }}
          options={[{ id: 'ALL', name: 'ALL DIVISIONS' }, ...divisions]}
          color="indigo"
        />
        <FilterCard 
          label="Team" 
          icon={<Filter className="w-5 h-5" />} 
          value={selectedTeam} 
          disabled={selectedDivision === 'ALL'}
          onChange={(val: string) => setSelectedTeam(val)}
          options={[{ id: 'ALL', name: 'ALL TEAMS' }, ...teams.filter(t => t.division_id === selectedDivision)]}
          color="emerald"
        />
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white flex items-center justify-between shadow-2xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-indigo-400">
               <PieChart className="w-4 h-4" />
               <span className="text-[10px] font-black uppercase tracking-widest">Tax Logic v25.4</span>
            </div>
            <p className="text-sm font-black italic">Regulation Engine Active</p>
          </div>
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
          </div>
        </div>
      </div>

      {/* Notification Bar */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">실시간 급여 시뮬레이션 적용됨</p>
            <p className="text-xs font-bold text-slate-400">데이터를 수정하면 실수령액이 즉시 재계산됩니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-32 bg-indigo-200 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-600 w-[90%] animate-pulse" />
          </div>
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Engine Optimized</span>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white rounded-[3rem] border border-slate-100 overflow-hidden shadow-sm print:hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-8 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Employee</th>
                <th className="px-10 py-8 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Compensation Setup</th>
                <th className="px-10 py-8 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Deductions</th>
                <th className="px-10 py-8 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Net Estimate</th>
                <th className="px-10 py-8 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredEmployees.map(emp => {
                const data = editingData[emp.id] || {};
                const res = calculateNetPay({
                  amount: data.annual_salary || 0,
                  type: data.salary_type || 'ANNUAL',
                  isSeveranceIncluded: data.is_severance_included || false,
                  dependents: data.dependents || 1,
                  childrenUnder20: data.children_under_20 || 0,
                  nonTaxable: data.non_taxable
                });

                const isChanged = JSON.stringify(data) !== JSON.stringify({
                  annual_salary: emp.annual_salary || 0,
                  salary_type: emp.salary_type || 'ANNUAL',
                  is_severance_included: emp.is_severance_included || false,
                  dependents: emp.dependents || 1,
                  children_under_20: emp.children_under_20 || 0,
                  non_taxable: emp.non_taxable !== undefined ? emp.non_taxable : MEAL_ALLOWANCE_DEFAULT
                });

                return (
                  <tr key={emp.id} className="group hover:bg-slate-50/50 transition-all duration-300">
                    <td className="px-10 py-7">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black group-hover:scale-110 group-hover:rotate-3 transition-transform">
                          {emp.full_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 tracking-tight">{emp.full_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-400">
                              {emp.role}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-emerald-500" />
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-10 py-7">
                      <div className="space-y-4 max-w-[340px]">
                        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                          <TypeButton 
                            active={data.salary_type === 'ANNUAL'} 
                            onClick={() => handleUpdateField(emp.id, 'salary_type', 'ANNUAL')} 
                            label="Annual" 
                          />
                          <TypeButton 
                            active={data.salary_type === 'MONTHLY'} 
                            onClick={() => handleUpdateField(emp.id, 'salary_type', 'MONTHLY')} 
                            label="Monthly" 
                          />
                        </div>
                        <div className="relative group">
                          <input 
                            type="text" 
                            value={(data.annual_salary || 0).toLocaleString()} 
                            onChange={(e) => handleUpdateField(emp.id, 'annual_salary', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                            className="w-full pl-10 pr-12 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-slate-900 text-sm focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                          />
                          <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-colors" />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 uppercase">KRW</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <QuickAddButton onClick={() => handleSalaryAdd(emp.id, 5000000)} label="+500M" />
                          <QuickAddButton onClick={() => handleSalaryAdd(emp.id, 1000000)} label="+100M" />
                          <QuickAddButton onClick={() => handleSalaryAdd(emp.id, 100000)} label="+10M" />
                        </div>
                      </div>
                    </td>

                    <td className="px-10 py-7">
                      <div className="space-y-4 max-w-[280px]">
                        <div className="grid grid-cols-2 gap-4">
                          <Counter 
                            label="Deps" 
                            value={data.dependents || 1} 
                            onDec={() => handleUpdateField(emp.id, 'dependents', Math.max(1, (data.dependents || 1) - 1))}
                            onInc={() => handleUpdateField(emp.id, 'dependents', (data.dependents || 1) + 1)}
                          />
                          <Counter 
                            label="Kids" 
                            value={data.children_under_20 || 0} 
                            onDec={() => handleUpdateField(emp.id, 'children_under_20', Math.max(0, (data.children_under_20 || 0) - 1))}
                            onInc={() => handleUpdateField(emp.id, 'children_under_20', (data.children_under_20 || 0) + 1)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Non-Taxable</p>
                          <input 
                            type="text" 
                            value={(data.non_taxable !== undefined ? data.non_taxable : MEAL_ALLOWANCE_DEFAULT).toLocaleString()}
                            onChange={(e) => handleUpdateField(emp.id, 'non_taxable', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 outline-none"
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-10 py-7">
                      <div className="space-y-2">
                        <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                          Monthly Net
                        </div>
                        <div className="text-3xl font-black text-slate-900 tracking-tighter italic">
                          ₩ {res.netPay.toLocaleString()}
                        </div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase flex gap-2">
                          <span>G: {res.monthlyGross.toLocaleString()}</span>
                          <span className="text-rose-400">D: {res.totalDeductions.toLocaleString()}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-10 py-7 text-right">
                      <div className="flex flex-col items-end gap-3">
                        <button 
                          onClick={() => handleSave(emp.id)}
                          disabled={!isChanged || isSaving === emp.id}
                          className={`w-36 h-12 flex items-center justify-center gap-3 rounded-2xl text-[11px] font-black transition-all uppercase tracking-widest ${isChanged ? 'bg-indigo-600 text-white shadow-xl hover:bg-slate-900 group-hover:scale-105' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                        >
                          {isSaving === emp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Update
                        </button>
                        <button 
                          onClick={() => setSelectedDetails(emp)}
                          className="w-36 h-12 flex items-center justify-center gap-3 bg-white text-slate-900 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-slate-900 transition-all"
                        >
                          <Receipt className="w-4 h-4 text-indigo-500" />
                          Paysheet
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip Modal */}
      {selectedDetails && (
        <PayslipModal 
          user={selectedDetails} 
          currentEdit={editingData[selectedDetails.id] || {}} 
          onClose={() => setSelectedDetails(null)} 
        />
      )}
    </div>
  );
}

function FilterCard({ label, icon, value, onChange, options, color, disabled = false }: any) {
  return (
    <div className={`p-6 rounded-[2.5rem] bg-white border border-slate-100 flex items-center gap-5 group transition-all shadow-sm ${disabled ? 'opacity-50' : ''}`}>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${color === 'indigo' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label} Filter</p>
        <select 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-transparent border-none outline-none font-black text-slate-700 text-sm appearance-none cursor-pointer"
        >
          {options.map((opt: any) => <option key={opt.id} value={opt.id}>{opt.name.toUpperCase()}</option>)}
        </select>
      </div>
    </div>
  );
}

function TypeButton({ active, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 py-1.5 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${active ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {label}
    </button>
  );
}

function QuickAddButton({ onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className="py-2.5 bg-slate-50 text-[10px] font-black text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white border border-slate-100 transition-all font-mono"
    >
      {label}
    </button>
  );
}

function Counter({ label, value, onDec, onInc }: any) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</p>
      <div className="flex items-center justify-between bg-slate-100 p-1 rounded-xl">
        <button onClick={onDec} className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all"><Minus className="w-3 h-3" /></button>
        <span className="text-xs font-black text-slate-700">{value}</span>
        <button onClick={onInc} className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-all"><Plus className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

function PayslipModal({ user, currentEdit, onClose }: { user: Profile, currentEdit: Partial<Profile>, onClose: () => void }) {
  const result = calculateNetPay({
    amount: (currentEdit.annual_salary as number) || 0,
    type: (currentEdit.salary_type as any) || 'ANNUAL',
    isSeveranceIncluded: currentEdit.is_severance_included || false,
    dependents: currentEdit.dependents || 1,
    childrenUnder20: currentEdit.children_under_20 || 0,
    nonTaxable: currentEdit.non_taxable
  });

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md print:static print:p-0 print:bg-white">
      <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-500 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Header Controls */}
        <div className="p-8 border-b border-slate-50 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Wage Statement</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{user.full_name} / {user.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all">
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:text-rose-500 transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Print Only Header */}
        <div className="hidden print:block p-10 border-b-4 border-slate-900 text-center space-y-4">
           <h1 className="text-4xl font-black tracking-widest uppercase">Monthly Wage Statement</h1>
           <div className="flex justify-between items-end border-t border-slate-200 pt-6">
              <div className="text-left">
                 <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Employee</p>
                 <p className="text-2xl font-black">{user.full_name}</p>
              </div>
              <div className="text-right">
                 <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Date</p>
                 <p className="text-lg font-black">{format(new Date(), 'yyyy.MM.dd')}</p>
              </div>
           </div>
        </div>

        {/* Modal Body */}
        <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible print:px-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Monthly Gross</p>
               <p className="text-3xl font-black text-slate-900 tracking-tighter italic">₩ {result.monthlyGross.toLocaleString()}</p>
            </div>
            <div className="p-8 bg-indigo-600 text-white rounded-[2.5rem] shadow-2xl">
               <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">Net Disbursement</p>
               <p className="text-4xl font-black tracking-tighter italic font-mono">₩ {result.netPay.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Breakdown</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <div className="grid grid-cols-2 gap-12">
               <div className="space-y-6">
                  <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-3">
                     <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                     Insurances
                  </h3>
                  <div className="space-y-4 px-2">
                     <BreakdownItem label="Pension" value={result.pension} />
                     <BreakdownItem label="Health" value={result.health} />
                     <BreakdownItem label="Long-term" value={result.longTerm} />
                     <BreakdownItem label="Employment" value={result.employment} />
                  </div>
               </div>
               <div className="space-y-6">
                  <h3 className="text-xs font-black text-sky-500 uppercase tracking-widest flex items-center gap-3">
                     <div className="w-1.5 h-6 bg-sky-600 rounded-full" />
                     Income Tax
                  </h3>
                  <div className="space-y-4 px-2">
                     <BreakdownItem label="Federal" value={result.incomeTax} />
                     <BreakdownItem label="Local" value={result.localTax} />
                     <div className="mt-8 pt-6 border-t-2 border-slate-900 flex justify-between items-end">
                        <span className="text-[10px] font-black text-rose-500 uppercase">Total Deduct</span>
                        <span className="text-2xl font-black text-rose-500 italic">-{result.totalDeductions.toLocaleString()}</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden print:bg-white print:text-black print:border-2 print:border-slate-900 print:mt-12">
            <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-wider mb-6 print:text-black print:normal-case">
              본 급여 시뮬레이션은 2025년 세법 기준으로 산출되었습니다.<br/>
              부양가족: {result.dependents}명 / 비과세: {result.nonTaxable.toLocaleString()}원
            </p>
            <div className="flex justify-between items-end pt-6 border-t border-white/10 print:border-slate-900">
               <div className="space-y-1">
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest print:text-black">Issuance ID</p>
                  <p className="text-xs font-mono tracking-widest">{user.id.substring(0, 16).toUpperCase()}</p>
               </div>
               <div className="text-right italic">
                  <p className="text-xs font-black opacity-60">System Payroll Authority</p>
               </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print\\:static, .print\\:static * { visibility: visible; }
          .print\\:static { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; }
          .print\\:hidden { display: none !important; }
          input, select, button { display: none !important; }
        }
      `}} />
    </div>
  );
}

function BreakdownItem({ label, value }: { label: string, value: number }) {
  return (
    <div className="flex justify-between items-center group">
       <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">{label}</span>
       <span className="text-sm font-black text-slate-700">{value.toLocaleString()}원</span>
    </div>
  );
}
