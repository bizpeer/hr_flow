'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { 
  BarChart3, 
  Printer, 
  Download, 
  Target, 
  Calendar, 
  Layers, 
  TrendingUp, 
  FileText, 
  Search, 
  ArrowUpRight, 
  Plus,
  PlusCircle,
  X,
  PieChart,
  LayoutGrid,
  List,
  CheckCircle,
  XCircle,
  Clock,
  Edit2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { updateRequestFields } from '@/lib/api';

export default function ExpensesDashboard() {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'INSIGHTS' | 'LIST'>('INSIGHTS');
  
  // States for analytics
  const today = new Date();
  const initialStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const initialEnd = format(endOfMonth(today), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('식비');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(today, 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [existingEvidenceUrl, setExistingEvidenceUrl] = useState<string>('');

  const fetchExpenses = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const role = profile.role || 'member';
      const isManagement = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);
      let query = supabase
        .from('expense_requests')
        .select('*, profiles(full_name)');
      
      if (!isManagement) {
        query = query.eq('company_id', profile.company_id);
      }

      const { data, error } = await query.order('date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [profile?.company_id, profile?.role]);

  const openAppModal = (expense?: any) => {
    if (expense) {
      setEditingId(expense.id);
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setDescription(expense.description);
      setDate(expense.date);
      setExistingEvidenceUrl(expense.evidence_url || '');
    } else {
      setEditingId(null);
      setAmount('');
      setCategory('식비');
      setDescription('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setExistingEvidenceUrl('');
    }
    setEvidenceFile(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    setSubmitting(true);
    try {
      let evidenceUrl = existingEvidenceUrl;
      
      // 1. 파일 업로드 (새 파일이 있을 경우 덮어쓰기)
      if (evidenceFile) {
        const fileExt = evidenceFile.name.split('.').pop();
        const fileName = `${profile.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('expense-evidence')
          .upload(fileName, evidenceFile);
          
        if (uploadError) throw new Error('증빙 서류 업로드 실패: ' + uploadError.message);
        evidenceUrl = fileName;
      }

      // 2. 요청 제출 (수정 vs 생성)
      if (editingId) {
        await updateRequestFields('expense', editingId, {
          amount: Number(amount),
          category,
          description,
          title: description.substring(0, 20),
          date,
          evidence_url: evidenceUrl
        });
      } else {
        const { error } = await supabase
          .from('expense_requests')
          .insert([{
            amount: Number(amount),
            category,
            description,
            title: description.substring(0, 20),
            date,
            status: 'PENDING',
            user_id: profile.id,
            user_name: profile.full_name,
            company_id: profile.company_id,
            evidence_url: evidenceUrl
          }]);

        if (error) throw error;
      }
      
      setShowModal(false);
      setAmount('');
      setDescription('');
      setEvidenceFile(null);
      fetchExpenses();
    } catch (error: any) {
      alert('신청 실패: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    const nameMatch = (e.profiles?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = (e.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const dateMatch = e.date >= startDate && e.date <= endDate;
    
    // Non-admin can only see their own
    const role = profile?.role || 'member';
    const isManagement = ['super_admin', 'admin', 'sub_admin'].includes(role);
    const ownershipMatch = isManagement || e.user_id === profile?.id;
    
    return dateMatch && (nameMatch || descMatch) && ownershipMatch;
  });

  const approvedExpenses = filteredExpenses.filter(e => e.status === 'APPROVED');
  const totalAmount = approvedExpenses.reduce((sum, curr) => sum + Number(curr.amount || 0), 0);
  const avgAmount = approvedExpenses.length > 0 ? totalAmount / approvedExpenses.length : 0;
  const maxExpense = approvedExpenses.length > 0 ? Math.max(...approvedExpenses.map(e => Number(e.amount))) : 0;

  const handleExportExcel = () => {
    if (filteredExpenses.length === 0) return alert("데이터가 없습니다.");
    const headers = ["일자", "분류", "내용", "신청자", "금액"];
    const csvContent = [
      headers.join(","),
      ...filteredExpenses.map(e => [e.date, e.category, `"${e.description}"`, e.profiles?.full_name, e.amount].join(","))
    ].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `지출내역_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  const role = profile?.role || 'member';
  const isManagement = ['super_admin', 'admin', 'sub_admin'].includes(role);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">지출 내역을 분석하고 있습니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 print:hidden">
        <div className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-emerald-600 rounded-[2rem] text-white flex items-center justify-center shadow-2xl shadow-emerald-600/30">
              <BarChart3 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Spending Insights</h1>
              <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Expenditure Intelligence Dashboard
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
           <button 
            onClick={() => openAppModal()}
            className="flex items-center gap-4 px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px]"
           >
              <PlusCircle className="w-5 h-5" />
              <span>New Request</span>
           </button>
           <button 
            onClick={handleExportExcel}
            className="flex items-center gap-4 px-8 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-2xl hover:bg-emerald-600 transition-all uppercase tracking-widest text-[11px]"
           >
              <Download className="w-5 h-5" />
              <span>Export CSV</span>
           </button>
        </div>
      </div>

      {/* Analytics (Admin Only) */}
      {isManagement && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 bg-slate-900 rounded-[3.5rem] p-10 md:p-14 shadow-2xl relative overflow-hidden group border-none">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full -mr-48 -mt-48 blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
              <div className="relative z-10 flex flex-col md:flex-row justify-between gap-12">
                 <div className="space-y-8 flex-1">
                    <div className="space-y-2">
                       <p className="text-emerald-400 font-black uppercase tracking-[0.3em] text-[10px] flex items-center gap-3">
                          <Target className="w-4 h-4" /> Company Spending
                       </p>
                       <div className="flex items-baseline gap-4 text-white">
                          <h2 className="text-5xl md:text-7xl font-black tracking-tighter italic">
                             {totalAmount.toLocaleString()}
                          </h2>
                          <span className="text-emerald-500 font-black text-2xl tracking-widest">KRW</span>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <AnalyticBox label="Avg Trans." value={`₩ ${Math.round(avgAmount).toLocaleString()}`} />
                       <AnalyticBox label="Peak Exp." value={`₩ ${maxExpense.toLocaleString()}`} highlight />
                    </div>
                 </div>

                 <div className="w-full md:w-80 space-y-4 print:hidden">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-2">Period Precision</p>
                    <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 space-y-5">
                       <DateInput label="Start" value={startDate} onChange={setStartDate} />
                       <DateInput label="End" value={endDate} onChange={setEndDate} />
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[3.5rem] p-10 flex flex-col justify-between border border-slate-100 shadow-xl group overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-all">
                 <Layers className="w-32 h-32" />
              </div>
              <div className="space-y-6 relative z-10">
                 <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                    <TrendingUp className="w-7 h-7" />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase mb-1">Approved Pulse</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Successful transactions</p>
                 </div>
              </div>
              <div className="space-y-4 pt-10 relative z-10">
                 <div className="flex items-center justify-between text-sm font-black text-slate-700">
                    <span className="uppercase tracking-widest text-[10px]">Filter Match</span>
                    <span className="text-2xl tracking-tighter italic">{filteredExpenses.length} <span className="text-xs opacity-30 not-italic">Items</span></span>
                 </div>
                 <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                    <div className="h-full bg-indigo-500 w-[78%] animate-pulse" />
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* List Search */}
      <div className="bg-white rounded-[3.5rem] border border-slate-100 overflow-hidden shadow-sm group">
        <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-slate-900 text-emerald-400 rounded-3xl flex items-center justify-center shadow-xl">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Archives</h2>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Transaction Ledger</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 print:hidden">
            <div className="relative">
              <input 
                type="text" 
                placeholder="SEARCH ITEM OR NAME..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-14 pr-6 py-4.5 bg-slate-50 border border-slate-100 rounded-[2rem] focus:border-emerald-500 focus:bg-white outline-none transition-all font-black text-xs text-slate-900 w-full md:w-80 shadow-inner tracking-widest"
              />
              <Search className="w-5 h-5 text-slate-300 absolute left-5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/30">
                <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Timeline / Category</th>
                <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Description</th>
                <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">Applicant</th>
                <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 text-center">Status</th>
                <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 text-right">Value (KRW)</th>
                <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredExpenses.map((e) => (
                <tr key={e.id} className="hover:bg-indigo-50/20 transition-all group/row">
                  <td className="px-10 py-7">
                    <div className="space-y-1">
                       <p className="text-xs font-black text-slate-400 italic">{e.date}</p>
                       <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase ${e.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                         {e.category}
                       </span>
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <span className="text-sm font-black text-slate-800 tracking-tight">{e.description}</span>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                          {e.profiles?.full_name?.[0]}
                       </div>
                       <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{e.profiles?.full_name}</span>
                    </div>
                  </td>
                  <td className="px-10 py-7 text-center">
                    <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase border flex items-center justify-center gap-2 mx-auto w-fit ${
                      e.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      e.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                      'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                      {e.status === 'APPROVED' ? <CheckCircle className="w-3 h-3" /> : e.status === 'REJECTED' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {e.status}
                    </span>
                  </td>
                  <td className="px-10 py-7 text-right text-lg font-black text-slate-900 tracking-tighter italic">
                    ₩ {Number(e.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-10 py-7 text-right">
                    {(e.status === 'PENDING' || e.status === 'SUB_APPROVED') && (profile?.id === e.user_id || ['super_admin','admin'].includes(profile?.role || '')) && (
                      <button 
                        onClick={() => openAppModal(e)}
                        className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all ml-auto opacity-0 group-hover/row:opacity-100 shadow-sm"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-slate-300 font-bold uppercase text-xs italic tracking-widest">No matching records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 pb-6 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">New Request</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (KRW)</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-lg outline-none focus:ring-4 focus:ring-indigo-100"
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <select 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100 appearance-none"
                  >
                    <option>식비</option>
                    <option>교통비</option>
                    <option>기획/전산</option>
                    <option>비품기구</option>
                    <option>기타</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Evidence Attachment (Option)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-100"
                    accept="image/*,application/pdf"
                  />
                  {evidenceFile && (
                    <p className="mt-2 text-[10px] font-bold text-emerald-600 ml-1 italic">
                      ✓ {evidenceFile.name} 선택됨
                    </p>
                  )}
                </div>
              </div>
              <button 
                type="submit" 
                disabled={submitting}
                className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px]"
              >
                {submitting ? 'Submitting...' : 'Submit 지출결의'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Inline Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .print\\:hidden, button, select, input { display: none !important; }
        }
      `}} />
    </div>
  );
}

function AnalyticBox({ label, value, highlight = false }: any) {
  return (
    <div className="bg-white/5 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 space-y-2">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-black tracking-tighter italic ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function DateInput({ label, value, onChange }: any) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{label} Point</span>
      <div className="relative">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
        <input 
          type="date" 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-800 text-white font-black text-xs p-3.5 pl-10 rounded-xl border border-slate-700 outline-none focus:border-emerald-500 appearance-none"
        />
      </div>
    </div>
  );
}
