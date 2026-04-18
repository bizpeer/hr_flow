import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, CheckCircle, FileText, History, AlertCircle, Send, Loader2, DollarSign, X, Trash2, Edit, Clock, Calendar 
} from 'lucide-react';
import { addDoc, collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

interface ExpenseRequest {
  id: string;
  userId: string;
  userName: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  attachmentName?: string;
  attachmentUrl?: string;
}

export const ExpenseForm: React.FC = () => {
  const { userData, user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('식비/회식대');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requests, setRequests] = useState<ExpenseRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // 상세 보기 및 수정 관련 상태
  const [selectedRequest, setSelectedRequest] = useState<ExpenseRequest | null>(null);
  const [editingRequest, setEditingRequest] = useState<ExpenseRequest | null>(null); // 현재 수정 중인 원본 데이터
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'expenses'),
      where('userId', '==', user.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const allReqs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseRequest));
      // 클라이언트 사이드에서 생성일 기준 내림차순 정렬 (인덱스 에러 방지)
      const sorted = [...allReqs].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRequests(sorted);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Subscribe Error:", error);
      setLoading(false);
      // 권한이나 색인 문제가 있을 경우 alert로 안내
      if (error.code === 'permission-denied') {
        alert("데이터 조회 권한이 없습니다. 관리자에게 문의해 주세요.");
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // 필터링된 내역 계산
  const filteredRequests = filterMonth === 'all' 
    ? requests 
    : requests.filter(req => req.date.substring(0, 7) === filterMonth);

  // 최근 12개월 목록 생성 (필터용)
  const monthOptions = Array.from({ length: 13 }, (_, i) => {
    if (i === 12) return { value: 'all', label: '전체 보기' };
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return { 
      value: format(d, 'yyyy-MM'), 
      label: format(d, 'yyyy년 MM월') 
    };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 0. 초기화: undefined 방지를 위해 기본값 보장
      let finalUrl = editingRequest?.attachmentUrl || '';
      let finalName = fileName || editingRequest?.attachmentName || '';
      
      // 1. 파일 업로드 로직 (새 파일이 선택된 경우에만)
      if (selectedFile) {
        console.log("📤 Uploading file to Storage...", selectedFile.name);
        
        // Storage 설정이 올바른지 체크 (Buckets이 없으면 무한 대기 가능성 상존)
        if (!storage.app.options.storageBucket) {
          throw new Error("Firebase Storage Bucket 설정(VITE_FIREBASE_STORAGE_BUCKET)이 누락되었습니다. 관리자에게 문의해 주세요.");
        }

        const folderPath = `expenses/${user?.uid || 'anonymous'}`;
        const fileNameToSave = `${Date.now()}_${selectedFile.name}`;
        const fileRef = ref(storage, `${folderPath}/${fileNameToSave}`);
        
        // 무한 로딩 방지: 20초 타임아웃 적용
        const uploadPromise = uploadBytes(fileRef, selectedFile);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("업로드 시간 초과: 네트워크 상태를 확인하거나 스토리지 설정을 점검해 주세요.")), 20000)
        );

        const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
        finalUrl = await getDownloadURL(uploadResult.ref);
        finalName = selectedFile.name;
        console.log("✅ Upload Success:", finalUrl);
      }

      // 2. 페이로드 구성 (모든 필드에 대해 undefined 방지 처리)
      const payload = {
        userId: user?.uid || userData?.uid || 'UNKNOWN',
        userName: userData?.name || '가입대기(직원)',
        teamId: userData?.teamId || '',
        divisionId: userData?.divisionId || '',
        title: title || '제목 없음',
        amount: Number(amount) || 0,
        date: date || new Date().toISOString().split('T')[0],
        category: category || '기타',
        description: description || '',
        attachmentName: finalName || '',
        attachmentUrl: finalUrl || '',
        status: isEditing ? (editingRequest?.status || 'PENDING') : 'PENDING',
        updatedAt: new Date().toISOString()
      };

      console.log("💾 Saving document...", isEditing ? "UPDATE" : "CREATE");

      if (isEditing && editingId) {
        // 기존 문서 업데이트
        await updateDoc(doc(db, 'expenses', editingId), payload);
        alert('지출결의서 수정이 완료되었습니다.');
        setIsEditing(false);
        setEditingId(null);
        setEditingRequest(null);
        setSelectedRequest(null);
      } else {
        // 신규 등록
        await addDoc(collection(db, 'expenses'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        setIsSuccess(true);
      }
      
      // 폼 초기화 (수정/신규 공통)
      setTitle('');
      setAmount('');
      setDate('');
      setDescription('');
      setFileName('');
      setSelectedFile(null);
      
    } catch (error) {
      console.error('Submit/Update Error Detailed:', error);
      const errorMsg = (error as Error).message;
      alert('처리 중 오류가 발생했습니다.\n\n원인: ' + errorMsg);
    } finally {
      setIsSubmitting(false); // 무한 로딩 방어: 어떤 경우에도 로딩 해제
    }
  };

  const handleEdit = (req: ExpenseRequest) => {
    if (req.status !== 'PENDING') {
      alert('승인 대기 중인 안건만 수정할 수 있습니다.');
      return;
    }
    
    // 수정을 위해 폼 데이터 채우기
    setIsEditing(true);
    setEditingId(req.id);
    setEditingRequest(req); // 원본 데이터 보관
    
    setTitle(req.title);
    setAmount(req.amount.toString());
    setDate(req.date);
    setCategory(req.category);
    setDescription(req.description);
    setFileName(req.attachmentName || '');
    setSelectedFile(null); // 기존 파일은 URL로 유지
    
    // 모달 닫기 (모달을 통해 진입했을 경우)
    setSelectedRequest(null);
    
    // 페이지 상단 폼으로 스크롤 이동
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingId(null);
    setEditingRequest(null);
    setTitle('');
    setAmount('');
    setDate('');
    setDescription('');
    setFileName('');
    setSelectedFile(null);
    setSelectedRequest(null);
  };

  const handleDelete = async (id: string, status: string) => {
    if (status !== 'PENDING') {
      alert('승인 대기 중인 안건만 삭제할 수 있습니다.');
      return;
    }
    
    if (!window.confirm('이 신청 건을 삭제하시겠습니까?')) return;
    
    try {
      await deleteDoc(doc(db, 'expenses', id));
      alert('삭제되었습니다.');
      if (selectedRequest?.id === id) setSelectedRequest(null);
    } catch (err) {
      alert('삭제 실패: ' + (err as Error).message);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setFileName(file.name);
      setSelectedFile(file);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="p-2 bg-emerald-600 rounded-lg text-white">
                <FileText className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">지출결의 신청</h1>
            </div>
            <p className="text-slate-500 font-medium text-xs">증빙 자료(영수증) 업로드가 필수입니다.</p>
          </div>
          
          <div className="glass-card px-5 py-3 rounded-2xl premium-shadow flex items-center gap-4 border-emerald-100">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Total Pending</span>
              <span className="text-2xl font-black text-slate-800 tracking-tighter">
                {requests.filter(r => r.status === 'PENDING').length} <span className="text-xs text-slate-400 font-bold ml-0.5">건</span>
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* 신청 폼 */}
          <div className="lg:col-span-12 xl:col-span-5">
            <div className="bg-white rounded-[1.5rem] shadow-xl p-6 border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-700"></div>
              
              {isSuccess ? (
                <div className="py-8 flex flex-col items-center text-center relative z-10">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 mb-1">신청 완료!</h2>
                  <p className="text-slate-500 mb-5 font-medium text-[10px]">재무 담당자가 확인 후 승인 처리됩니다.</p>
                  <button 
                    onClick={() => setIsSuccess(false)}
                    className="px-6 py-3 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 transition-all active:scale-95 text-xs uppercase tracking-widest"
                  >
                    추가 신청하기
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 relative z-10 font-sans">
                  <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Send className={`w-4 h-4 ${isEditing ? 'text-indigo-500' : 'text-emerald-500'}`} />
                       {isEditing ? '지출 결의서 수정' : '새 결의서 작성'}
                    </div>
                    {isEditing && (
                      <button 
                         type="button"
                         onClick={handleCancelEdit}
                         className="text-[10px] font-black text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
                      >
                         <X className="w-3 h-3" /> 수정 취소
                      </button>
                    )}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">지출 항목명</label>
                      <input 
                        type="text" required
                        value={title} onChange={(e) => setTitle(e.target.value)}
                        placeholder="예: 3월 본부 회식비"
                        className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">분류</label>
                      <select 
                        value={category} onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 text-xs"
                      >
                        <option value="식비/회식대">식비/회식대</option>
                        <option value="교통/출장비">교통/출장비</option>
                        <option value="비품/소모품">비품/소모품</option>
                        <option value="접대/미팅비">접대/미팅비</option>
                        <option value="기타">기타 비용</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">금액 (원)</label>
                      <div className="relative">
                        <input 
                          type="number" required min="1"
                          value={amount} onChange={(e) => setAmount(e.target.value)}
                          placeholder="0"
                          className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-black text-slate-800 text-sm"
                        />
                        <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      </div>
                    </div>

                    <div className="space-y-1 md:col-span-2">
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">결제일</label>
                       <input 
                         type="date" required
                         value={date} onChange={(e) => setDate(e.target.value)}
                         className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 text-xs"
                       />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">상세 내역</label>
                    <textarea 
                      required rows={3}
                      value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="참여자 및 목적을 간단히 적어주세요."
                      className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-semibold text-slate-700 resize-none text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">증빙 자료</label>
                     <label className="flex items-center justify-center w-full h-20 px-4 transition-all bg-slate-50 border-2 border-slate-100 border-dashed rounded-xl cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 group/upload">
                        <div className="flex flex-col items-center gap-1">
                           <UploadCloud className="w-5 h-5 text-slate-300 group-hover/upload:text-emerald-500 transition-colors" />
                           <span className="text-[9px] font-black text-slate-400 group-hover/upload:text-emerald-600 truncate max-w-full">
                             {fileName ? fileName : '영수증 이미지 또는 PDF 파일 업로드'}
                           </span>
                        </div>
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileChange} />
                     </label>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className={`w-full py-3 text-white font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                       isEditing ? 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700' : 'bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700'
                    }`}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : (
                      <>
                        <span className="text-xs uppercase tracking-widest">{isEditing ? '결의서 수정 완료' : '지출결의 제출'}</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* 신청 내역 */}
          <div className="lg:col-span-12 xl:col-span-7 space-y-6">
            <div className="bg-white rounded-[1.5rem] shadow-xl p-6 border border-slate-100 h-full overflow-hidden">
               <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                  <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-500" />
                    나의 신청 내역
                  </h2>
                  
                  {/* 월별 필터 UI */}
                  <div className="relative group/filter w-full sm:w-auto">
                    <select 
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="w-full sm:w-40 pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black text-slate-700 appearance-none focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      {monthOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 text-slate-400 pointer-events-none group-hover/filter:text-emerald-500 transition-colors" />
                  </div>
               </div>

               <div className="overflow-x-auto">
                 <table className="w-full min-w-[500px]">
                    <thead>
                       <tr className="text-left border-b border-slate-50">
                          <th className="pb-3 font-black text-slate-400 text-[9px] uppercase tracking-widest px-3">분류 / 날짜</th>
                          <th className="pb-3 font-black text-slate-400 text-[9px] uppercase tracking-widest px-3">항목명</th>
                          <th className="pb-3 font-black text-slate-400 text-[9px] uppercase tracking-widest px-3 text-right">금액</th>
                          <th className="pb-3 font-black text-slate-400 text-[9px] uppercase tracking-widest px-3 text-center">상태</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-sans">
                       {filteredRequests.map((req) => (
                          <tr 
                            key={req.id} 
                            onClick={() => setSelectedRequest(req)}
                            className="group hover:bg-slate-50/80 transition-all duration-300 cursor-pointer"
                          >
                             <td className="py-2.5 px-3">
                                <div className="text-[9px] font-black text-emerald-600 mb-0.5">{req.category}</div>
                                <div className="text-[9px] font-bold text-slate-400">{req.date}</div>
                             </td>
                             <td className="py-2.5 px-3">
                                <div className="text-xs font-black text-slate-800 line-clamp-1">{req.title}</div>
                             </td>
                             <td className="py-2.5 px-3 text-right">
                                <span className="text-xs font-black text-slate-900 italic">₩ {req.amount.toLocaleString()}</span>
                             </td>
                             <td className="py-2.5 px-3">
                                <div className="flex justify-center">
                                   <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full ${
                                      req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                                      req.status === 'REJECTED' ? 'bg-rose-50 text-rose-600' :
                                      'bg-amber-50 text-amber-600'
                                   }`}>
                                      <div className={`w-1 h-1 rounded-full ${
                                         req.status === 'APPROVED' ? 'bg-emerald-500' :
                                         req.status === 'REJECTED' ? 'bg-rose-500' :
                                         'bg-amber-500 animate-pulse'
                                      }`} />
                                      {req.status === 'APPROVED' ? '승인' : 
                                       req.status === 'REJECTED' ? '반려' : '대기'}
                                   </span>
                                </div>
                             </td>
                          </tr>
                       ))}
                       {filteredRequests.length === 0 && !loading && (
                          <tr>
                             <td colSpan={4} className="py-20 text-center">
                                <div className="flex flex-col items-center gap-2">
                                   <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center">
                                      <History className="w-5 h-5 text-slate-200" />
                                   </div>
                                   <p className="text-slate-400 text-[9px] font-black">신청 내역이 없습니다.</p>
                                </div>
                             </td>
                          </tr>
                       )}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        </div>

        {/* 안내 배너 */}
        <div className="bg-slate-900 rounded-[1rem] p-4 text-white relative overflow-hidden premium-shadow">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <div className="flex items-center gap-4 relative z-10">
             <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0 border border-emerald-500/30">
               <AlertCircle className="w-4 h-4 text-emerald-400" />
             </div>
             <div>
               <h3 className="text-[11px] font-black mb-0.5 flex items-center gap-2">
                 지출결의 보안 및 규정 안내
               </h3>
               <p className="text-[10px] text-slate-400 leading-normal font-medium">
                 모든 지출 결의는 전자증빙 첨부가 원칙입니다. 신속한 처리를 위해 결제 후 7일 이내 신청을 권장합니다.
               </p>
             </div>
          </div>
        </div>

      </div>

      {/* 나의 신청 상세 정보 모달 */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-50 flex justify-between items-start">
                 <div className="space-y-1">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                       Application Detail
                    </div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tighter">지출결의 상세서</h2>
                    <div className="flex items-center gap-3 text-slate-400">
                       <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 rounded text-[9px] font-bold">
                          <Calendar className="w-3 h-3" /> {selectedRequest.createdAt ? format(new Date(selectedRequest.createdAt), 'yyyy.MM.dd') : '-'}
                       </div>
                    </div>
                 </div>
                 <button 
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-100 transition-all"
                 >
                    <X className="w-5 h-5" />
                 </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto premium-scrollbar font-sans">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">신청 분류</span>
                       <div className="p-3 bg-slate-50 rounded-xl font-black text-xs text-slate-700 border border-slate-100">
                          {selectedRequest.category}
                       </div>
                    </div>
                    <div className="space-y-1">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">결제 금액</span>
                       <div className="p-3 rounded-xl font-black text-xs border bg-emerald-50 text-emerald-600 border-emerald-100">
                          ₩ {Number(selectedRequest.amount).toLocaleString()}
                       </div>
                    </div>
                 </div>

                 <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">상세 내역</span>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 min-h-[60px]">
                       <p className="text-xs text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">{selectedRequest.description || selectedRequest.title}</p>
                    </div>
                 </div>

                 <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <Clock className="w-4 h-4 text-amber-500 animate-spin-slow" />
                    <div>
                       <p className="text-[9px] font-black text-amber-800 uppercase tracking-tight">Status</p>
                       <p className="text-[10px] font-bold text-amber-600">현재 <span className="underline">{selectedRequest.status === 'PENDING' ? '검토 중' : selectedRequest.status === 'APPROVED' ? '승인' : '반려'}</span> 상태입니다.</p>
                    </div>
                 </div>

                 {/* 첨부파일 섹션 */}
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">첨부 증빙 자료</span>
                    
                    {selectedRequest.attachmentUrl ? (
                       <>
                          {(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some(ext => selectedRequest.attachmentUrl?.toLowerCase().includes(ext)) || 
                            selectedRequest.attachmentUrl?.includes('image%2F')) && (
                             <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                <img 
                                   src={selectedRequest.attachmentUrl} 
                                   alt="Preview" 
                                   className="w-full h-auto max-h-[200px] object-contain cursor-pointer"
                                   onClick={() => window.open(selectedRequest.attachmentUrl, '_blank')}
                                />
                             </div>
                          )}

                          <div className="flex items-center justify-between p-3 bg-white border border-emerald-50 rounded-xl shadow-sm hover:border-emerald-200 transition-all group/file">
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 group-hover/file:bg-emerald-600 group-hover/file:text-white transition-all">
                                   <FileText className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                   <p className="text-[10px] font-black text-slate-800 truncate">{selectedRequest.attachmentName || '첨부 파일'}</p>
                                </div>
                             </div>
                             <button 
                                onClick={() => window.open(selectedRequest.attachmentUrl, '_blank')}
                                className="px-3 py-1.5 bg-emerald-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-700 transition-all shrink-0 ml-3"
                             >
                                View
                             </button>
                          </div>
                       </>
                    ) : (
                       <div className="p-6 border-2 border-slate-100 border-dashed rounded-xl flex flex-col items-center gap-2 text-slate-300 bg-slate-50/30">
                          <AlertCircle className="w-5 h-5 opacity-20" />
                          <p className="text-[9px] font-bold italic">첨부 자료 없음</p>
                       </div>
                    )}
                 </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                 <button 
                  onClick={() => setSelectedRequest(null)}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-400 font-black rounded-xl hover:bg-slate-100 transition-all uppercase tracking-widest text-[10px]"
                 >
                    Close
                 </button>
                 {selectedRequest.status === 'PENDING' && (
                    <>
                       <button 
                        onClick={() => handleDelete(selectedRequest.id, selectedRequest.status)}
                         className="px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                         title="신청 취소"
                       >
                          <Trash2 className="w-5 h-5" />
                       </button>
                       <button 
                        onClick={() => handleEdit(selectedRequest)}
                        className="flex-[2] py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 uppercase tracking-widest text-[9px] flex items-center justify-center gap-2"
                       >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Modify Record</span>
                       </button>
                    </>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
