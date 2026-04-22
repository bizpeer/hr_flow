import React, { useState, useEffect } from 'react';
import { 
  Megaphone, Plus, Search, ChevronDown, Bell, Clock, User, ArrowRight, 
  Trash2, Edit3, X, UploadCloud, Loader2, FileText, CheckCircle
} from 'lucide-react';
import { collection, onSnapshot, query, addDoc, doc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';

interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  category: string;
  attachmentUrl?: string;
  attachmentName?: string;
  readBy: string[];
}

interface NoticeBoardProps {
  userRole: 'ADMIN' | 'SUB_ADMIN' | 'MEMBER' | string;
  currentUserId: string;
}

export const NoticeBoard: React.FC<NoticeBoardProps> = ({ userRole, currentUserId }) => {
  const { userData } = useAuthStore();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 폼 필드
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('공지');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isAdmin = userRole === 'ADMIN';
  const isManager = userRole === 'ADMIN' || userRole === 'SUB_ADMIN';

  useEffect(() => {
    if (!userData?.companyId) return;
    const q = query(collection(db, 'notices'), where('companyId', '==', userData.companyId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice));
      setNotices(docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    }, (err) => {
      console.error("Notice Fetch Error:", err);
      if (err.code === 'permission-denied') {
        alert("공지사항을 읽을 권한이 없습니다. 관리자에게 문의하세요.");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userData?.companyId]);

  const handleNoticeClick = (noticeId: string) => {
    setExpandedNoticeId(prev => prev === noticeId ? null : noticeId);
  };

  const handleOpenModal = (notice?: Notice) => {
    if (notice) {
      setEditingNotice(notice);
      setTitle(notice.title);
      setContent(notice.content);
      setCategory(notice.category);
    } else {
      setEditingNotice(null);
      setTitle('');
      setContent('');
      setCategory('공지');
    }
    setSelectedFile(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let attachmentUrl = editingNotice?.attachmentUrl || '';
      let attachmentName = editingNotice?.attachmentName || '';

      if (selectedFile) {
        const fileRef = ref(storage, `companies/${userData?.companyId || 'public'}/notices/${Date.now()}_${selectedFile.name}`);
        const uploadResult = await uploadBytes(fileRef, selectedFile);
        attachmentUrl = await getDownloadURL(uploadResult.ref);
        attachmentName = selectedFile.name;
      }

      const noticeData = {
        title,
        content,
        category,
        attachmentUrl,
        attachmentName,
        updatedAt: new Date().toISOString()
      };

      if (editingNotice) {
        await updateDoc(doc(db, 'notices', editingNotice.id), noticeData);
      } else {
        await addDoc(collection(db, 'notices'), {
          ...noticeData,
          authorId: currentUserId,
          authorName: userData?.name || '관리자',
          createdAt: new Date().toISOString(),
          readBy: [],
          companyId: userData?.companyId || ''
        });
      }

      setIsModalOpen(false);
      alert(editingNotice ? "수정되었습니다." : "공지가 등록되었습니다.");
    } catch (err) {
      alert("처리 실패: " + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, notice: Notice) => {
    e.stopPropagation();
    if (!window.confirm("공지를 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'notices', notice.id));
      alert("삭제되었습니다.");
    } catch (err) {
      alert("삭제 실패: " + (err as Error).message);
    }
  };

  const filteredNotices = notices.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-5">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
                <Megaphone className="w-5 h-5 fill-current" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">전사 알림 및 공지</h1>
            </div>
            <p className="text-sm text-slate-500 font-medium">조직의 최신 뉴스와 중요한 업데이트를 확인하세요.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative group">
              <input 
                type="text" 
                placeholder="공지 검색..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-56 pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all font-medium text-slate-700 premium-shadow text-sm"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            
            {isManager && (
              <button 
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 shrink-0 text-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">새 공지</span>
              </button>
            )}
          </div>
        </div>

        {/* Categories / Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
           {[
             { label: 'Unread', count: notices.filter(n => !n.readBy.includes(currentUserId)).length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
             { label: 'Total', count: notices.length, color: 'text-slate-600', bg: 'bg-slate-100' },
             { label: 'Events', count: notices.filter(n => n.category === '행사/워크샵').length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
             { label: 'Rules', count: notices.filter(n => n.category === '규정/절차').length, color: 'text-amber-600', bg: 'bg-amber-50' }
           ].map((stat, i) => (
             <div key={i} className={`p-3 rounded-2xl ${stat.bg} border border-white flex flex-col items-center justify-center`}>
                <span className={`text-[9px] font-black uppercase tracking-widest ${stat.color} opacity-60`}>{stat.label}</span>
                <span className={`text-xl font-black ${stat.color}`}>{stat.count}</span>
             </div>
           ))}
        </div>

        {/* Notice Timeline/List */}
        <div className="space-y-2">
           {filteredNotices.map((notice, idx) => {
             const isUnread = !notice.readBy.includes(currentUserId);
             const isExpanded = expandedNoticeId === notice.id;

             return (
               <div key={notice.id} className="relative group">
                 {/* Timeline Line */}
                 {idx !== filteredNotices.length - 1 && (
                   <div className="absolute left-[31px] top-12 bottom-0 w-0.5 bg-slate-200 hidden md:block opacity-50" />
                 )}

                 <div className="flex gap-4 items-start">
                    {/* Date/Status Indicator */}
                    <div className="hidden md:flex flex-col items-center pt-1">
                       <div className={`w-[64px] h-[54px] rounded-xl flex flex-col items-center justify-center transition-all duration-500 premium-shadow border-2 ${
                         isUnread ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white border-slate-100 text-slate-400'
                       }`}>
                          <span className="text-[9px] font-black leading-none mb-1 uppercase tracking-tighter">
                            {notice.createdAt ? format(new Date(notice.createdAt), 'MM') : '--'}월
                          </span>
                          <span className="text-lg font-black leading-none">
                            {notice.createdAt ? format(new Date(notice.createdAt), 'dd') : '--'}
                          </span>
                       </div>
                    </div>

                    {/* Main Content Card */}
                    <div className={`flex-1 glass-card rounded-[1.5rem] overflow-hidden transition-all duration-500 border border-white premium-shadow hover:scale-[1.005] active:scale-[0.995] cursor-pointer ${
                      isExpanded ? 'bg-white ring-1 ring-indigo-100' : 'hover:bg-white/80'
                    }`}
                    onClick={() => handleNoticeClick(notice.id)}
                    >
                       <div className="p-4 md:p-5">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                             <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase ${
                                    isUnread ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {notice.category}
                                  </span>
                                  {isUnread && (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-rose-500 animate-pulse">
                                      <Bell className="w-2.5 h-2.5 fill-current" />
                                      NEW
                                    </span>
                                  )}
                                </div>
                                <h3 className={`text-base font-black leading-tight tracking-tight ${
                                  isUnread ? 'text-slate-900' : 'text-slate-600'
                                }`}>
                                  {notice.title}
                                </h3>
                             </div>
                             
                             <div className="flex items-center gap-4 text-slate-400">
                                <div className="flex items-center gap-3">
                                   <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                      <User className="w-3 h-3" />
                                      {notice.authorName || '관리자'}
                                   </div>
                                   <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                                      <Clock className="w-3 h-3" />
                                      {notice.createdAt ? format(new Date(notice.createdAt), 'yyyy-MM-dd') : ''}
                                   </div>
                                </div>
                                {(isAdmin || notice.authorId === currentUserId) && (
                                  <div className="flex items-center gap-1 border-l border-slate-100 pl-3">
                                     <button 
                                      onClick={(e) => { e.stopPropagation(); handleOpenModal(notice); }}
                                      className="p-1 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                                     >
                                        <Edit3 className="w-3.5 h-3.5" />
                                     </button>
                                     <button 
                                      onClick={(e) => handleDelete(e, notice)}
                                      className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                     >
                                        <Trash2 className="w-3.5 h-3.5" />
                                     </button>
                                  </div>
                                )}
                                <div className={`p-1.5 rounded-full bg-slate-50 transition-transform duration-500 ${isExpanded ? 'rotate-180 bg-indigo-50 text-indigo-600' : 'text-slate-300'}`}>
                                   <ChevronDown className="w-4 h-4" />
                                </div>
                             </div>
                          </div>

                          <div className={`transition-all duration-700 overflow-hidden ${isExpanded ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                             <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 font-medium text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">
                                {notice.content}
                                
                                {notice.attachmentUrl && (
                                  <div className="mt-5 pt-4 border-t border-slate-200/50">
                                     <a 
                                      href={notice.attachmentUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all group shadow-lg shadow-indigo-100"
                                     >
                                        <FileText className="w-3.5 h-3.5" />
                                        첨부문서: {notice.attachmentName}
                                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                     </a>
                                  </div>
                                )}
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
               </div>
             );
           })}

           {filteredNotices.length === 0 && (
             <div className="py-24 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-inner">
                   <Search className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-400 font-black tracking-tight">검색 결과가 없습니다.</p>
             </div>
           )}
        </div>
      </div>

      {/* 공지 작성/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-indigo-600 text-white">
              <div className="flex items-center gap-3">
                 <Bell className="w-6 h-6 fill-current" />
                 <h2 className="text-2xl font-black tracking-tight">{editingNotice ? '공지사항 수정' : '신규 공지 등록'}</h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">제목</label>
                   <input 
                    type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="공지 제목을 입력하세요"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold"
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">카테고리</label>
                   <select 
                    value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold appearance-none"
                   >
                     <option value="공지">일반 공지</option>
                     <option value="행사/워크샵">행사 / 워크샵</option>
                     <option value="규정/절차">규정 / 절차</option>
                     <option value="복리후생">복리후생</option>
                   </select>
                </div>
              </div>

              <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">상세 내용</label>
                 <textarea 
                  required value={content} onChange={(e) => setContent(e.target.value)}
                  rows={6} placeholder="공지 내용을 상세히 작성하세요..."
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-medium leading-relaxed resize-none text-sm"
                 />
              </div>

              <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">문서 및 이미지 첨부</label>
                 <div className="relative group/upload">
                   <input 
                    type="file" accept=".pdf,image/*" 
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="hidden" id="notice-file-upload"
                   />
                   <label 
                    htmlFor="notice-file-upload"
                    className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-[2rem] transition-all cursor-pointer ${
                      selectedFile ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                   >
                      {selectedFile ? (
                        <>
                          <CheckCircle className="w-10 h-10 text-emerald-500" />
                          <div className="text-center">
                            <p className="text-sm font-black text-slate-700">{selectedFile.name}</p>
                            <p className="text-[10px] text-emerald-600 font-bold">변경하려면 클릭하세요</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-10 h-10 text-slate-300 group-hover/upload:text-indigo-400 transition-colors" />
                          <div className="text-center">
                            <p className="text-sm font-black text-slate-500">클릭하여 파일을 업로드하세요</p>
                            <p className="text-[10px] text-slate-400 font-bold">최대 10MB / PDF 및 이미지 파일 허용</p>
                          </div>
                        </>
                      )}
                   </label>
                 </div>
              </div>

              <div className="pt-4 flex gap-4">
                 <button 
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all"
                 >
                   취소
                 </button>
                 <button 
                  type="submit" disabled={isSubmitting}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                   {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingNotice ? '수정 완료' : '공지 게시')}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
