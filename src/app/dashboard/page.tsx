'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabase';
import { 
  Building2, Users, FileText, CheckCircle, Clock, Calendar, 
  Megaphone, Plus, ArrowRight, X, Edit2, Trash2, Printer 
} from 'lucide-react';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, Announcement } from '@/lib/api';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const userName = profile?.full_name || user?.email?.split('@')[0] || '사용자';
  const companyName = profile?.companies?.name || '우리 회사';
  
  const role = profile?.role || 'member';
  const isManagement = ['system_admin', 'super_admin', 'admin', 'sub_admin'].includes(role);

  // Stats
  const [stats, setStats] = useState({
    pendingExpenses: 0,
    todayLeaves: 0,
    totalMembers: 0,
  });

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);
  const [isEditingAnn, setIsEditingAnn] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');

  useEffect(() => {
    if (!profile) return;
    
    const fetchData = async () => {
      // Fetch stats
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

      // Fetch announcements
      if (profile.company_id) {
        const data = await getAnnouncements(profile.company_id);
        setAnnouncements(data);
      }
    };

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
        // Edit
        await updateAnnouncement(selectedAnn.id, { title: annTitle, content: annContent });
      } else {
        // Create
        await createAnnouncement({
          title: annTitle,
          content: annContent,
          company_id: profile.company_id,
          user_id: profile.id,
          author_name: profile.full_name
        });
      }
      setShowAnnModal(false);
      const data = await getAnnouncements(profile.company_id);
      setAnnouncements(data);
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
      const data = await getAnnouncements(profile.company_id);
      setAnnouncements(data);
    } catch(e) {
      alert('삭제 실패');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-10 rounded-[3rem] shadow-2xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-16 opacity-10 rotate-12">
           <Building2 className="w-64 h-64" />
        </div>
        <div className="relative z-10 space-y-4">
          <p className="text-sm font-black tracking-[0.3em] text-indigo-300 uppercase">{companyName} Workspace</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
            환영합니다, <span className="text-indigo-400">{userName}</span>님!
          </h1>
          <p className="text-slate-300 font-medium tracking-widest text-xs uppercase flex items-center gap-3">
             <Clock className="w-4 h-4" />
             {format(new Date(), 'yyyy년 MM월 dd일 (EEEE)')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Main Area */}
         <div className="lg:col-span-2 space-y-8">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <QuickAction card title="결재내역" icon={<CheckCircle />} href="/dashboard/approvals" color="emerald" />
              <QuickAction card title="지출결의" icon={<FileText />} href="/dashboard/expenses" color="indigo" />
              <QuickAction card title="휴가신청" icon={<Calendar />} href="/dashboard/leaves" color="rose" />
              <QuickAction card title="증명서 발급" icon={<Printer />} href="/dashboard/certificates" color="slate" />
            </div>

            {/* Admin Stats (Conditional) */}
            {isManagement && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
                <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase mb-6 flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center">
                     <Clock className="w-4 h-4" />
                   </div>
                   Overview
                </h2>
                <div className="grid grid-cols-3 gap-6">
                  <Stat label="대기 지출" value={stats.pendingExpenses} suffix="건" />
                  <Stat label="오늘 휴가자" value={stats.todayLeaves} suffix="명" />
                  <Stat label="총 구성원" value={stats.totalMembers} suffix="명" />
                </div>
              </div>
            )}
         </div>

         {/* Sidebar Area (Announcements) */}
         <div className="space-y-8">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm min-h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                     <Megaphone className="w-4 h-4" />
                   </div>
                   공지사항
                 </h2>
                 {isManagement && (
                    <button onClick={openNewAnnouncement} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-colors text-slate-500">
                       <Plus className="w-4 h-4" />
                    </button>
                 )}
              </div>
              
              <div className="space-y-4 flex-1">
                 {announcements.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-300 font-bold uppercase text-xs tracking-widest py-10">
                       새로운 공지사항이 없습니다.
                    </div>
                 ) : (
                    announcements.map(ann => (
                       <button 
                         key={ann.id} 
                         onClick={() => openAnnouncement(ann)}
                         className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group"
                       >
                          <div className="flex justify-between items-start mb-2">
                             <h3 className="font-bold text-sm text-slate-900 line-clamp-1 group-hover:text-amber-600 transition-colors">{ann.title}</h3>
                          </div>
                          <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black text-slate-400">
                             <span>{ann.author_name}</span>
                             <span>{format(new Date(ann.created_at), 'MM.dd')}</span>
                          </div>
                       </button>
                    ))
                 )}
              </div>
            </div>
         </div>
      </div>

      {/* Announcement Modal */}
      {showAnnModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-10 pb-6 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
                 <Megaphone className="w-6 h-6 text-amber-500" />
                 {isEditingAnn ? (selectedAnn ? '공지사항 수정' : '새 공지사항') : '공지사항'}
              </h2>
              <div className="flex gap-2">
                 {!isEditingAnn && isManagement && (selectedAnn?.user_id === profile.id || ['super_admin','admin'].includes(profile.role)) && (
                    <>
                       <button onClick={() => setIsEditingAnn(true)} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 shadow-sm border border-slate-100"><Edit2 className="w-4 h-4" /></button>
                       <button onClick={() => handleDeleteAnn(selectedAnn!.id)} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 shadow-sm border border-slate-100"><Trash2 className="w-4 h-4" /></button>
                    </>
                 )}
                 <button onClick={() => setShowAnnModal(false)} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm border border-slate-100"><X className="w-5 h-5" /></button>
              </div>
            </div>
            
            <div className="p-10 overflow-y-auto space-y-6 flex-1">
               {isEditingAnn ? (
                  <>
                     <input 
                       className="w-full p-4 text-lg font-black bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 border border-slate-100" 
                       placeholder="제목을 입력하세요" 
                       value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} 
                     />
                     <textarea 
                       className="w-full p-4 h-64 text-sm font-medium bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 border border-slate-100 resize-none" 
                       placeholder="내용을 입력하세요..." 
                       value={annContent} onChange={(e) => setAnnContent(e.target.value)} 
                     />
                  </>
               ) : (
                  <>
                     <div className="space-y-2">
                        <h1 className="text-2xl font-bold leading-snug">{selectedAnn?.title}</h1>
                        <p className="text-[11px] font-black tracking-widest uppercase text-slate-400 flex gap-4">
                           <span>작성자: {selectedAnn?.author_name}</span>
                           <span>작성일: {selectedAnn && format(new Date(selectedAnn.created_at), 'yyyy-MM-dd HH:mm')}</span>
                        </p>
                     </div>
                     <div className="w-full h-px bg-slate-100"></div>
                     <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-medium">
                        {selectedAnn?.content}
                     </div>
                  </>
               )}
            </div>

            {isEditingAnn && (
               <div className="p-8 bg-slate-50 border-t border-slate-100 shrink-0">
                  <button onClick={saveAnnouncement} disabled={!annTitle.trim() || !annContent.trim()} className="w-full py-5 bg-amber-500 hover:bg-slate-900 transition-colors text-white font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50">
                     저장하기
                  </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, suffix }: any) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <div className="text-4xl font-black tracking-tighter text-slate-900">
        {value}<span className="text-sm text-slate-400 ml-1">{suffix}</span>
      </div>
    </div>
  );
}

function QuickAction({ title, icon, href, color, card }: any) {
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
