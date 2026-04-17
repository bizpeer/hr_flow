'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { 
  Calendar, Download, FileText, Search, TrendingUp, 
  DollarSign, Filter, ChevronRight, Plus, Upload, 
  X, CheckCircle, Clock, AlertCircle, Paperclip, XCircle,
  MoreVertical, CalendarDays
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ExpenseRequest, submitApproval } from '@/lib/api';
import { format, startOfMonth, endOfMonth, parseISO, isSameMonth } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function ExpensesManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('식비');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const role = (profile?.role || 'member').trim().toLowerCase();
  const isAdminView = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);
  const isSubAdmin = role === 'sub_admin';

  const fetchExpenses = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('expense_requests')
        .select('*, profiles(full_name, team_id)');
      
      if (isAdminView) {
        query = query.eq('company_id', profile.company_id);
      } else {
        query = query.eq('user_id', profile.id);
      }

      if (selectedMonth) {
        const start = `${selectedMonth}-01`;
        const end = format(endOfMonth(parseISO(`${selectedMonth}-01`)), 'yyyy-MM-dd');
        query = query.gte('expense_date', start).lte('expense_date', end);
      }

      const { data, error } = await query
        .order('status', { ascending: false })
        .order('expense_date', { ascending: false });

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
          finalData = finalData.filter(req => !req.profiles || validTeamIds.includes(req.profiles.team_id));
        }
      }

      setExpenses(finalData);
    } catch (err) {
      console.error('Fetch expenses error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) {
      fetchExpenses();

      const channel = supabase
        .channel('expense-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'expense_requests',
            filter: profile.company_id ? `company_id=eq.${profile.company_id}` : undefined
          },
          () => fetchExpenses()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile, authLoading, selectedMonth]);

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

      const title = `지출결의 - ${category} (${itemName})`;
      const detailsData: ExpenseRequest = {
        amount: Number(amount),
        category: category,
        description: itemName, // itemName을 description으로 사용
        expense_date: expenseDate,
        details: details,
        attachment_url: attachment_url || undefined,
        status: 'PENDING',
        user_id: profile.id,
        company_id: profile.company_id
      };

      // api.ts의 submitApproval 함수 사용
      await submitApproval(
        profile.company_id,
        'expense',
        profile.id,
        title,
        detailsData
      );
      
      alert('지출 결의가 상신되었습니다.');
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
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setCategory('식비');
    setDetails('');
    setFile(null);
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => 
      (e.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (e.profiles?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.category || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  const totalAmount = useMemo(() => {
    return filteredExpenses
      .filter(e => e.status === 'APPROVED')
      .reduce((sum, item) => sum + Number(item.amount), 0);
  }, [filteredExpenses]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': 
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100 flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> 승인됨</span>;
      case 'SUB_APPROVED': 
        return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> 1차승인</span>;
      case 'REJECTED': 
        return <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black border border-rose-100 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> 반려됨</span>;
      default: 
        return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black border border-amber-100 flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> 대기중</span>;
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20 px-4 md:px-0">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isAdminView ? '지출 분석 및 조회' : '지출결의 신청'}
            </h1>
            <p className="text-sm text-slate-500 font-medium tracking-tight">
              {isAdminView ? '전사 지출 데이터를 분석하고 승인 내역을 조회합니다.' : '항목별 지출을 신청하고 처리 상태를 확인합니다.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isAdminView && (
            <button 
              onClick={() => setShowModal(true)}
              className="px-8 py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg active:scale-95 text-sm"
            >
              <Plus className="w-5 h-5" />
              신청하기
            </button>
          )}
          {isAdminView && (
            <button className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-black transition-colors shadow-md text-[11px] uppercase tracking-widest">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* 2. Stats & Filter Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-[#0f172a] rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between shadow-xl relative overflow-hidden ring-1 ring-white/10">
          <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 space-y-1 text-center md:text-left">
            <p className="text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase">Analysis Summary ({selectedMonth})</p>
            <div className="flex items-end justify-center md:justify-start gap-2 text-white">
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
                {totalAmount.toLocaleString()}
              </h2>
              <span className="text-sm font-black text-emerald-500 mb-1.5 uppercase">KRW (Approved)</span>
            </div>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 mt-6 md:mt-0 w-full md:w-auto">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 px-4 backdrop-blur-sm w-full">
              <CalendarDays className="w-4 h-4 text-emerald-400" />
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={e => setSelectedMonth(e.target.value)} 
                className="bg-transparent text-slate-300 text-xs font-bold outline-none flex-1" 
              />
              {selectedMonth && (
                <button 
                  onClick={() => setSelectedMonth('')} 
                  className="text-[10px] bg-white/10 px-2 py-1 rounded text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold transition-all"
                >
                  전체
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm flex flex-col justify-center gap-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Entries</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{filteredExpenses.length}</h3>
            <span className="text-xs font-bold text-emerald-600 mb-1">Items Found</span>
          </div>
        </div>
      </div>

      {/* 3. Search Bar */}
      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
        <input 
          type="text" 
          placeholder="항목, 신청자 또는 카테고리 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-100 rounded-2xl pl-14 pr-6 py-4 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500/20 shadow-sm transition-all"
        />
      </div>

      {/* 4. List View (Responsive) */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border border-slate-100">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-4"></div>
            <p className="text-sm font-bold text-slate-400 animate-pulse uppercase tracking-widest">Loading Records...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[2.5rem] border border-slate-100 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
              <Search className="w-10 h-10 text-slate-200" />
            </div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">조회 결과가 없습니다.</h3>
            <p className="text-sm text-slate-400 mt-1 font-medium italic mb-6">
              {selectedMonth ? `${selectedMonth} 기간에 데이터가 없습니다.` : '등록된 데이터가 없습니다.'}
            </p>
            {selectedMonth && (
              <button 
                onClick={() => setSelectedMonth('')}
                className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black transition-all"
              >
                전체 기간 조회하기
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-6">일자 / 분류</th>
                    <th className="px-8 py-6">항목명</th>
                    {isAdminView && <th className="px-8 py-6">신청자</th>}
                    <th className="px-8 py-6 text-right">금액 (KRW)</th>
                    <th className="px-8 py-6">상태</th>
                    <th className="px-8 py-6 text-center">증빙</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[13px]">
                  {filteredExpenses.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group cursor-default">
                      <td className="px-8 py-6">
                        <div className="space-y-1">
                          <div className="font-black text-slate-800">{item.expense_date}</div>
                          <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-bold uppercase tracking-wider">{item.category}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="max-w-md">
                          <p className="font-black text-slate-900 mb-0.5">{item.description}</p>
                          <p className="text-[11px] font-medium text-slate-400 line-clamp-1 italic">{item.details || 'No details provided'}</p>
                        </div>
                      </td>
                      {isAdminView && (
                        <td className="px-8 py-6 text-slate-600 font-bold">
                          {item.profiles?.full_name}
                        </td>
                      )}
                      <td className="px-8 py-6 text-right font-black text-slate-900 tracking-tight">
                        {Math.floor(item.amount).toLocaleString()}
                      </td>
                      <td className="px-8 py-6">
                        {getStatusBadge(item.status || 'PENDING')}
                      </td>
                      <td className="px-8 py-6 text-center">
                        {item.attachment_url ? (
                          <a href={item.attachment_url} target="_blank" rel="noreferrer" className="inline-flex w-8 h-8 items-center justify-center bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all">
                            <Paperclip className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-slate-200"><Paperclip className="w-4 h-4 mx-auto" /></span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4 px-2">
              {filteredExpenses.map(item => (
                <div key={item.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black tracking-widest uppercase">{item.category}</span>
                        <span className="text-[11px] font-bold text-slate-400">{item.expense_date}</span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">{item.description}</h3>
                    </div>
                    {getStatusBadge(item.status || 'PENDING')}
                  </div>

                  <div className="flex items-end justify-between border-t border-slate-50 pt-4 mt-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                      <p className="text-xl font-black text-slate-900 tracking-tighter">{Math.floor(item.amount).toLocaleString()} <span className="text-xs">KRW</span></p>
                    </div>
                    {item.attachment_url && (
                      <a href={item.attachment_url} target="_blank" rel="noreferrer" className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                        <Paperclip className="w-5 h-5" />
                      </a>
                    )}
                  </div>
                  
                  {isAdminView && item.profiles && (
                    <div className="bg-slate-50 rounded-2xl p-3 px-4 flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-indigo-500 border border-slate-100 uppercase">
                        {item.profiles.full_name[0]}
                      </div>
                      <span className="text-xs font-bold text-slate-600">{item.profiles.full_name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 5. Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-10 flex justify-between items-center border-b border-slate-50 bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">New Expense</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">지출결의 신청서 작성</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">카테고리</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value)} 
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option>식비</option>
                    <option>교통비</option>
                    <option>사무용품</option>
                    <option>접대비</option>
                    <option>비품/소모품</option>
                    <option>기타</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">지출 일자</label>
                  <input 
                    type="date" 
                    value={expenseDate} 
                    onChange={e => setExpenseDate(e.target.value)} 
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20" 
                    required 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">지출 항목명</label>
                <input 
                  type="text" 
                  value={itemName} 
                  onChange={e => setItemName(e.target.value)} 
                  placeholder="지출 내용을 간략히 입력하세요" 
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-sans" 
                  required 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">금액 (KRW)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    placeholder="0" 
                    className="w-full pl-5 pr-14 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono" 
                    required 
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">WON</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">상세 내역 (Optional)</label>
                <textarea 
                  value={details} 
                  onChange={e => setDetails(e.target.value)} 
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-medium text-sm text-slate-900 h-24 outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none transition-all"
                  placeholder="부연 설명이 필요한 경우 입력하세요"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">증빙 이미지/파일 (Evidence)</label>
                <div className="relative group">
                  <input 
                    type="file" 
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-2 group-hover:bg-emerald-50 group-hover:border-emerald-200 transition-all">
                    <Upload className="w-6 h-6 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                    <span className="text-xs font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">
                      {file ? file.name : '증빙 서류를 업로드하세요'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-50">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 text-slate-400 font-black hover:bg-slate-50 rounded-2xl uppercase tracking-widest text-[11px] transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-200 hover:bg-slate-900 hover:shadow-none transition-all uppercase tracking-widest text-[11px] disabled:opacity-50 active:scale-95"
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
