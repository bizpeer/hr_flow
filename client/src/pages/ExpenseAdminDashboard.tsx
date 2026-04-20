import React, { useState, useEffect } from 'react';
import { 
  PieChart, DollarSign, Calendar, Filter, Printer, ChevronRight, 
  TrendingUp, Download, Search, FileText, Loader2, CheckCircle
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format, addMonths, startOfMonth, parseISO } from 'date-fns';
import { useAuthStore } from '../store/authStore';

interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  applicant: string;
  userName?: string; // AdminApprovals와 일관성을 위해 추가
}

export const ExpenseAdminDashboard: React.FC = () => {
  const { userData } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 초기 날짜 설정: 이번 달 1일 ~ 다음 달 1일 (자동 1개월 범위)
  const initialStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const initialEnd = format(addMonths(parseISO(initialStart), 1), 'yyyy-MM-dd');
  
  const [startDate, setStartDate] = useState<string>(initialStart);
  const [endDate, setEndDate] = useState<string>(initialEnd);

  // Firestore 실시간 데이터 패칭 (companyId 기반 격리)
  useEffect(() => {
    if (!userData?.companyId) return;
    setLoading(true);
    const q = query(
      collection(db, 'expenses'),
      where('status', '==', 'APPROVED'),
      where('companyId', '==', userData.companyId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const expenseData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];
      
      const sortedData = expenseData.sort((a, b) => b.date.localeCompare(a.date));
      
      setExpenses(sortedData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userData?.companyId]);

  // 시작 날짜 변경 시 종료 날짜 자동 1개월 뒤로 설정
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setStartDate(newStart);
    
    // 1개월 뒤 날짜 자동 계산
    try {
      const nextMonth = addMonths(parseISO(newStart), 1);
      setEndDate(format(nextMonth, 'yyyy-MM-dd'));
    } catch (err) {
      console.error("Date Calculation Error:", err);
    }
  };

  const filteredExpenses = expenses.filter((expense) => {
    const expenseDate = expense.date;
    return expenseDate >= startDate && expenseDate <= endDate;
  });

  const totalAmount = filteredExpenses.reduce((sum, curr) => sum + Number(curr.amount || 0), 0);

  // 엑셀 다운로드 기능 (CSV 기반)
  const handleExportExcel = () => {
    if (filteredExpenses.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }

    // CSV 헤더 및 데이터 구성
    const headers = ["일자", "분류", "지출항목", "신청자", "금액(원)"];
    const csvContent = [
      headers.join(","),
      ...filteredExpenses.map(e => [
        e.date,
        e.category,
        `"${e.title.replace(/"/g, '""')}"`,
        e.userName || e.applicant,
        e.amount
      ].join(","))
    ].join("\n");

    // 한글 깨짐 방지를 위한 BOM(Byte Order Mark) 추가
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `지출결의내역_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-black tracking-tight text-lg">지출 통계 엔진 가동 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 print:hidden">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-600 rounded-2xl text-white shadow-xl shadow-emerald-100">
                <PieChart className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">지출 분석 대시보드</h1>
            </div>
            <p className="text-slate-500 font-medium tracking-tight">전사 지출 데이터를 시각화하고 통합 리포트를 생성합니다.</p>
          </div>

          <div className="flex items-center gap-3">
             <button 
              onClick={() => window.print()}
              className="flex items-center gap-2.5 px-6 py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl shadow-xl shadow-slate-100 hover:bg-slate-50 transition-all active:scale-95 shrink-0"
             >
                <Printer className="w-5 h-5 text-indigo-500" />
                <span>PDF 리포트 출력</span>
             </button>
             <button 
               onClick={handleExportExcel}
               className="flex items-center gap-2.5 px-6 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 shrink-0"
             >
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">Excel 다운로드</span>
             </button>
          </div>
        </div>

        {/* Analytics Summary Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
           {/* Total Spending Card (Large) */}
           <div className="md:col-span-2 lg:col-span-2 bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group border border-slate-800">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
              <div className="relative z-10 flex flex-col justify-between h-full space-y-8">
                 <div className="space-y-4">
                    <p className="text-emerald-400 font-black uppercase tracking-[0.2em] text-[10px]">Total Period Spending</p>
                    <div className="flex items-baseline gap-2">
                       <h2 className="text-5xl font-black tracking-tight">
                          {totalAmount.toLocaleString()}
                       </h2>
                       <span className="text-emerald-500 font-black text-xl italic">KRW</span>
                    </div>
                 </div>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-500/80 text-xs font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                       <TrendingUp className="w-4 h-4" />
                       <span>분석 범위 내 실시간 지출액</span>
                    </div>
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-white/5">
                       <DollarSign className="w-6 h-6" />
                    </div>
                 </div>
              </div>
           </div>

           {/* Date Range Selector Card */}
           <div className="lg:col-span-1 bg-white rounded-[3rem] p-10 border border-slate-100 shadow-xl flex flex-col justify-between group">
              <div className="space-y-4">
                 <p className="text-indigo-600 font-black uppercase tracking-widest text-[10px]">Analysis Period</p>
                 <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:border-indigo-100 transition-all">
                       <Calendar className="w-4 h-4 text-indigo-400" />
                       <input 
                         type="date" 
                         value={startDate}
                         onChange={handleStartDateChange}
                         className="bg-transparent text-slate-700 font-black text-xs outline-none cursor-pointer flex-1"
                       />
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:border-indigo-100 transition-all">
                       <Calendar className="w-4 h-4 text-slate-300" />
                       <input 
                         type="date" 
                         value={endDate}
                         onChange={(e) => setEndDate(e.target.value)}
                         className="bg-transparent text-slate-600 font-black text-xs outline-none cursor-pointer flex-1"
                       />
                    </div>
                 </div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-4 italic">시작일 선택 시 자동 1개월 설정</p>
           </div>

           {/* Quick Stats Card */}
           <div className="bg-indigo-600 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/50 to-indigo-700/50"></div>
              <div className="relative z-10 flex flex-col justify-between h-full">
                 <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">Items Count</p>
                 <div className="text-5xl font-black italic tracking-tighter">
                    {filteredExpenses.length}
                    <span className="text-sm opacity-40 ml-2 not-italic">CASES</span>
                 </div>
                 <div className="mt-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Verified Database</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Detailed List Section */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 print:pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">승인 완료 내역 통합 조회</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Real-time Approved Database</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 print:hidden">
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="항목 또는 신청자 검색..." 
                  className="pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-bold text-xs text-slate-700 w-64 shadow-inner"
                />
                <Search className="w-4 h-4 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <button className="p-3.5 bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all border border-slate-100">
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">일자 / 분류</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">지출 및 증빙 항목</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">신청자 정보</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">최종 금액</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right print:hidden">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-slate-50/80 transition-all group duration-300">
                      <td className="px-8 py-5">
                        <div className="space-y-1.5">
                           <div className="flex items-center gap-1.5 text-xs font-black text-slate-400 italic">
                              <Calendar className="w-3.5 h-3.5" />
                              {expense.date}
                           </div>
                           <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black tracking-widest uppercase border border-emerald-100">
                             {expense.category}
                           </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                         <span className="text-sm font-black text-slate-800 group-hover:text-emerald-600 transition-colors">
                           {expense.title}
                         </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                           <div className="w-9 h-9 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-400 shadow-sm group-hover:rotate-6 transition-transform">
                              {expense.userName?.charAt(0) || expense.applicant?.charAt(0) || 'U'}
                           </div>
                           <span className="text-xs font-black text-slate-700">{expense.userName || expense.applicant}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="space-y-0.5">
                           <span className="text-base font-black text-slate-900 tracking-tighter italic">
                             {Number(expense.amount || 0).toLocaleString()} <span className="text-[10px] text-slate-400 ml-0.5 uppercase">KRW</span>
                           </span>
                           <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-end gap-1">
                              <CheckCircle className="w-2.5 h-2.5" /> Approved
                           </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right print:hidden">
                        <button className="p-3 bg-white border border-slate-100 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 rounded-2xl transition-all shadow-sm">
                           <ChevronRight className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-32 text-center">
                       <FileText className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                       <p className="text-slate-400 font-black tracking-tight text-lg">해당 기간 내 승인된 내역이 없습니다.</p>
                       <p className="text-slate-300 text-sm font-medium mt-1">필터 조건을 변경하거나 실제 승인된 데이터여부를 확인하세요.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Count:</span>
                <span className="text-xs font-black text-slate-900">{filteredExpenses.length} 건</span>
             </div>
             <p className="text-[10px] text-slate-300 font-bold italic print:block hidden">이 리포트는 Stitch HR 시스템에 의해 실시간 생성되었습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
