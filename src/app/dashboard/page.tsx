'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabase';
import { 
  Building2, Users, FileText, CheckCircle, Clock, Calendar, 
  Megaphone, Plus, ArrowRight, X, Edit2, Trash2, Printer,
  ChevronRight, AlertCircle, Clock8, CheckCircle2, XCircle
} from 'lucide-react';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, Announcement } from '@/lib/api';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const userName = profile?.full_name || user?.email?.split('@')[0] || '사용자';
  const companyName = profile?.companies?.name || '우리 회사';
  
  const role = profile?.role || 'member';
  const isManagement = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);

  // Stats for Admin
  const [stats, setStats] = useState({
    pendingExpenses: 0,
    todayLeaves: 0,
    totalMembers: 0,
  });

  // Stats for current user (My Approval Status)
  const [myStats, setMyStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0
  });

  // Recent Requests for current user
  const [myRecentRequests, setMyRecentRequests] = useState<any[]>([]);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);
  const [isEditingAnn, setIsEditingAnn] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');

  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!profile) return;
    
    try {
      // 1. Fetch Admin Stats
      if (isManagement) {
        const { count: expCount } = await supabase
          .from('expense_requests')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .in('status', ['PENDING', 'SUB_APPROVED']);
          
        const today = format(new Date(), 'yyyy-MM-dd');
        const { count: leaveCount } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', profile.company_id)
          .eq('status', 'APPROVED')
          .lte('start_date', today)
          .gte('end_date', today);
          
        const { count: memberCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', profile.company_id);

        setStats({
          pendingExpenses: expCount || 0,
          todayLeaves: leaveCount || 0,
          totalMembers: memberCount || 0,
        });
      }

      // 2. Fetch Personal Stats & Recent Requests
      const myId = profile.id;
      const tables = ['expense_requests', 'leave_requests', 'overtime_requests'];
      
      const allMyRequestsPromises = tables.map(table => 
        supabase
          .from(table)
          .select('*')
          .eq('user_id', myId)
      );

      const results = await Promise.all(allMyRequestsPromises);
      const flattened = results.flatMap((res, idx) => 
        (res.data || []).map(item => ({ 
          ...item, 
          _type: tables[idx].split('_')[0] 
        }))
      );

      // Status Counts
      const pendingCount = flattened.filter(r => ['PENDING', 'SUB_APPROVED'].includes(r.status)).length;
      const approvedCount = flattened.filter(r => r.status === 'APPROVED').length;
      const rejectedCount = flattened.filter(r => r.status === 'REJECTED').length;

      setMyStats({
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount
      });

      // Recent 5 requests
      const recent = flattened
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      
      setMyRecentRequests(recent);

      // 3. Fetch announcements
      if (profile.company_id) {
        const data = await getAnnouncements(profile.company_id);
        setAnnouncements(data);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profile, isManagement]);

  const openAnnouncement = (ann: Announcement) => {
    setSelectedAnn(ann);
    setIsEditingAnn(false);
    setAnnTitle(ann.title);
    setAnnContent(ann.content);
    setShowAnnModal(true);
  };

  const openNewAnnouncement = () => {
    setSelectedAnn(null);
    setIsEditingAnn(true);
    setAnnTitle('');
    setAnnContent('');
    setShowAnnModal(true);
  };

  const saveAnnouncement = async () => {
    if (!profile) return;
    try {
      if (selectedAnn) {
        await updateAnnouncement(selectedAnn.id, { title: annTitle, content: annContent });
      } else {
        await createAnnouncement({
          title: annTitle,
          content: annContent,
          company_id: profile.company_id,
          user_id: profile.id,
          author_name: profile.full_name
        });
      }
      setShowAnnModal(false);
      fetchData();
    } catch (e) {
      alert('저장 실패');
    }
  };

  const handleDeleteAnn = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    if (!profile) return;
    try {
      await deleteAnnouncement(id);
      setShowAnnModal(false);
      fetchData();
    } catch(e) {
      alert('삭제 실패');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      {/* 웰컴 섹션 */}
      <div className="relative group overflow-hidden bg-slate-900 rounded-[3rem] p-12 shadow-2xl">
        <div className="absolute top-0 right-0 p-16 opacity-5 rotate-12 group-hover:rotate-6 transition-transform duration-700">
           <Building2 className="w-80 h-80" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="space-y-4 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] font-black tracking-[0.2em] text-indigo-300 uppercase">{companyName} Workspace</p>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              환영합니다, <span className="text-indigo-400 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 font-black">{userName}</span>님!
            </h1>
            <p className="text-slate-400 font-bold tracking-widest text-xs uppercase flex items-center justify-center md:justify-start gap-3">
               <Clock className="w-4 h-4 text-indigo-400" />
               {format(new Date(), 'yyyy년 MM월 dd일 (EEEE)')}
            </p>
          </div>
          
          {/* 퀵 액션 */}
          <div className="flex gap-4">
             <Link href="/dashboard/expenses" className="w-14 h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center text-white transition-all hover:scale-110" title="지출결의">
                <FileText className="w-6 h-6" />
             </Link>
             <Link href="/dashboard/leaves" className="w-14 h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center text-white transition-all hover:scale-110" title="휴가신청">
                <Calendar className="w-6 h-6" />
             </Link>
             <Link href="/dashboard/overtime" className="w-14 h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center text-white transition-all hover:scale-110" title="초과근무">
                <Clock8 className="w-6 h-6" />
             </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         {/* 왼쪽 영역: 내 현황 및 내역 (8컬럼) */}
         <div className="lg:col-span-8 space-y-8">
            
            {/* 내 결재 현황 요약 */}
            <section className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                  <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                  내 결재 진행상태
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <MyStatCard label="진행중" value={myStats.pending} icon={<Clock className="w-5 h-5" />} color="amber" />
                <MyStatCard label="승인완료" value={myStats.approved} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
                <MyStatCard label="반려내역" value={myStats.rejected} icon={<XCircle className="w-5 h-5" />} color="rose" />
              </div>
            </section>

            {/* 최근 신청 내역 리스트 */}
            <section className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                    <FileText className="w-6 h-6 text-slate-400" />
                    최근 신청 내역
                  </h2>
                  <div className="flex gap-2">
                    <Link href="/dashboard/approvals" className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest flex items-center gap-1 transition-colors">
                      전체보기 <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
               </div>

               <div className="space-y-3">
                  {myRecentRequests.length === 0 ? (
                    <div className="py-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest">
                      최근 신청 내역이 없습니다.
                    </div>
                  ) : (
                    myRecentRequests.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between p-5 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group">
                        <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs ${
                            req._type === 'expense' ? 'bg-indigo-50 text-indigo-600' :
                            req._type === 'leave' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {req._type === 'expense' ? '지출' : req._type === 'leave' ? '휴가' : '연장'}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 line-clamp-1">{req.description || req.reason || req.date || '항목 없음'}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                              {format(new Date(req.created_at), 'yyyy.MM.dd HH:mm')}
                            </p>
                          </div>
                        </div>
                        <div className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                          req.status === 'REJECTED' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600 animate-pulse'
                        }`}>
                          {req.status === 'PENDING' ? '대기중' : (req.status === 'SUB_APPROVED' ? '1차승인' : (req.status === 'APPROVED' ? '승인완료' : '반려'))}
                        </div>
                      </div>
                    ))
                  )}
               </div>
            </section>
         </div>

         {/* 오른쪽 영역: 공지사항 (4컬럼) */}
         <div className="lg:col-span-4 space-y-8">
            {/* 관리자 지표 (관리자인 경우만 표시) */}
            {isManagement && (
              <div className="bg-slate-900 p-8 rounded-[3rem] shadow-xl text-white overflow-hidden relative group">
                <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:scale-125 transition-transform duration-500">
                  <Users className="w-40 h-40" />
                </div>
                <h2 className="text-xs font-black text-indigo-300 tracking-[0.2em] uppercase mb-8">Management Overview</h2>
                <div className="grid grid-cols-1 gap-8">
                   <div className="flex justify-between items-end border-b border-white/5 pb-4">
                      <span className="text-[10px] font-black text-slate-500 uppercase">대기 결재</span>
                      <span className="text-3xl font-black tracking-tighter text-indigo-400">{stats.pendingExpenses}<small className="text-xs ml-1">건</small></span>
                   </div>
                   <div className="flex justify-between items-end border-b border-white/5 pb-4">
                      <span className="text-[10px] font-black text-slate-500 uppercase">오늘 휴가</span>
                      <span className="text-3xl font-black tracking-tighter text-purple-400">{stats.todayLeaves}<small className="text-xs ml-1">명</small></span>
                   </div>
                   <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black text-slate-500 uppercase">구성원수</span>
                      <span className="text-3xl font-black tracking-tighter text-white">{stats.totalMembers}<small className="text-xs ml-1">명</small></span>
                   </div>
                </div>
              </div>
            )}

            {/* 공지사항 */}
            <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm min-h-[500px] flex flex-col">
              <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-6">
                 <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                   <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                     <Megaphone className="w-5 h-5" />
                   </div>
                   공지사항
                 </h2>
                 {isManagement && (
                    <button onClick={openNewAnnouncement} className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all text-slate-500 shadow-sm">
                       <Plus className="w-5 h-5" />
                    </button>
                 )}
              </div>
              
              <div className="space-y-3 flex-1">
                 {announcements.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-200 font-bold uppercase text-[10px] tracking-widest py-20">
                       새 공지사항이 없습니다.
                    </div>
                 ) : (
                    announcements.map(ann => (
                       <button 
                         key={ann.id} 
                         onClick={() => openAnnouncement(ann)}
                         className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group flex flex-col gap-2"
                       >
                          <h3 className="font-extrabold text-[13px] text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{ann.title}</h3>
                          <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black text-slate-400">
                             <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[8px]">{ann.author_name?.[0]}</div>
                                {ann.author_name}
                             </div>
                             <span>{format(new Date(ann.created_at), 'MM월 dd일')}</span>
                          </div>
                       </button>
                    ))
                 )}
              </div>
            </div>
         </div>
      </div>

      {/* Announcement Modal (기존 코드 유지) */}
      {showAnnModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-xl">
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-400 flex flex-col max-h-[90vh]">
            <div className="p-12 pb-8 flex justify-between items-center bg-slate-50/50 shrink-0 border-b border-slate-100">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-4">
                 <Megaphone className="w-8 h-8 text-amber-500" />
                 {isEditingAnn ? (selectedAnn ? '공지사항 수정' : '새 공지사항') : '공지사항'}
              </h2>
              <div className="flex gap-3">
                 {!isEditingAnn && isManagement && (selectedAnn?.user_id === profile?.id || ['super_admin','admin'].includes(profile?.role || '')) && (
                    <>
                       <button onClick={() => setIsEditingAnn(true)} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 shadow-md border border-slate-100 transition-all"><Edit2 className="w-5 h-5" /></button>
                       <button onClick={() => handleDeleteAnn(selectedAnn!.id)} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-rose-600 shadow-md border border-slate-100 transition-all"><Trash2 className="w-5 h-5" /></button>
                    </>
                 )}
                 <button onClick={() => setShowAnnModal(false)} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-md border border-slate-100 transition-all"><X className="w-6 h-6" /></button>
              </div>
            </div>
            
            <div className="p-12 overflow-y-auto space-y-8 flex-1">
               {isEditingAnn ? (
                  <>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">공지 제목</label>
                        <input 
                          className="w-full p-6 text-xl font-extrabold bg-slate-50 rounded-[1.5rem] outline-none border border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all" 
                          placeholder="제목을 입력하세요" 
                          value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} 
                        />
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">내용</label>
                        <textarea 
                          className="w-full p-6 h-80 text-base font-bold bg-slate-50 rounded-[1.5rem] outline-none border border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all resize-none leading-relaxed" 
                          placeholder="내용을 입력하세요..." 
                          value={annContent} onChange={(e) => setAnnContent(e.target.value)} 
                        />
                     </div>
                  </>
               ) : (
                  <>
                     <div className="space-y-3">
                        <h1 className="text-3xl font-black leading-tight text-slate-900">{selectedAnn?.title}</h1>
                        <div className="flex items-center gap-6">
                          <p className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-500 flex items-center gap-2">
                             <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">{selectedAnn?.author_name?.[0]}</div>
                             {selectedAnn?.author_name}
                          </p>
                          <p className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-400 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            {selectedAnn && format(new Date(selectedAnn.created_at), 'yyyy-MM-dd HH:mm')}
                          </p>
                        </div>
                     </div>
                     <div className="w-full h-px bg-slate-100"></div>
                     <div className="whitespace-pre-wrap text-base text-slate-700 leading-loose font-bold">
                        {selectedAnn?.content}
                     </div>
                  </>
               )}
            </div>

            {isEditingAnn && (
               <div className="p-10 bg-slate-50 border-t border-slate-100 shrink-0">
                  <button onClick={saveAnnouncement} disabled={!annTitle.trim() || !annContent.trim()} className="w-full py-6 bg-slate-900 hover:bg-slate-800 transition-all text-white font-black uppercase tracking-[0.3em] text-[11px] rounded-[1.5rem] disabled:opacity-20 shadow-xl shadow-slate-200">
                     저장 및 게시하기
                  </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MyStatCard({ label, value, icon, color }: any) {
  const colors: Record<string, string> = {
    amber: 'from-amber-50 to-amber-100/30 text-amber-700 border-amber-100',
    emerald: 'from-emerald-50 to-emerald-100/30 text-emerald-700 border-emerald-100',
    rose: 'from-rose-50 to-rose-100/30 text-rose-700 border-rose-100',
  };

  return (
    <div className={`p-8 rounded-[2.5rem] border bg-gradient-to-br transition-all hover:scale-105 hover:shadow-xl ${colors[color]}`}>
      <div className="flex items-center justify-between mb-6">
        <div className={`w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <div className="text-4xl font-black tracking-tighter">{value}</div>
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest opacity-60">{label}</span>
    </div>
  );
}
function QuickAction({ title, icon, href, color }: any) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white border-emerald-100',
    indigo: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white border-indigo-100',
    rose: 'text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white border-rose-100',
    slate: 'text-slate-600 bg-slate-50 hover:bg-slate-900 hover:text-white border-slate-200',
  };

  return (
    <Link href={href} className={`p-6 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 border shadow-sm group ${colors[color]}`}>
      <div className="w-12 h-12 rounded-full bg-white/50 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
        {React.cloneElement(icon, { className: 'w-5 h-5' })}
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest">{title}</span>
    </Link>
  );
}
