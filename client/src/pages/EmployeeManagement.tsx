import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Building, Filter, Trash2, UserX, UserCheck, Key, 
  ChevronRight, Loader2, ShieldAlert,
  Calendar, X
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  getDocs, writeBatch 
} from 'firebase/firestore';
import { auth, db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';

interface Employee {
  uid: string;
  name: string;
  email: string;
  role: string;
  divisionId?: string;
  teamId?: string;
  status?: 'ACTIVE' | 'RESIGNED';
  joinDate?: string;
  rrn?: string;
  phone?: string;
  address?: string;
  personalEmail?: string;
}

interface AttendanceRecord {
  id: string;
  type: 'IN' | 'OUT';
  timestamp: string;
  location?: string;
}

export const EmployeeManagement: React.FC = () => {
  const { userData } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [selectedEmpRecords, setSelectedEmpRecords] = useState<{emp: Employee, records: AttendanceRecord[]} | null>(null);
  const [deleteConfirmEmp, setDeleteConfirmEmp] = useState<Employee | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Personnel Info
  const [editingInfo, setEditingInfo] = useState({ rrn: '', address: '', phone: '', personalEmail: '' });
  const [isSaving, setIsSaving] = useState(false);
  const isAdmin = userData?.role === 'ADMIN';

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyId = userData.companyId;

    // 1. Fetch Organization Data (companyId ê¸°ë°˜ ê²©ë¦¬)
    const unsubDivs = onSnapshot(query(collection(db, 'divisions'), where('companyId', '==', companyId)), (snap) => {
      setDivisions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('companyId', '==', companyId)), (snap) => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Subscribe to Employees
    const q = query(collection(db, 'UserProfile'), where('companyId', '==', companyId));
    const unsubEmployees = onSnapshot(q, (snap) => {
      const emps = snap.docs.map(d => ({ uid: d.id, ...d.data() } as Employee));
      setEmployees(emps.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });

    return () => { unsubDivs(); unsubTeams(); unsubEmployees(); };
  }, [userData?.companyId]);

  // Filtered List with De-duplication
  const filteredEmployees = (() => {
    // 1. ?´ë©”??ê¸°ì??¼ë¡œ ê·¸ë£¹?”í•˜??ì¤‘ë³µ ?œê±° (ê°€???’ì? ê¶Œí•œ ?°ì„ )
    const grouped = employees.reduce((acc, emp) => {
      const email = emp.email?.toLowerCase().trim();
      if (!email) return acc;
      
      if (!acc[email]) {
        acc[email] = emp;
      } else {
        const roleOrder: Record<string, number> = { 'ADMIN': 3, 'SUB_ADMIN': 2, 'MEMBER': 1 };
        const currentPrio = roleOrder[acc[email].role] || 0;
        const newPrio = roleOrder[emp.role] || 0;
        if (newPrio > currentPrio) {
          acc[email] = emp;
        }
      }
      return acc;
    }, {} as Record<string, Employee>);

    // 2. ?„í„°ë§?ë°??•ë ¬ ?ìš©
    return Object.values(grouped)
      .filter(emp => {
        const matchesDiv = selectedDivision === 'ALL' || emp.divisionId === selectedDivision;
        const matchesTeam = selectedTeam === 'ALL' || emp.teamId === selectedTeam;
        const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              emp.email.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesDiv && matchesTeam && matchesSearch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const handleOpenDetail = async (emp: Employee) => {
    setEditingInfo({
      rrn: emp.rrn || '',
      address: emp.address || '',
      phone: emp.phone || '',
      personalEmail: emp.personalEmail || ''
    });
    setSelectedEmpRecords({ emp, records: [] });
  };

  const handleSavePersonalInfo = async () => {
    if (!selectedEmpRecords || !isAdmin) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, 'UserProfile', selectedEmpRecords.emp.uid);
      await updateDoc(userRef, {
        ...editingInfo
      });
      alert('ê°œì¸?•ë³´ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.');
      // Update local state to reflect changes without reload
      setSelectedEmpRecords(prev => prev ? {
        ...prev,
        emp: { ...prev.emp, ...editingInfo }
      } : null);
    } catch (e) {
      alert('?€???¤íŒ¨: ' + (e as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (emp: Employee, newStatus: 'ACTIVE' | 'RESIGNED') => {
    const isActactivating = newStatus === 'ACTIVE';
    const confirmMsg = isActactivating 
      ? `[?…ë¬´?•ì? ?´ì œ] ${emp.name}?˜ì˜ ê³„ì •???¤ì‹œ ?œì„±?”í•˜?œê² ?µë‹ˆê¹?`
      : `[?´ì‚¬(?…ë¬´?•ì?) ì²˜ë¦¬] ${emp.name}?˜ì˜ ê³„ì •???•ì??˜ì‹œê² ìŠµ?ˆê¹Œ? ê¸°ë¡?€ ? ì??˜ì?ë§?ë¡œê·¸?¸ì´ ì°¨ë‹¨?©ë‹ˆ??`;

    if (!window.confirm(confirmMsg)) return;
    
    try {
      await updateDoc(doc(db, 'UserProfile', emp.uid), { status: newStatus });
      alert(isActactivating ? 'ê³„ì •???œì„±?”ë˜?ˆìŠµ?ˆë‹¤.' : '?´ì‚¬(?…ë¬´?•ì?) ì²˜ë¦¬ê°€ ?„ë£Œ?˜ì—ˆ?µë‹ˆ??');
    } catch (e) {
      alert('?¤ë¥˜ ë°œìƒ: ' + (e as Error).message);
    }
  };

  const handleDeleteAll = async () => {
    if (!deleteConfirmEmp || !adminPassword) return;
    setIsProcessing(true);
    
    try {
      // 0. Verify Admin Password (Re-auth)
      try {
        await signInWithEmailAndPassword(auth, userData?.email || '', adminPassword);
      } catch (err) {
        throw new Error('ë¹„ë?ë²ˆí˜¸ê°€ ?¼ì¹˜?˜ì? ?ŠìŠµ?ˆë‹¤.');
      }

      const emp = deleteConfirmEmp;
      const batch = writeBatch(db);

      // 1. Delete Attendance
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('userId', '==', emp.uid)));
      attSnap.forEach(d => batch.delete(d.ref));

      // 2. Delete Leaves
      const leaveSnap = await getDocs(query(collection(db, 'leaves'), where('userId', '==', emp.uid)));
      leaveSnap.forEach(d => batch.delete(d.ref));

      // 3. Delete Expenses
      const expSnap = await getDocs(query(collection(db, 'expenses'), where('userId', '==', emp.uid)));
      expSnap.forEach(d => batch.delete(d.ref));

      // 4. Delete Profile
      batch.delete(doc(db, 'UserProfile', emp.uid));

      await batch.commit();
      alert(`[?? œ ?„ë£Œ] ${emp.name}?˜ì˜ ëª¨ë“  ?•ë³´ê°€ ?? œ?˜ì—ˆ?µë‹ˆ??`);
      setDeleteConfirmEmp(null);
      setAdminPassword('');
    } catch (e) {
      alert('?? œ ì¤??¤ë¥˜ ë°œìƒ: ' + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitializePassword = async (emp: Employee) => {
    if (!window.confirm(`${emp.name}?˜ì˜ ë¹„ë?ë²ˆí˜¸ë¥?'123456'?¼ë¡œ ì´ˆê¸°?”í•˜?œê² ?µë‹ˆê¹?\n(?¤ì œ ë¡œê·¸??ë¹„ë?ë²ˆí˜¸ê°€ ê°•ì œ ë³€ê²½ë©?ˆë‹¤.)`)) return;
    
    try {
      // 1. Firebase Cloud Function???µí•´ ?¤ì œ Auth ë¹„ë?ë²ˆí˜¸ ë³€ê²??œë„
      const adminResetPassword = httpsCallable(functions, 'adminResetPassword');
      const result: any = await adminResetPassword({ uid: emp.uid, password: '123456' });

      if (!result.data.success) {
        throw new Error(result.data.message || 'ë¹„ë?ë²ˆí˜¸ ì´ˆê¸°??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.');
      }

      // 2. Firestore ?íƒœ ?…ë°?´íŠ¸ (ë¡œê·¸????ë¹„ë?ë²ˆí˜¸ ë³€ê²?? ë„)
      await updateDoc(doc(db, 'UserProfile', emp.uid), { 
        mustChangePassword: true 
      });

      alert(`ë¹„ë?ë²ˆí˜¸ ì´ˆê¸°??: ?¬ì„¤??ë¹„ë?ë²ˆí˜¸??'123456'?…ë‹ˆ??\n?´ì œ ?´ë‹¹ ?•ë³´ë¡?ë¡œê·¸?¸ì´ ê°€?¥í•©?ˆë‹¤.`);
    } catch (e: any) {
      console.error('Password reset failed:', e);
      let errorMsg = e.message;
      
      // ?¬ìš©?ì—ê²?ì¹œìˆ™???ëŸ¬ ë©”ì‹œì§€ ì²˜ë¦¬
      if (e.code === 'permission-denied') {
        errorMsg = 'ê´€ë¦¬ì ê¶Œí•œ???†ìŠµ?ˆë‹¤.';
      } else if (e.code === 'unauthenticated') {
        errorMsg = '?¤ì‹œ ë¡œê·¸?¸í•´ ì£¼ì„¸??';
      }
      
      alert(`[?¤ë¥˜] ë¹„ë?ë²ˆí˜¸ ì´ˆê¸°???¤íŒ¨\n?ì¸: ${errorMsg}`);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                <Users className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">?„ì²´ êµ¬ì„±??ê´€ë¦?/h1>
            </div>
            <p className="text-slate-500 font-medium whitespace-pre-wrap">ì§ì›??ê·¼íƒœ ì¡°íšŒ, ?´ì‚¬ ì²˜ë¦¬ ë°?ë³´ì•ˆ ?¤ì •???µí•© ê´€ë¦¬í•©?ˆë‹¤.</p>
          </div>

          <div className="flex items-center gap-4">
            {loading && (
              <div className="flex items-center gap-2 text-indigo-500 bg-indigo-50 px-4 py-2 rounded-xl animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-black uppercase tracking-tighter">Syncing...</span>
              </div>
            )}
            <div className="relative group w-full lg:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="?´ë¦„ ?ëŠ” ?´ë©”?¼ë¡œ ê²€??.."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-bold text-slate-800"
            />
          </div>
        </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Building className="w-5 h-5" /></div>
            <select 
              value={selectedDivision}
              onChange={(e) => { setSelectedDivision(e.target.value); setSelectedTeam('ALL'); }}
              className="flex-1 bg-transparent border-none outline-none font-black text-slate-700 text-sm appearance-none cursor-pointer"
            >
              <option value="ALL">?„ì²´ ë³¸ë?</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Filter className="w-5 h-5" /></div>
            <select 
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              disabled={selectedDivision === 'ALL'}
              className="flex-1 bg-transparent border-none outline-none font-black text-slate-700 text-sm appearance-none cursor-pointer disabled:opacity-30"
            >
              <option value="ALL">ë³¸ë? ???„ì²´ ?€</option>
              {teams.filter(t => t.divisionId === selectedDivision).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-indigo-600 p-4 rounded-2xl text-white shadow-xl flex items-center justify-between px-6">
             <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Total Members</span>
             <span className="text-2xl font-black">{filteredEmployees.length} ëª?/span>
          </div>
        </div>

        {/* List Card */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">ì§ì› ?•ë³´ / ?Œì†</th>
                  <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">ì§ì±… / ?…ì‚¬??/th>
                  <th className="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">ê³„ì • ?íƒœ</th>
                  <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">ê´€ë¦??¡ì…˜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map(emp => {
                  const div = divisions.find(d => d.id === emp.divisionId)?.name || 'ê¸°í?';
                  const team = teams.find(t => t.id === emp.teamId)?.name || '?€ ?†ìŒ';
                  const isResigned = emp.status === 'RESIGNED';

                  return (
                    <tr key={emp.uid} className={`group hover:bg-slate-50/80 transition-all ${isResigned ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => handleOpenDetail(emp)}>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black shadow-sm group-hover:rotate-6 transition-all ${isResigned ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white'}`}>
                            {emp.name[0]}
                          </div>
                          <div>
                            <div className={`text-md font-black tracking-tight ${isResigned ? 'text-slate-400' : 'text-slate-800'}`}>{emp.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                               <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 whitespace-nowrap">{div}</span>
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">{team}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className={`text-sm font-black ${isResigned ? 'text-slate-300' : 'text-slate-700'}`}>{emp.role}</div>
                         <div className="text-[10px] text-slate-400 font-bold mt-1 flex items-center gap-1">
                           <Calendar className="w-3 h-3" /> {emp.joinDate || '-'} ?…ì‚¬
                         </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          {isResigned ? (
                            <span className="px-3 py-1 bg-rose-50 text-rose-500 text-[10px] font-black rounded-full border border-rose-100">?´ì‚¬(?…ë¬´?•ì?)</span>
                          ) : (
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-500 text-[10px] font-black rounded-full border border-emerald-100">?•ìƒ</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-2 text-slate-300">
                          <button 
                            onClick={() => handleInitializePassword(emp)}
                            className="p-2.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all" 
                            title="ë¹„ë?ë²ˆí˜¸ ì´ˆê¸°??(123456)"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleToggleStatus(emp, isResigned ? 'ACTIVE' : 'RESIGNED')}
                            className={`p-2.5 rounded-xl transition-all ${
                              isResigned ? 'hover:bg-emerald-50 hover:text-emerald-600' : 'hover:bg-amber-50 hover:text-amber-600'
                            }`}
                            title={isResigned ? '?…ë¬´?•ì? ?´ì œ' : '?´ì‚¬(?…ë¬´?•ì?) ì²˜ë¦¬'}
                          >
                            {isResigned ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmEmp(emp)}
                            className="p-2.5 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                            title="?„ì²´ ê¸°ë¡ ?? œ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="w-px h-4 bg-slate-100 mx-2"></div>
                          <button 
                            onClick={() => handleOpenDetail(emp)}
                            className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-sm"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedEmpRecords && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col max-h-[90vh]">
            <div className="p-10 border-b border-slate-50 flex justify-between items-start shrink-0">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase tracking-widest">Management Console</div>
                   {selectedEmpRecords.emp.status === 'RESIGNED' && <span className="px-3 py-1 bg-rose-50 text-rose-500 text-[10px] font-black rounded-full border border-rose-100 uppercase tracking-widest">Resigned</span>}
                </div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{selectedEmpRecords.emp.name}?˜ì˜ ?ì„¸ ?•ë³´</h2>
              </div>
              <button onClick={() => setSelectedEmpRecords(null)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all"><X className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 premium-scrollbar">
              <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ì£¼ë??±ë¡ë²ˆí˜¸</label>
                        <input 
                          type="text"
                          value={editingInfo.rrn}
                          onChange={(e) => setEditingInfo({...editingInfo, rrn: e.target.value})}
                          disabled={!isAdmin}
                          placeholder="?? 800101-*******"
                          className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ê°œì¸ ?´ë©”??/label>
                        <input 
                          type="email"
                          value={editingInfo.personalEmail}
                          onChange={(e) => setEditingInfo({...editingInfo, personalEmail: e.target.value})}
                          disabled={!isAdmin}
                          placeholder="personal@email.com"
                          className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ë¹„ìƒ ?°ë½ì²?(?„í™”ë²ˆí˜¸)</label>
                        <input 
                          type="text"
                          value={editingInfo.phone}
                          onChange={(e) => setEditingInfo({...editingInfo, phone: e.target.value})}
                          disabled={!isAdmin}
                          placeholder="010-0000-0000"
                          className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold disabled:opacity-60"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ê±°ì£¼ì§€ ì£¼ì†Œ</label>
                        <textarea 
                          rows={3}
                          value={editingInfo.address}
                          onChange={(e) => setEditingInfo({...editingInfo, address: e.target.value})}
                          disabled={!isAdmin}
                          placeholder="?ì„¸ ì£¼ì†Œë¥??…ë ¥?˜ì„¸??
                          className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold disabled:opacity-60 resize-none"
                        />
                    </div>
                  </div>

                  {isAdmin && (
                    <button 
                      onClick={handleSavePersonalInfo}
                      disabled={isSaving}
                      className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                      ?¸ì‚¬ ?•ë³´ ?€?¥í•˜ê¸?                    </button>
                  )}
                  
                  {!isAdmin && (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-500" />
                        <p className="text-xs font-bold text-amber-600">???•ë³´??ìµœê³  ê´€ë¦¬ì(ADMIN)ë§??˜ì •?????ˆìŠµ?ˆë‹¤.</p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmEmp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden text-center p-12 space-y-8 animate-in zoom-in-95">
             <div className="w-20 h-20 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mx-auto shadow-inner">
                <ShieldAlert className="w-10 h-10" />
             </div>
             
             <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">?°ì´???êµ¬ ?? œ</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">
                  <span className="text-rose-600 font-black">{deleteConfirmEmp.name}</span>?˜ì˜ ëª¨ë“  ?°ì´??ì¶œí‡´ê·? ?´ê?, ì§€ì¶œê²°??ê°€ <span className="underline decoration-rose-200 decoration-w-2">?êµ¬?ìœ¼ë¡??? œ</span>?˜ë©° ë³µêµ¬?????†ìŠµ?ˆë‹¤.
                </p>
             </div>

             <div className="space-y-4">
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="password"
                    placeholder="ê´€ë¦¬ì ë¹„ë?ë²ˆí˜¸ë¥??…ë ¥?˜ì„¸??
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-2xl border-2 border-slate-100 outline-none focus:border-indigo-500 transition-all font-bold"
                  />
                </div>
                
                <div className="flex gap-3">
                   <button 
                    onClick={() => { setDeleteConfirmEmp(null); setAdminPassword(''); }}
                    className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all"
                   >
                     ì·¨ì†Œ
                   </button>
                   <button 
                    onClick={handleDeleteAll}
                    disabled={!adminPassword || isProcessing}
                    className="flex-2 px-10 py-4 bg-rose-600 text-white font-black rounded-2xl shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                   >
                     {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                     ?°ì´???? œ ?¹ì¸
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};
