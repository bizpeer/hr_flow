'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { Calendar, Download, FileText, Search, TrendingUp, DollarSign, Filter, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ExpenseItem {
  id: string;
  created_at: string;
  category: string;
  description: string;
  amount: number;
  profiles: { full_name: string };
  user_id: string;
}

export default function ExpensesManagement() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const role = (profile?.role || 'member').trim().toLowerCase();
  const isSubAdmin = role === 'sub_admin';

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role === 'system_admin') {
        router.replace('/dashboard/system');
      } else if (profile && !['super_admin', 'admin', 'sub_admin'].includes(profile.role.toLowerCase())) {
        router.replace('/dashboard');
      }
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    const fetchExpenses = async () => {
      if (!profile) return;
      setLoading(true);
      try {
        // 'APPROVED' 상태의 지출결의 내역만 가져오기 (회사 단위 필터링)
        let query = supabase
          .from('expense_requests')
          .select(`
            id, 
            created_at, 
            category, 
            description, 
            amount, 
            user_id, 
            profiles!inner(
              full_name,
              teams:team_id(division_id)
            )
          `)
          .eq('company_id', profile.company_id)
          .eq('status', 'APPROVED');

        // sub_admin은 본인 본부 데이터만
        if (isSubAdmin) {
          query = query.eq('profiles.teams.division_id', (profile as any).division_id);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .gte('created_at', `${startDate}T00:00:00.000Z`)
          .lte('created_at', `${endDate}T23:59:59.999Z`);

        if (error) {
          if (error.code !== '42P01') throw error; // 테이블이 아직 없는 경우 무시 (mock data fallback 가능)
        }
        
        // Mock data for display purposes if DB is empty
        if (!data || data.length === 0) {
          setExpenses([
            { id: '1', created_at: '2026-04-07', category: '비품/소모품', description: '컴퓨터', amount: 2500000, profiles: { full_name: 'insa22' }, user_id: 'u1' },
            { id: '2', created_at: '2026-04-06', category: '식비', description: '회식', amount: 545561, profiles: { full_name: '인사' }, user_id: 'u2' },
            { id: '3', created_at: '2026-04-06', category: '식비/회식대', description: '본부회식비', amount: 555880, profiles: { full_name: '인사' }, user_id: 'u2' },
            { id: '4', created_at: '2026-04-06', category: '비품/소모품', description: '비품', amount: 4500, profiles: { full_name: '인사' }, user_id: 'u2' },
          ]);
        } else {
          setExpenses(data as any);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchExpenses();
  }, [profile?.company_id, startDate, endDate]);

  const filteredExpenses = expenses.filter(e => 
    e.description.includes(searchQuery) || 
    (e.profiles?.full_name || '').includes(searchQuery) ||
    e.category.includes(searchQuery)
  );

  const totalAmount = filteredExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-10 pb-20">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <PieChartIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">지출 분석 대시보드</h1>
            <p className="text-sm text-slate-500 font-medium">전사 지출 데이터를 시각화하고 통합 리포트를 생성합니다.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm">
            <FileText className="w-4 h-4 text-indigo-600" />
            PDF 리포트 출력
          </button>
          <button className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-md">
            <Download className="w-4 h-4" />
            Excel 다운로드
          </button>
        </div>
      </div>

      {/* 2. Total Analysis Banner */}
      <div className="bg-[#0f172a] rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center justify-between shadow-2xl relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full point-events-none" />

        <div className="relative z-10 space-y-3">
          <p className="text-[10px] font-black tracking-[0.2em] text-emerald-400">TOTAL APPROVED</p>
          <div className="flex items-end gap-3">
            <h2 className="text-5xl font-black text-white tracking-tighter">
              {totalAmount.toLocaleString()}
            </h2>
            <span className="text-xl font-black text-emerald-500 mb-1">KRW</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold pt-1">
            <TrendingUp className="w-4 h-4" />
            <span>필터 범위 내 총 지출액</span>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-8 mt-8 md:mt-0">
          <div className="space-y-2">
            <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-center">Analysis Period (Auto 1-Month)</p>
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 px-4 backdrop-blur-sm">
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-slate-300 text-xs font-bold outline-none"
              />
              <span className="text-slate-500">~</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-slate-300 text-xs font-bold outline-none"
              />
            </div>
          </div>
          <div className="hidden md:flex w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl items-center justify-center">
            <DollarSign className="w-8 h-8 text-emerald-500" />
          </div>
        </div>
      </div>

      {/* 3. List View */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        
        {/* List Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-8 border-b border-slate-100/80 gap-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-slate-50 flex items-center justify-center rounded-xl border border-slate-100">
              <FileText className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">승인 완료 내역 통합 조회</h2>
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Real-time Approved Database</p>
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
                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <button className="w-11 h-11 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 shadow-sm">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-50/50">
              <tr className="text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-8 py-6 font-black font-sans w-48">일자 / 분류</th>
                <th className="px-8 py-6 font-black font-sans">지출 및 증빙 항목</th>
                <th className="px-8 py-6 font-black font-sans w-48">신청자 정보</th>
                <th className="px-8 py-6 font-black font-sans w-40 text-right">최종 승인 금액</th>
                <th className="px-8 py-6 font-black font-sans w-20 text-center">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredExpenses.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer">
                  <td className="px-8 py-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(item.created_at).toISOString().split('T')[0]}
                      </div>
                      <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-md text-[10px] font-bold">
                        {item.category}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-sm font-bold text-slate-800">{item.description}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        {(item.profiles?.full_name || '?')[0]}
                      </div>
                      <span className="text-xs font-bold text-slate-600">{item.profiles?.full_name || 'Alumni'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className="text-sm font-black text-slate-900 tracking-tight">
                      {Math.floor(item.amount).toLocaleString()} <span className="text-[10px] text-slate-400 font-bold ml-0.5">원</span>
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <ChevronRight className="w-4 h-4 text-slate-300 mx-auto group-hover:text-emerald-500 transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/30">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
            TOTAL COUNT: <span className="text-slate-700">{filteredExpenses.length} 건</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// 아이콘 
function PieChartIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}
