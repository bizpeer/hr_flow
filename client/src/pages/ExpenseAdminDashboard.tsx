import React, { useState, useEffect } from 'react';
import { 
  PieChart, DollarSign, Calendar, Printer,
  TrendingUp, Download, FileText, Loader2, CheckCircle, FolderArchive
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format, addMonths, startOfMonth, parseISO } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { attachmentSessionKey, downloadCompanyAttachment } from '../services/attachmentService';
import './ExpenseAdminDashboard.css';

interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  applicant: string;
  userName?: string;
  attachmentUrl?: string;
  attachmentPath?: string;
  attachmentName?: string;
}

export const ExpenseAdminDashboard: React.FC = () => {
  const { userData, loading: authLoading } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [zipLoading, setZipLoading] = useState(false);
  
  // 초기 날짜 설정: 이번 달 1일 ~ 다음 달 1일 (자동 1개월 범위)
  const initialStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const initialEnd = format(addMonths(parseISO(initialStart), 1), 'yyyy-MM-dd');
  
  const [startDate, setStartDate] = useState<string>(initialStart);
  const [endDate, setEndDate] = useState<string>(initialEnd);

  // Firestore 실시간 데이터 패칭 (companyId 기반 격리)
  useEffect(() => {
    if (authLoading || !userData?.companyId) return;
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
  }, [userData?.companyId, authLoading]);

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

  // 영수증 이미지 일괄 ZIP 다운로드 기능
  const handleDownloadReceiptsZip = async () => {
    const itemsWithReceipt = filteredExpenses.filter(e => e.attachmentPath || e.attachmentUrl);
    
    if (itemsWithReceipt.length === 0) {
      alert("선택한 날짜 범위 내에 첨부된 영수증이 없습니다.");
      return;
    }

    if (!window.confirm(`총 ${itemsWithReceipt.length}개의 영수증 파일을 날짜별로 압축하여 다운로드하시겠습니까?`)) {
      return;
    }

    setZipLoading(true);
    const scope = attachmentSessionKey();
    let included = 0;
    let failed = 0;

    try {
      const { default: JSZip } = await import('jszip').catch(() => {
        throw new Error('압축 도구를 불러오지 못했습니다. 연결을 확인하고 화면을 새로고침한 뒤 다시 시도해 주세요.');
      });
      if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
      const zip = new JSZip();
      for (const item of itemsWithReceipt) {
        try {
          const { blob } = await downloadCompanyAttachment('expenses', item.id);
          
          // 폴더 구조: 연-월 (예: 2026-06)
          const folderName = item.date.substring(0, 7);
          
          // 파일명 다듬기: 2026-06-30_지출명_원본파일명
          const sanitizedTitle = item.title.replace(/[/\\?%*:|"<>]/g, '_');
          const ext = item.attachmentName?.match(/\.[a-z0-9]{1,5}$/i)?.[0] || (blob.type === 'application/pdf' ? '.pdf' : '.jpg');
          const fileName = `${item.date}_${sanitizedTitle}_${item.id}${ext}`;
          
          zip.folder(folderName)?.file(fileName, blob);
          included++;
        } catch {
          if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
          failed++;
        }
      }
      if (!included) throw new Error('영수증에 접근할 수 없습니다. 권한과 네트워크 연결을 확인해 주세요.');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `영수증백업_${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (failed) alert(`${included}개 영수증을 저장했습니다. ${failed}개는 접근 권한 또는 연결 문제로 제외되었습니다.`);
    } catch (error: unknown) {
      alert("압축 파일 생성 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : '다시 시도해 주세요.'));
    } finally {
      setZipLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="finance-screen finance-loading flex-1 flex items-center justify-center bg-slate-50 min-h-screen" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" aria-hidden="true" />
          <p className="text-slate-500 font-black tracking-tight text-lg">지출 내역을 불러오고 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="finance-screen flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="finance-content max-w-7xl mx-auto space-y-10">
        
        {/* Page Header */}
        <div className="finance-header flex flex-col lg:flex-row lg:items-end justify-between gap-6 print:hidden">
          <div className="finance-heading space-y-2">
            <div className="flex items-center gap-3">
              <div className="finance-heading-icon p-2.5 bg-emerald-600 rounded-2xl text-white shadow-xl shadow-emerald-100">
                <PieChart className="w-6 h-6" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">지출결의 조회</h1>
            </div>
            <p className="text-slate-500 font-medium tracking-tight">승인된 지출 내역을 기간별로 확인하고 리포트와 증빙을 내려받으세요.</p>
          </div>

          <div className="finance-actions flex flex-wrap items-center gap-3">
             <button 
               onClick={handleDownloadReceiptsZip}
               disabled={zipLoading}
               type="button" aria-busy={zipLoading}
               className="finance-button finance-button-primary flex items-center gap-2.5 px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 shrink-0 disabled:opacity-50"
             >
                {zipLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : (
                  <FolderArchive className="w-5 h-5" aria-hidden="true" />
                )}
                <span>{zipLoading ? '영수증 압축 중...' : '영수증 ZIP 다운로드'}</span>
             </button>
             <button 
              onClick={() => window.print()}
              type="button"
              className="finance-button flex items-center gap-2.5 px-6 py-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl shadow-xl shadow-slate-100 hover:bg-slate-50 transition-all active:scale-95 shrink-0"
             >
                <Printer className="w-5 h-5 text-slate-500" aria-hidden="true" />
                <span>PDF 리포트 출력</span>
             </button>
             <button 
                onClick={handleExportExcel}
                type="button"
                className="finance-button flex items-center gap-2.5 px-6 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 shrink-0"
             >
                <Download className="w-5 h-5" aria-hidden="true" />
                <span>Excel 다운로드</span>
             </button>
          </div>
        </div>

        {/* Analytics Summary Bento Grid */}
        <div className="finance-summary grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
           {/* Total Spending Card (Large) */}
           <div className="finance-total md:col-span-2 lg:col-span-2 bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group border border-slate-800">
              <div className="finance-decoration absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
              <div className="finance-total-content relative z-10 flex flex-col justify-between h-full space-y-8">
                 <div className="finance-metric space-y-4">
                    <p className="finance-metric-label text-emerald-400 font-black uppercase tracking-[0.2em] text-[10px]">조회 기간 총 지출액</p>
                    <div className="finance-amount flex items-baseline gap-2">
                       <h2 className="text-5xl font-black tracking-tight" aria-label={`총 지출액 ${totalAmount.toLocaleString()}원`}>
                          {totalAmount.toLocaleString()}
                       </h2>
                       <span className="text-emerald-500 font-black text-xl italic" aria-hidden="true">원</span>
                    </div>
                 </div>
                 <div className="finance-metric-footer flex items-center justify-between">
                    <div className="finance-metric-note flex items-center gap-2 text-emerald-500/80 text-xs font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                       <TrendingUp className="w-4 h-4" aria-hidden="true" />
                       <span>승인 완료된 지출 기준</span>
                    </div>
                    <div className="finance-metric-icon w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-white/5">
                       <DollarSign className="w-6 h-6" aria-hidden="true" />
                    </div>
                 </div>
              </div>
           </div>

           {/* Date Range Selector Card */}
           <div className="finance-period lg:col-span-1 bg-white rounded-[3rem] p-10 border border-slate-100 shadow-xl flex flex-col justify-between group">
              <div className="finance-period-content space-y-4">
                 <p className="finance-metric-label text-indigo-600 font-black uppercase tracking-widest text-[10px]">조회 기간</p>
                 <div className="finance-date-range space-y-3">
                   <div className="finance-date-field">
                    <label htmlFor="finance-start-date" className="finance-date-label print:hidden">시작일</label>
                    <div className="finance-date-control flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:border-indigo-100 transition-all">
                       <Calendar className="w-4 h-4 text-indigo-400" aria-hidden="true" />
                       <input 
                         type="date" 
                         id="finance-start-date" aria-describedby="finance-period-help"
                         value={startDate}
                         onChange={handleStartDateChange}
                         className="bg-transparent text-slate-700 font-black text-xs outline-none cursor-pointer flex-1"
                       />
                    </div>
                   </div>
                   <div className="finance-date-field">
                    <label htmlFor="finance-end-date" className="finance-date-label print:hidden">종료일</label>
                    <div className="finance-date-control flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:border-indigo-100 transition-all">
                       <Calendar className="w-4 h-4 text-slate-300" aria-hidden="true" />
                       <input 
                         type="date" 
                         id="finance-end-date" aria-describedby="finance-period-help"
                         value={endDate}
                         onChange={(e) => setEndDate(e.target.value)}
                         className="bg-transparent text-slate-600 font-black text-xs outline-none cursor-pointer flex-1"
                       />
                    </div>
                   </div>
                 </div>
              </div>
              <p id="finance-period-help" className="finance-period-help text-[10px] text-slate-400 font-bold mt-4 italic">시작일을 선택하면 종료일이 1개월 뒤로 설정됩니다.</p>
           </div>

           {/* Quick Stats Card */}
           <div className="finance-count bg-indigo-600 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
              <div className="finance-decoration absolute inset-0 bg-gradient-to-br from-indigo-500/50 to-indigo-700/50"></div>
              <div className="finance-count-content relative z-10 flex flex-col justify-between h-full">
                 <p className="finance-metric-label text-white/40 font-black uppercase tracking-widest text-[10px]">승인 지출 건수</p>
                 <div className="finance-count-value text-5xl font-black italic tracking-tighter">
                    {filteredExpenses.length}
                    <span className="text-sm opacity-40 ml-2 not-italic">건</span>
                 </div>
                 <div className="finance-count-note mt-4 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">조회 기간 내 승인 완료</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Detailed List Section */}
        <div className="finance-list bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="finance-list-header p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 print:pb-4">
            <div className="flex items-center gap-3">
              <div className="finance-list-icon p-2 bg-slate-50 text-slate-600 rounded-xl">
                <FileText className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">승인 완료 내역</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-0.5">선택한 기간의 지출 내역 {filteredExpenses.length}건</p>
              </div>
            </div>
          </div>

          <div className="finance-table-wrap overflow-x-auto">
            <table className="finance-table w-full text-left">
              <caption className="sr-only">{startDate}부터 {endDate}까지 승인된 지출 내역</caption>
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th scope="col" className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">일자 / 분류</th>
                  <th scope="col" className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">지출 항목</th>
                  <th scope="col" className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">신청자</th>
                  <th scope="col" className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">최종 금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="finance-record hover:bg-slate-50/80 transition-all group duration-300">
                      <td data-label="일자 / 분류" className="px-8 py-5">
                        <div className="finance-record-date space-y-1.5">
                           <div className="flex items-center gap-1.5 text-xs font-black text-slate-400 italic">
                              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                              {expense.date}
                           </div>
                           <span className="finance-category inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black tracking-widest uppercase border border-emerald-100">
                             {expense.category}
                           </span>
                        </div>
                      </td>
                      <td data-label="지출 항목" className="finance-record-title px-8 py-5">
                         <span className="text-sm font-black text-slate-800 group-hover:text-emerald-600 transition-colors">
                           {expense.title}
                         </span>
                      </td>
                      <td data-label="신청자" className="px-8 py-5">
                        <div className="finance-applicant flex items-center gap-3">
                           <div className="finance-applicant-avatar w-9 h-9 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-400 shadow-sm group-hover:rotate-6 transition-transform" aria-hidden="true">
                              {expense.userName?.charAt(0) || expense.applicant?.charAt(0) || 'U'}
                           </div>
                           <span className="text-xs font-black text-slate-700">{expense.userName || expense.applicant}</span>
                        </div>
                      </td>
                      <td data-label="최종 금액" className="finance-record-amount px-8 py-5 text-right">
                        <div className="space-y-0.5">
                           <span className="text-base font-black text-slate-900 tracking-tighter italic">
                             {Number(expense.amount || 0).toLocaleString()} <span className="text-[10px] text-slate-400 ml-0.5 uppercase">원</span>
                           </span>
                           <div className="finance-approved text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-end gap-1">
                              <CheckCircle className="w-2.5 h-2.5" aria-hidden="true" /> 승인 완료
                           </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="finance-empty py-32 text-center">
                       <FileText className="w-16 h-16 text-slate-100 mx-auto mb-4" aria-hidden="true" />
                       <p className="text-slate-400 font-black tracking-tight text-lg">해당 기간 내 승인된 내역이 없습니다.</p>
                       <p className="text-slate-300 text-sm font-medium mt-1">조회 기간을 변경하거나 지출 내역의 승인 상태를 확인해 주세요.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="finance-list-footer p-8 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">조회 내역</span>
                <span className="text-xs font-black text-slate-900">{filteredExpenses.length} 건</span>
             </div>
             <p className="text-[10px] text-slate-300 font-bold italic print:block hidden">이 리포트는 Stitch HR 시스템에 의해 실시간 생성되었습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
