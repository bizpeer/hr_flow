import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabase';
import { FileText, Printer, Search, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function CertificatesPage() {
  const { profile } = useAuth();
  const [certType, setCertType] = useState<'EMPLOYMENT' | 'CAREER'>('EMPLOYMENT');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Form Fields for Admin
  const [ceoName, setCeoName] = useState<string>('대표이사');
  const [purpose, setPurpose] = useState<string>('금융기관 제출용');
  
  const role = profile?.role || 'member';
  const isManagement = ['super_admin', 'admin', 'sub_admin'].includes(role);

  useEffect(() => {
    if (!profile) return;
    
    const fetchUsers = async () => {
      setLoading(true);
      if (isManagement) {
        const { data } = await supabase
          .from('profiles')
          .select('*, companies(name)')
          .eq('company_id', profile.company_id)
          .order('full_name');
        setUsers(data || []);
        if (data && data.length > 0) setSelectedUserId(data[0].id);
      } else {
        setUsers([profile]);
        setSelectedUserId(profile.id);
      }
      setLoading(false);
    };

    fetchUsers();
  }, [profile, isManagement]);

  const targetUser = users.find(u => u.id === selectedUserId) || profile;
  const companyName = targetUser?.companies?.name || profile?.companies?.name || '회사명';

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
     return <div className="p-10 text-center animate-pulse text-slate-400 font-bold tracking-widest uppercase">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20 print:p-0 print:m-0 print:max-w-none">
      {/* Header - Hidden in Print */}
      <div className="flex flex-col xl:flex-row justify-between gap-8 print:hidden">
        <div className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-slate-900 rounded-[2rem] text-white flex items-center justify-center shadow-2xl">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">증명서 발급</h1>
              <p className="text-slate-500 font-medium text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Certificate Auto-Generation System
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-4 px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-slate-900 transition-all uppercase tracking-widest text-[11px]"
          >
            <Printer className="w-5 h-5" />
            <span>인쇄 / PDF 저장</span>
          </button>
        </div>
      </div>

      {/* Control Panel - Hidden in Print */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8 print:hidden">
         <div className="flex-1 space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">증명서 종류</label>
            <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl">
               <button 
                onClick={() => setCertType('EMPLOYMENT')}
                className={`flex-1 py-3 rounded-xl text-[11px] font-black transition-all tracking-widest uppercase ${certType === 'EMPLOYMENT' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 재직증명서
               </button>
               <button 
                onClick={() => setCertType('CAREER')}
                className={`flex-1 py-3 rounded-xl text-[11px] font-black transition-all tracking-widest uppercase ${certType === 'CAREER' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 경력증명서
               </button>
            </div>
         </div>

         {isManagement && (
           <div className="flex-1 space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">발급 대상자 선택</label>
              <select 
                value={selectedUserId} 
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100 appearance-none"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.department || '부서미지정'})</option>
                ))}
              </select>
           </div>
         )}

         <div className="flex-1 space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">대표자 서명란 (관리자용)</label>
            <input 
              type="text" 
              value={ceoName}
              onChange={(e) => setCeoName(e.target.value)}
              disabled={!isManagement}
              className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-indigo-100 disabled:opacity-50"
              placeholder="예: 홍길동"
            />
         </div>
      </div>

      {/* Certificate Preview (A4 Size approximation) */}
      <div className="flex justify-center print:block print:w-full">
         <div className="bg-white w-full max-w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl print:shadow-none print:p-0 relative font-serif text-slate-900 border border-slate-200 print:border-none">
            
            <h1 className="text-4xl font-bold text-center mt-12 mb-16 tracking-[1em] ml-[0.5em]">
               {certType === 'EMPLOYMENT' ? '재 직 증 명 서' : '경 력 증 명 서'}
            </h1>

            <table className="w-full border-collapse border-2 border-slate-900 text-sm mb-12">
               <tbody>
                  <tr>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold w-32 text-center text-slate-600">성 명</td>
                     <td className="border border-slate-900 p-4 font-semibold">{targetUser?.full_name}</td>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold w-32 text-center text-slate-600">주민등록번호</td>
                     <td className="border border-slate-900 p-4 font-semibold">{targetUser?.resident_number || '______-_______'}</td>
                  </tr>
                  <tr>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold text-center text-slate-600">주 소</td>
                     <td colSpan={3} className="border border-slate-900 p-4 font-semibold">{targetUser?.address || '주소 정보 없음'}</td>
                  </tr>
                  <tr>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold text-center text-slate-600">소 속</td>
                     <td className="border border-slate-900 p-4 font-semibold">{targetUser?.department || '-'}</td>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold text-center text-slate-600">직 위</td>
                     <td className="border border-slate-900 p-4 font-semibold">{targetUser?.position || '-'}</td>
                  </tr>
                  <tr>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold text-center text-slate-600">재직기간</td>
                     <td colSpan={3} className="border border-slate-900 p-4 font-semibold">
                        {/* 더미 날짜. 실제로는 입사일 필드가 필요합니다. 본 데모에선 임의 처리 */}
                        2020년 01월 01일 ~ {certType === 'EMPLOYMENT' ? '현재' : '2023년 12월 31일'} ( O년 O개월 )
                     </td>
                  </tr>
                  <tr>
                     <td className="border border-slate-900 bg-slate-50 p-4 font-bold text-center text-slate-600">용 도</td>
                     <td colSpan={3} className="border border-slate-900 p-4 font-semibold">
                        <input 
                          type="text" 
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                          className="w-full bg-transparent outline-none pb-1 border-b border-dashed border-slate-300 print:border-none"
                        />
                     </td>
                  </tr>
               </tbody>
            </table>

            <div className="text-center space-y-6 mt-20 mb-32">
               <p className="text-xl">위 사람은 위와 같이 {certType === 'EMPLOYMENT' ? '재직하고' : '근무하였음을'} 증명합니다.</p>
            </div>

            <div className="text-center space-y-16 absolute bottom-[40mm] left-0 w-full">
               <p className="text-lg">{format(new Date(), 'yyyy년 MM월 dd일')}</p>
               
               <div className="text-2xl font-bold tracking-widest relative inline-block">
                  {companyName} 대표이사 <span className="mr-8">{ceoName}</span> (인)
                  {/* 직인(도장) 원형 테두리 효과 (프린트시에도 표시되도록) */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 border-4 border-red-600 rounded-full flex items-center justify-center text-red-600 text-sm font-black -mr-12 opacity-80 rotate-12" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact'}}>
                     직인
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
