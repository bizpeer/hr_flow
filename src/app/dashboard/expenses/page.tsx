'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { 
  Calendar, Download, FileText, Search, TrendingUp, 
  DollarSign, Filter, ChevronRight, Plus, Upload, 
  X, CheckCircle, Clock, AlertCircle, Paperclip, XCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Expense } from '@/lib/api';

export default function ExpensesManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('식비');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const role = (profile?.role || 'member').trim().toLowerCase();
  const isAdminView = ['super_admin', 'admin', 'sub_admin'].includes(role);
  const isSubAdmin = role === 'sub_admin';

  const fetchExpenses = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('expense_requests')
        .select('*, profiles(full_name, team_id)')
        .eq('company_id', profile.company_id);

      if (!isAdminView) {
        // 일반 직원은 본인 것만 (기간 필터링 없음 또는 별도 로직)
        query = query.eq('user_id', profile.id);
      }

      // 관리자는 기간 내 승인건 중심, 멤버는 기간 내 신청건 중심
      const { data, error } = await query
        .order('expense_date', { ascending: false })
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      if (error && error.code !== '42P01') throw error;
      
      let finalData = data || [];

      // sub_admin 필터링 (본인 본부 데이터만)
      if (isSubAdmin && (profile as any).division_id) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id')
          .eq('division_id', (profile as any).division_id);
          
        if (teamsData) {
          const validTeamIds = teamsData.map(t => t.id);
          finalData = finalData.filter(req => validTeamIds.includes(req.profiles?.team_id));
        }
      }

      setExpenses(finalData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) {
      fetchExpenses();

      // 실시간 동기화 설정
      const channel = supabase
        .channel('expense-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'expense_requests',
            filter: `company_id=eq.${profile?.company_id}`
          },
          () => fetchExpenses()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile, authLoading, startDate, endDate]);

  const handleFileUpload = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `receipts/${profile?.company_id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (details.length > 1000) {
      alert('상세내역은 1,000자 이내로 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      let attachment_url = '';
      if (file) {
        attachment_url = await handleFileUpload(file);
      }

      const { error } = await supabase.from('expense_requests').insert([{
        description: itemName,
        amount: Number(amount),
        expense_date: expenseDate,
        category,
        details,
        attachment_url,
        status: 'PENDING',
        user_id: profile.id,
        company_id: profile.company_id
      }]);

      if (error) throw error;
      
      alert('지출 결의가 신청되었습니다.');
      setShowModal(false);
      resetForm();
      fetchExpenses();
    } catch (err: any) {
      alert('신청 실패: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setItemName('');
    setAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setCategory('식비');
    setDetails('');
    setFile(null);
  };

  const filteredExpenses = expenses.filter(e => 
    (e.description || '').includes(searchQuery) || 
    (e.profiles?.full_name || '').includes(searchQuery) ||
    (e.category || '').includes(searchQuery)
  );

  const approvedExpenses = filteredExpenses.filter(e => e.status === 'APPROVED');
  const totalAmount = approvedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100 flex items-center gap-1.5 w-fit"><CheckCircle className="w-3 h-3" /> 승인됨</span>;
      case 'SUB_APPROVED': return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1.5 w-fit"><Clock className="w-3 h-3" /> 1차승인</span>;
      case 'REJECTED': return <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black border border-rose-100 flex items-center gap-1.5 w-fit"><XCircle className="w-3 h-3" /> 반려됨</span>;
      default: return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black border border-amber-100 flex items-center gap-1.5 w-fit"><Clock className="w-3 h-3" /> 대기중</span>;
    }
  };

  if (loading && !expenses.length) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-10 pb-20 px-4 md:px-0">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight transition-all">
              {isAdminView ? '지출 분석 및 통합 조회' : '지출결의 신청'}
            </h1>
            <p className="text-sm text-slate-500 font-medium tracking-tight">
              {isAdminView ? '전사 지출 데이터를 분석하고 승인 내역을 통합 조회합니다.' : '항목별 지출을 신청하고 처리 상태를 확인합니다.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isAdminView && (
            <button 
              onClick={() => setShowModal(true)}
              className="px-8 py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg active:scale-95"
            >
              <Plus className="w-5 h-5" />
              신청하기
            </button>
          )}
          {isAdminView && (
            <>
              <button className="hidden md:flex px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm text-[11px] uppercase tracking-widest">
                <FileText className="w-4 h-4 text-indigo-600" />
                Generate Report
              </button>
              <button className="px-6 py-3 bg-slate-900 border border-slate-800 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-black transition-colors shadow-md text-[11px] uppercase tracking-widest">
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Total Analysis Banner (Admin Only) */}
      {isAdminView && (
        <div className="bg-[#0f172a] rounded-[2.5rem] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between shadow-2xl relative overflow-hidden ring-1 ring-white/10">
          <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <p className="text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase">Analysis Summary (Approved Only)</p>
            <div className="flex items-end gap-3 text-white">
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter transition-all">
                {totalAmount.toLocaleString()}
              </h2>
              <span className="text-xl font-black text-emerald-500 mb-1">KRW</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold pt-1">
              <TrendingUp className="w-4 h-4" />
              <span>선택 기간 내 총 {approvedExpenses.length}건 승인됨</span>
            </div>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 mt-8 md:mt-0">
            <div className="space-y-2">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-center md:text-left">Lookup Period</p>
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 px-4 backdrop-blur-sm">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-slate-300 dark:text-white text-xs font-bold outline-none" />
                <span className="text-slate-500 italic font-serif">to</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-slate-300 dark:text-white text-xs font-bold outline-none" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Integrated List View */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* List Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-8 border-b border-slate-50 gap-6 bg-slate-50/30">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-white flex items-center justify-center rounded-xl border border-slate-100">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{isAdminView ? '지출결의 통합 조회' : '내 지출 신청 내역'}</h2>
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{isAdminView ? 'Corporate Integrated Database' : 'My Personal Request History'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="항목 또는 신청자 검색..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl pl-10 pr-4 py-3 text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {!isAdminView && (
               <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[10px] font-bold text-slate-600 dark:text-slate-300 outline-none" />
                  <span className="text-slate-300 dark:text-slate-600 italic">~</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[10px] font-bold text-slate-600 dark:text-slate-300 outline-none" />
               </div>
            )}
            <button className="w-11 h-11 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 shadow-sm">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-8 py-6 font-black font-sans">지출일자 / 분류</th>
                <th className="px-8 py-6 font-black font-sans tracking-tight">항목명 및 상세</th>
                {isAdminView && <th className="px-8 py-6 font-black font-sans">신청자</th>}
                <th className="px-8 py-6 text-right font-black font-sans">금액 (KRW)</th>
                <th className="px-8 py-6 font-black font-sans">상태</th>
                <th className="px-8 py-6 text-center font-black font-sans uppercase">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredExpenses.length === 0 ? (
                <tr><td colSpan={isAdminView ? 6 : 5} className="py-20 text-center text-slate-300 font-bold italic tracking-widest uppercase">데이터가 없습니다</td></tr>
              ) : (
                filteredExpenses.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <div className="text-xs font-black text-slate-700 uppercase tracking-tight">{item.expense_date}</div>
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold">{item.category}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="max-w-xs md:max-w-md">
                        <p className="text-sm font-black text-slate-900 mb-1">{item.description}</p>
                        <p className="text-[10px] font-medium text-slate-400 line-clamp-1 italic">{item.details || '상세내역 없음'}</p>
                      </div>
                    </td>
                    {isAdminView && (
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-[8px] font-black border border-indigo-100">
                            {item.profiles?.full_name?.[0] || 'U'}
                          </div>
                          <span className="text-xs font-bold text-slate-600">{item.profiles?.full_name}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-8 py-6 text-right font-black text-slate-900 tracking-tight">
                      {Math.floor(item.amount).toLocaleString()}
                    </td>
                    <td className="px-8 py-6">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-8 py-6 text-center">
                      {item.attachment_url ? (
                        <a href={item.attachment_url} target="_blank" rel="noreferrer" className="inline-flex w-8 h-8 items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                          <Paperclip className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-slate-100"><Paperclip className="w-4 h-4 mx-auto" /></span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/30">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase italic">
            TOTAL COUNT: <span className="text-slate-700 tracking-tight">{filteredExpenses.length} Entries Found</span>
          </p>
        </div>
      </div>

      {/* New Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-10 pb-4 flex justify-between items-center border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-sans">New Expense Request</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">지출결의 신규 신청서</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">항목명</label>
                  <input type="text" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="예: 사무용품 구매, 야간 식대 등" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl font-bold text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-sans" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">지출 금액 (KRW)</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl font-bold text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">지출 일자</label>
                  <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl font-bold text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-xs" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">카테고리</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none dark:border dark:border-slate-700 rounded-2xl font-bold text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 appearance-none bg-no-repeat bg-[right_1.5rem_center]">
                    <option className="dark:bg-slate-800">식비</option>
                    <option className="dark:bg-slate-800">교통비</option>
                    <option className="dark:bg-slate-800">사무용품</option>
                    <option className="dark:bg-slate-800">접대비</option>
                    <option className="dark:bg-slate-800">비품/소모품</option>
                    <option className="dark:bg-slate-800">기타</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">상세 내역</label>
                  <span className={`text-[9px] font-black tracking-tighter ${details.length > 1000 ? 'text-rose-500' : 'text-slate-400'}`}>{details.length.toLocaleString()} / 1,000</span>
                </div>
                <textarea 
                  value={details} 
                  onChange={e => setDetails(e.target.value)} 
                  className="w-full p-5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl font-medium text-sm h-32 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 resize-none transition-all"
                  placeholder="지출에 대한 상세 내용을 입력하세요 (1,000자 이내)"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 font-sans">증빙 파일 첨부 (Evidence)</label>
                <div className="relative group">
                  <input 
                    type="file" 
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-3 group-hover:bg-emerald-50 group-hover:border-emerald-200 transition-all">
                    <Upload className="w-5 h-5 text-slate-400 group-hover:text-emerald-500" />
                    <span className="text-xs font-bold text-slate-500 group-hover:text-emerald-600 transition-colors">
                      {file ? file.name : '영수증 등 증빙 서류를 드래그하거나 선택하세요'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-5 text-slate-400 font-black hover:bg-slate-50 rounded-2xl uppercase tracking-widest text-[11px] transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] py-5 bg-emerald-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px] disabled:opacity-50 active:scale-95"
                >
                  {submitting ? 'Processing...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
