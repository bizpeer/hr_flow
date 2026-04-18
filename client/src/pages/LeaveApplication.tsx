import React, { useState, useEffect } from 'react';
import { Calendar, History, Send, Loader2, AlertCircle, UploadCloud } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { calculateLeaveEntitlement } from '../utils/leaveCalculator';
import { format, parseISO, differenceInDays } from 'date-fns';

interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: 'annual' | 'half' | 'sick' | 'other';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  requestDays: number;
  attachmentName?: string;
  attachmentUrl?: string;
}

export const LeaveApplication: React.FC = () => {
  const { userData, user } = useAuthStore();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 폼 상태
  const [formData, setFormData] = useState<{
    type: 'annual' | 'half' | 'sick' | 'other';
    startDate: string;
    endDate: string;
    reason: string;
    fileName: string;
    file: File | null;
  }>({
    type: 'annual',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    fileName: '',
    file: null
  });

  // 연차 계산 (실시간 집계 로직으로 변경)
  const joinDate = userData?.joinDate ? new Date(userData.joinDate) : new Date();
  const totalLeave = calculateLeaveEntitlement(joinDate);
  
  // 승인된 연차/반차 내역만 합산하여 실시간으로 '사용 완료' 계산
  const usedLeave = requests
    .filter(req => req.status === 'APPROVED' && (req.type === 'annual' || req.type === 'half'))
    .reduce((sum, req) => sum + (req.requestDays || 0), 0);
    
  const remainingLeave = totalLeave - usedLeave;

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'leaves'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const allReqs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));
      // 생성일 기준 클라이언트 사이드 내림차순 정렬 (인덱스 에러 방지)
      const sorted = [...allReqs].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRequests(sorted);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Subscribe Error:", error);
      setLoading(false);
      if (error.code === 'permission-denied') {
        alert("데이터 조회 권한이 없습니다. 관리자에게 문의해 주세요.");
      } else {
        alert("휴가 정보를 불러오는 데 오류가 발생했습니다. (인덱스/네트워크)");
      }
    });

    return () => unsubscribe();
  }, [user?.uid, userData?.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData) return;

    // 날짜 차이 계산 (연차 일수)
    const start = parseISO(formData.startDate);
    const end = parseISO(formData.endDate);
    const days = formData.type === 'half' ? 0.5 : differenceInDays(end, start) + 1;

    if (days <= 0) {
      alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    if ((formData.type === 'annual' || formData.type === 'half') && days > remainingLeave) {
      alert("잔여 연차가 부족합니다.");
      return;
    }

    try {
      setSubmitting(true);
      
      let attachmentUrl = '';
      if (formData.file) {
        const fileRef = ref(storage, `leaves/${user?.uid || 'anonymous'}/${Date.now()}_${formData.file.name}`);
        const uploadResult = await uploadBytes(fileRef, formData.file);
        attachmentUrl = await getDownloadURL(uploadResult.ref);
      }

      await addDoc(collection(db, 'leaves'), {
        userId: user?.uid || userData?.uid || 'UNKNOWN',
        userName: userData?.name || '가입대기(직원)',
        teamId: userData?.teamId || '',
        divisionId: userData?.divisionId || '',
        type: formData.type || 'annual',
        startDate: formData.startDate || '',
        endDate: formData.endDate || '',
        reason: formData.reason || '',
        attachmentName: formData.fileName || '',
        attachmentUrl: attachmentUrl,
        status: 'PENDING',
        requestDays: days || 0,
        createdAt: new Date().toISOString(),
        companyId: userData?.companyId || ''
      });
      
      alert("휴가 신청이 완료되었습니다.");
      setFormData({
        ...formData,
        reason: '',
        fileName: '',
        file: null
      });
    } catch (err) {
      alert("신청 실패: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-600 rounded-lg text-white">
                <Calendar className="w-5 h-5" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">내 휴가 및 근태 관리</h1>
            </div>
            <p className="text-slate-500 font-medium">대한민국 근로기준법에 따른 연차 자동 산정</p>
          </div>
          
          <div className="flex flex-wrap md:flex-nowrap gap-4 w-full md:w-auto">
            <div className="flex-1 md:w-32 glass-card p-5 rounded-3xl premium-shadow flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 발생</span>
              <span className="text-2xl font-black text-slate-800">{totalLeave}<span className="text-xs ml-0.5 text-slate-400">D</span></span>
            </div>
            <div className="flex-1 md:w-32 glass-card p-5 rounded-3xl premium-shadow flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">사용 완료</span>
              <span className="text-2xl font-black text-rose-500">{usedLeave}<span className="text-xs ml-0.5 text-rose-300">D</span></span>
            </div>
            <div className="flex-1 md:w-40 bg-indigo-600 p-5 rounded-3xl shadow-xl shadow-indigo-200 flex flex-col items-center border border-indigo-500">
              <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">잔여 연차</span>
              <span className="text-2xl font-black text-white">{remainingLeave}<span className="text-xs ml-0.5 text-indigo-300">D</span></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* 신청 폼 */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-700"></div>
              
              <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3 relative z-10">
                <Send className="w-5 h-5 text-indigo-500" />
                휴가 신청하기
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">휴가 종류</label>
                  <select 
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold text-slate-700"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                  >
                    <option value="annual">연차 휴가 (1일)</option>
                    <option value="half">반차 휴가 (0.5일)</option>
                    <option value="sick">병가 (공가)</option>
                    <option value="other">기타 (경조사 등)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">시작일</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold text-slate-700"
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">종료일</label>
                    <input 
                      type="date" 
                      disabled={formData.type === 'half'}
                      className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 disabled:opacity-30 disabled:grayscale"
                      value={formData.type === 'half' ? formData.startDate : formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">사유</label>
                  <textarea 
                    rows={3}
                    placeholder="사유를 입력해 주세요"
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 resize-none"
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">증빙 파일 (병가/경조사 등)</label>
                   <label className="flex items-center justify-center w-full h-32 px-4 transition-all bg-slate-50 border-2 border-slate-100 border-dashed rounded-[2rem] cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 group/upload">
                      <div className="flex flex-col items-center gap-2">
                         <UploadCloud className="w-8 h-8 text-slate-300 group-hover/upload:text-indigo-500 transition-colors" />
                         <span className="text-xs font-black text-slate-400 group-hover/upload:text-indigo-600">
                           {formData.fileName ? formData.fileName : '증빙 서류 이미지 또는 PDF 업로드'}
                         </span>
                      </div>
                      <input 
                        type="file" className="hidden" accept="image/*,.pdf" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            setFormData({...formData, fileName: file.name, file: file});
                          }
                        }} 
                      />
                   </label>
                </div>

                <button 
                  type="submit"
                  disabled={submitting}
                  className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {submitting ? <Loader2 className="w-6 h-6 animate-spin"/> : (
                    <>
                      <span>신청서 제출</span>
                      <Send className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* 신청 내역 */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <History className="w-7 h-7 text-indigo-500" />
                  최근 신청 내역
                </h2>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">List View</div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-6 font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] px-4">종류</th>
                      <th className="pb-6 font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] px-4">기간 / 사유</th>
                      <th className="pb-6 font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] px-4">사용일</th>
                      <th className="pb-6 font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] px-4">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {requests.map((req) => (
                      <tr key={req.id} className="group hover:bg-slate-50/80 transition-all duration-300">
                        <td className="py-6 px-4">
                          <span className={`px-3 py-1.5 rounded-xl text-[11px] font-black tracking-tight ${
                            req.type === 'annual' ? 'bg-indigo-50 text-indigo-600' :
                            req.type === 'half' ? 'bg-amber-50 text-amber-600' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {req.type === 'annual' ? '연차' :
                             req.type === 'half' ? '반차' :
                             req.type === 'sick' ? '병가' : '기타'}
                          </span>
                        </td>
                        <td className="py-6 px-4">
                          <div className="text-sm font-bold text-slate-700">
                            {req.startDate} {req.type !== 'half' && `~ ${req.endDate}`}
                          </div>
                          <div className="text-[10px] font-medium text-slate-400 mt-1 line-clamp-1">{req.reason}</div>
                        </td>
                        <td className="py-6 px-4 text-center md:text-left">
                          <span className="text-sm font-black text-slate-900">{req.requestDays}일</span>
                        </td>
                        <td className="py-6 px-4">
                          <span className={`flex items-center gap-2 text-xs font-black ${
                            req.status === 'APPROVED' ? 'text-emerald-500' :
                            req.status === 'REJECTED' ? 'text-rose-500' :
                            'text-amber-500'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${
                              req.status === 'APPROVED' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                              req.status === 'REJECTED' ? 'bg-rose-500' :
                              'bg-amber-500 animate-pulse'
                            }`} />
                            {req.status === 'APPROVED' ? '승인완료' : 
                             req.status === 'REJECTED' ? '반려됨' : '심사중'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-24 text-center">
                          <div className="flex flex-col items-center gap-3">
                             <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                               <Calendar className="w-8 h-8 text-slate-200" />
                             </div>
                             <p className="text-slate-400 text-sm font-bold">최근 신청 내역이 없습니다.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 안내 배너 */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden premium-shadow">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16"></div>
              <div className="flex gap-5 relative z-10">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-sm">
                  <p className="font-black mb-2 text-lg tracking-tight">💡 연차 산정 기준 안내</p>
                  <p className="text-slate-400 leading-relaxed font-medium">당사 근태 규정은 대한민국 근로기준법을 준수합니다. 1년 미만 근속자는 매월 개근 시 1일이 발생하며, 1년 이상 근속 시 연 15일의 연차가 발생합니다. (매 2년 근속 시 1일 가산, 최대 25일 한도)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
