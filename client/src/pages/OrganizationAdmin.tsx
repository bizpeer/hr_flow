import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, Users, UserPlus, 
  Trash2, Building, X, Search, ChevronRight, Briefcase, ShieldCheck, History
} from 'lucide-react';
import { 
  collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, updateDoc,
  query, where, getDocs 
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';

interface Division {
  id: string;
  name: string;
  headId: string;
}

interface Team {
  id: string;
  divisionId: string;
  name: string;
  leaderId: string;
}

interface Employee {
  uid: string;
  name: string;
  email: string;
  teamId?: string;
  role: string;
  teamHistory: any[];
  joinDate?: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  actionType: string;
  performedBy: string;
  targetId: string;
  targetName: string;
  details: string;
}

export const OrganizationAdmin: React.FC = () => {
  const { userData, systemDomain, getDisplayEmail } = useAuthStore();
  const navigate = useNavigate();
  const isMasterAdmin = userData?.role === 'ADMIN';

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Î™®Îã¨ ?úÏñ¥??  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  // ?ÖÎ†• ?ÑÎìú??  const [newDivName, setNewDivName] = useState('');
  const [newTeamDivId, setNewTeamDivId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newEmp, setNewEmp] = useState({ name: '', email: '', teamId: '', joinDate: new Date().toISOString().split('T')[0] });

  // ?ïÎ≥¥ ?òÏ†ï??(?ÑÎ™Ö/?¥Îèô)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // ?¥Î†• Ï°∞Ìöå Î∞???†ú??  const [selectedEmpForLogs, setSelectedEmpForLogs] = useState<Employee | null>(null);
  const [showLogDeleteConfirm, setShowLogDeleteConfirm] = useState(false);
  const [deleteLogsPassword, setDeleteLogsPassword] = useState('');
  const [isProcessingLogs, setIsProcessingLogs] = useState(false);
  const [logSearchResults, setLogSearchResults] = useState<AuditLog[] | null>(null);

  // Î∂ÄÍ¥ÄÎ¶¨Ïûê(SUB_ADMIN) ?ëÍ∑º Ï∞®Îã® Î¶¨Îã§?¥Î†â??  useEffect(() => {
    if (userData && userData.role === 'SUB_ADMIN') {
      alert('Ï°∞ÏßÅ Í¥ÄÎ¶?Î©îÎâ¥???Ä???ëÍ∑º Í∂åÌïú???ÜÏäµ?àÎã§.');
      navigate('/attendance');
    }
  }, [userData, navigate]);

  // Firestore ?∞Ïù¥???§ÏãúÍ∞?Íµ¨ÎèÖ (companyId Í∏∞Î∞ò Í≤©Î¶¨)
  useEffect(() => {
    if (!userData?.companyId) return;
    const companyId = userData.companyId;
    setLoading(true);

    const handleError = (error: any) => {
      console.error("Firestore Subscription Error:", error);
      setLoading(false);
    };

    const unsubDivs = onSnapshot(query(collection(db, 'divisions'), where('companyId', '==', companyId)), (snap) => {
      setDivisions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
      setLoading(false);
    }, handleError);

    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('companyId', '==', companyId)), (snap) => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    }, handleError);

    const unsubUsers = onSnapshot(query(collection(db, 'UserProfile'), where('companyId', '==', companyId)), (snap) => {
      setEmployees(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Employee)));
      setLoading(false);
    }, handleError);

    const unsubLogs = onSnapshot(query(collection(db, 'AuditLogs'), where('companyId', '==', companyId)), (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
      setAuditLogs(logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    }, handleError);

    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      unsubDivs(); unsubTeams(); unsubUsers(); unsubLogs();
      clearTimeout(timeoutId);
    };
  }, [userData?.companyId]);

  const logAction = async (type: string, targetId: string, targetName: string, details: string) => {
    try {
      await addDoc(collection(db, 'AuditLogs'), {
        timestamp: new Date().toISOString(),
        actionType: type,
        performedBy: userData?.name || '?úÏä§??,
        targetId, targetName, details,
        companyId: userData?.companyId || ''
      });
    } catch (err) {
      console.error("Log failed:", err);
    }
  };

  const filteredTeams = selectedDivision
    ? teams.filter((team) => team.divisionId === selectedDivision)
    : teams;

  const unassignedEmployees = employees.filter(emp => !emp.teamId || emp.teamId === '');

  const handleCreateDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDivName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'divisions'), { name: newDivName, headId: '', companyId: userData?.companyId || '' });
      await logAction('CREATE_DIVISION', docRef.id, newDivName, '??Î≥∏Î? ?ùÏÑ±');
      setNewDivName(''); setShowDivisionModal(false);
    } catch (err) {
      alert("Î≥∏Î? ?ùÏÑ± ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamDivId) return;
    try {
      const docRef = await addDoc(collection(db, 'teams'), { divisionId: newTeamDivId, name: newTeamName, leaderId: '', companyId: userData?.companyId || '' });
      const divName = divisions.find(d => d.id === newTeamDivId)?.name || '?????ÜÏùå';
      await logAction('CREATE_TEAM', docRef.id, newTeamName, `${divName} ?åÏÜç ?Ä ?ùÏÑ±`);
      setNewTeamName(''); setNewTeamDivId(''); setShowTeamModal(false);
    } catch (err) {
      alert("?Ä ?ùÏÑ± ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const loginInput = newEmp.email.trim().toLowerCase();
      const finalEmail = loginInput.includes('@') ? loginInput : `${loginInput}@${systemDomain}`;

      // 1. Ï§ëÎ≥µ ?ÑÏù¥??Ï≤¥ÌÅ¨
      const q = query(collection(db, 'UserProfile'), where('email', '==', finalEmail), where('companyId', '==', userData?.companyId || ''));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        alert(`[Ï§ëÎ≥µ ?§Î•ò] '${finalEmail}' ?ÑÏù¥?îÎäî ?¥Î? ?±Î°ù?òÏñ¥ ?àÏäµ?àÎã§.\n?§Î•∏ ?ÑÏù¥?îÎ? ?¨Ïö©??Ï£ºÏÑ∏??`);
        return;
      }

      const tempId = `temp_${Date.now()}`;
      const selectedTeam = teams.find(t => t.id === newEmp.teamId);
      const divisionId = selectedTeam?.divisionId || '';

      await setDoc(doc(db, 'UserProfile', tempId), {
        name: newEmp.name,
        email: finalEmail,
        role: 'MEMBER',
        teamId: newEmp.teamId || '',
        divisionId,
        teamHistory: [],
        joinDate: newEmp.joinDate,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
        companyId: userData?.companyId || ''
      });
      
      await logAction('CREATE_MEMBER', tempId, newEmp.name, `ÏßÅÏõê ?±Î°ù (${finalEmail}) / ?ÑÎπÑ 123456`);
      alert(`[?àÎÇ¥] ?†Í∑ú ÏßÅÏõê ?∞Ïù¥?∞Í? ?±Î°ù?òÏóà?µÎãà??\n?ÑÏù¥?? ${finalEmail.split('@')[0]}\n?ÑÏãú ÎπÑÎ?Î≤àÌò∏: 123456\n(?úÏãú ?¥Î©î?? ${getDisplayEmail(finalEmail)})`);
      setShowEmployeeModal(false);
      setNewEmp({ name: '', email: '', teamId: '', joinDate: new Date().toISOString().split('T')[0] });
    } catch (err) {
      alert("ÏßÅÏõê ?±Î°ù ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleDeleteEmployee = async (uid: string, name: string) => {
    if (!window.confirm(`'${name}' ÏßÅÏõê????†ú?òÏãúÍ≤†Ïäµ?àÍπå?`)) return;
    try {
      await deleteDoc(doc(db, 'UserProfile', uid));
      await logAction('DELETE_EMPLOYEE', uid, name, 'ÏßÅÏõê ??†ú(?ÅÍµ¨)');
    } catch (err) {
      alert("??†ú ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleUpdateRole = async (emp: Employee, newTeamId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'UserProfile', emp.uid);
      const selectedTeam = teams.find(t => t.id === newTeamId);
      const divisionId = selectedTeam?.divisionId || '';
      const teamName = selectedTeam?.name || 'ÎØ∏Î∞∞??;
      
      const newHistory = [...(emp.teamHistory || []), {
        teamId: newTeamId, teamName, joinedAt: new Date().toISOString(), role: newRole
      }];

      await updateDoc(userRef, {
        teamId: newTeamId,
        divisionId,
        role: newRole,
        teamHistory: newHistory
      });
      
      await logAction('UPDATE_EMPLOYEE', emp.uid, emp.name, `${teamName} Î°??¥Îèô / ??ï†: ${newRole}`);
      alert(`${emp.name}?òÏùò ?åÏÜç/??ï†??${newRole} ?±Í∏â?ºÎ°ú Î≥ÄÍ≤ΩÎêò?àÏäµ?àÎã§.`);
      setShowEditModal(false);
      setEditingEmployee(null);
    } catch (err) {
      alert("Î≥ÄÍ≤??§Ìå®: " + (err as Error).message);
    }
  };

  const handleAppointHead = async (divisionId: string, userId: string) => {
    try {
      await setDoc(doc(db, 'divisions', divisionId), { headId: userId }, { merge: true });
      const empName = employees.find(e => e.uid === userId)?.name || 'ÎØ∏ÏûÑÎ™?;
      const divName = divisions.find(d => d.id === divisionId)?.name || '';
      await logAction('APPOINT_HEAD', divisionId, divName, `Î≥∏Î????ÑÎ™Ö: ${empName}`);
      alert("Î≥∏Î??•Ïù¥ ?ÑÎ™Ö?òÏóà?µÎãà??");
    } catch (err) {
      alert("?ÑÎ™Ö ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleAppointLeader = async (teamId: string, userId: string) => {
    try {
      await setDoc(doc(db, 'teams', teamId), { leaderId: userId }, { merge: true });
      const empName = employees.find(e => e.uid === userId)?.name || 'ÎØ∏ÏûÑÎ™?;
      const teamName = teams.find(t => t.id === teamId)?.name || '';
      await logAction('APPOINT_LEADER', teamId, teamName, `?Ä???ÑÎ™Ö: ${empName}`);
      alert("?Ä?•Ïù¥ ?ÑÎ™Ö?òÏóà?µÎãà??");
    } catch (err) {
      alert("?ÑÎ™Ö ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleDeleteDivision = async (id: string, name: string) => {
    const hasTeams = teams.some(t => t.divisionId === id);
    if (hasTeams) {
      alert("?åÏÜç???Ä???àÎäî Î≥∏Î?????†ú?????ÜÏäµ?àÎã§.");
      return;
    }
    if (!window.confirm(`'${name}' Î≥∏Î?Î•???†ú?òÏãúÍ≤†Ïäµ?àÍπå?`)) return;
    try {
      await deleteDoc(doc(db, 'divisions', id));
      await logAction('DELETE_DIVISION', id, name, 'Î≥∏Î? ??†ú');
    } catch (err) {
      alert("??†ú ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    const hasEmployees = employees.some(e => e.teamId === id);
    if (hasEmployees) {
      alert("???Ä???åÏÜç??ÏßÅÏõê???àÏäµ?àÎã§.");
      return;
    }
    if (!window.confirm(`'${name}' ?Ä????†ú?òÏãúÍ≤†Ïäµ?àÍπå?`)) return;
    try {
      await deleteDoc(doc(db, 'teams', id));
      await logAction('DELETE_TEAM', id, name, '?Ä ??†ú');
    } catch (err) {
      alert("??†ú ?§Ìå®: " + (err as Error).message);
    }
  };

  const handleDeleteAllLogs = async () => {
    if (!deleteLogsPassword) return;
    setIsProcessingLogs(true);
    try {
      const { auth } = await import('../firebase');
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      
      try {
        await signInWithEmailAndPassword(auth, userData?.email || '', deleteLogsPassword);
      } catch (err) {
        throw new Error('ÎπÑÎ?Î≤àÌò∏Í∞Ä ?ºÏπò?òÏ? ?äÏäµ?àÎã§.');
      }

      const { writeBatch, getDocs, collection } = await import('firebase/firestore');
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, 'AuditLogs'));
      snap.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      alert('Î™®Îì† Ï°∞ÏßÅ Î≥ÄÍ≤??¥Î†•????†ú?òÏóà?µÎãà??');
      setShowLogDeleteConfirm(false);
      setDeleteLogsPassword('');
    } catch (err) {
      alert('??†ú Ï§??§Î•ò: ' + (err as Error).message);
    } finally {
      setIsProcessingLogs(false);
    }
  };

  const handleSearchLogs = () => {
    if (!searchQuery.trim()) {
      setLogSearchResults(null);
      return;
    }
    const filtered = auditLogs.filter(log => 
      log.targetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.performedBy.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setLogSearchResults(filtered);
  };

  const getEmployeesInTeam = (teamId: string) => {
    return employees.filter(emp => emp.teamId === teamId);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-black tracking-tight text-lg">Ï°∞ÏßÅ ?îÏßÑ ÏµúÏ†Å??Ï§?..</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                <Users className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">?ÑÏÇ¨ Ï°∞ÏßÅ Í¥ÄÎ¶??úÏä§??/h1>
            </div>
            <p className="text-slate-500 font-medium">Î≥∏Î? Î∞??Ä??Íµ¨Ï°∞Î•??§Í≥Ñ?òÍ≥† ?∏ÏÇ¨ ?ïÎ≥¥Î•??µÌï© Í¥ÄÎ¶¨Ìï©?àÎã§.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 relative group hidden xl:flex">
              <input 
                type="text" 
                placeholder="Íµ¨ÏÑ±???¥Î¶Ñ Í≤Ä??.." 
                value={searchQuery}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchLogs(); }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-11 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all font-bold text-slate-700 premium-shadow"
              />
              <Search className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
              <button 
                onClick={handleSearchLogs}
                className="p-3.5 bg-white border-2 border-slate-100 text-indigo-600 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all shadow-sm flex items-center justify-center group/btn"
                title="?¥Îãπ ?∏Ïõê ?¥Î†• Í≤Ä??
              >
                <History className="w-6 h-6 group-hover/btn:rotate-12 transition-transform" />
              </button>
            </div>
            <button 
              onClick={() => setShowEmployeeModal(true)}
              className="flex items-center gap-2.5 px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 shrink-0"
            >
              <UserPlus className="w-5 h-5" />
              <span>ÏßÅÏõê ?±Î°ù</span>
            </button>
          </div>
        </div>

        {isMasterAdmin && (
          <div className="w-full bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20">
                  <ShieldCheck className="w-8 h-8 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-white font-black text-xl flex items-center gap-2 tracking-tight">?úÏä§??ÎßàÏä§???úÏñ¥??/h3>
                  <p className="text-slate-400 text-sm font-medium mt-1">Î∂ÄÍ¥ÄÎ¶¨Ïûê ?ÑÎ™Ö Î∞??úÏä§???ÑÏó≠ Î≥¥Ïïà ?§Ï†ï??Í¥ÄÎ¶¨Ìï† ???àÏäµ?àÎã§.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowLogDeleteConfirm(true)}
                  className="bg-rose-500/10 text-rose-400 px-6 py-3.5 rounded-2xl border border-rose-500/20 font-black hover:bg-rose-500 hover:text-white transition-all text-xs flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  ?ÑÏ≤¥ ?¥Î†• ??†ú
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ?¥Î†• Í≤Ä??Í≤∞Í≥º ?πÏÖò */}
        {logSearchResults && (
          <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-indigo-100 overflow-hidden animate-in slide-in-from-top-4 duration-500">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-indigo-50/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-xl">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">"{searchQuery}" ?¥Î†• Í≤Ä??Í≤∞Í≥º</h2>
                  <p className="text-xs font-bold text-indigo-500 mt-0.5">Ï¥?{logSearchResults.length}Í±¥Ïùò Í∏∞Î°ù??Î∞úÍ≤¨?òÏóà?µÎãà??</p>
                </div>
              </div>
              <button 
                onClick={() => setLogSearchResults(null)}
                className="p-3 hover:bg-white rounded-2xl text-slate-400 hover:text-slate-900 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">?ºÏãú</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">?òÌñâ??/th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Î≥ÄÍ≤?Î∂ÑÎ•ò</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">?Ä??Í∞ùÏ≤¥</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">?ÅÏÑ∏ Î≥ÄÍ≤??¥Ïö©</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logSearchResults.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-all">
                      <td className="px-8 py-6 text-[11px] font-bold text-slate-400">
                        {new Date(log.timestamp).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-8 py-6 text-sm font-black text-slate-700">{log.performedBy}</td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                          log.actionType.includes('CREATE') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          log.actionType.includes('DELETE') ? 'bg-rose-50 text-rose-600 border-rose-100' :
                          'bg-indigo-50 text-indigo-600 border-indigo-100'
                        }`}>
                          {log.actionType}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-sm font-bold text-slate-600">{log.targetName}</td>
                      <td className="px-8 py-6 text-right text-xs text-slate-500 font-medium">{log.details}</td>
                    </tr>
                  ))}
                  {logSearchResults.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-24 text-slate-400 font-bold">Í≤Ä??Í≤∞Í≥ºÍ∞Ä ?ÜÏäµ?àÎã§.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ï°∞ÏßÅ ?îÏßÑ (Main Grid) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Î≥∏Î? Î¶¨Ïä§??*/}
          <div className="xl:col-span-4 space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Building className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Î≥∏Î? Íµ¨ÏÑ±</h2>
                </div>
                <button 
                  onClick={() => setShowDivisionModal(true)}
                  className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                >
                  <PlusCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-2 space-y-2">
                {divisions.map((div) => (
                  <div 
                    key={div.id}
                    onClick={() => setSelectedDivision(div.id)}
                    className={`group p-3 rounded-2xl transition-all duration-500 cursor-pointer border-2 ${
                      selectedDivision === div.id 
                        ? 'bg-indigo-600 border-indigo-400 shadow-2xl shadow-indigo-100 -translate-y-1' 
                        : 'bg-white border-transparent hover:border-indigo-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                       <div className="flex justify-between items-center">
                         <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                              selectedDivision === div.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                            }`}>
                              <Briefcase className="w-4 h-4" />
                            </div>
                            <span className={`text-base font-black tracking-tight ${selectedDivision === div.id ? 'text-white' : 'text-slate-700'}`}>
                              {div.name}
                            </span>
                         </div>
                         <Trash2 className="w-4 h-4 opacity-0 group-hover:opacity-100 text-slate-200 hover:text-rose-500 transition-all" onClick={(e) => { e.stopPropagation(); handleDeleteDivision(div.id, div.name); }} />
                       </div>
                       <div className={`flex items-center gap-2 p-1.5 rounded-xl transition-colors ${selectedDivision === div.id ? 'bg-white/10' : 'bg-slate-50'}`}>
                          <ShieldCheck className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-bold text-slate-400">Î≥∏Î???</span>
                          <select 
                            className={`flex-1 text-xs font-black bg-transparent border-none focus:ring-0 p-0 appearance-none ${selectedDivision === div.id ? 'text-white' : 'text-indigo-600'}`}
                            value={div.headId || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleAppointHead(div.id, e.target.value)}
                          >
                            <option value="" className="text-slate-900">ÎØ∏ÏûÑÎ™?/option>
                            {employees.map(emp => <option key={emp.uid} value={emp.uid} className="text-slate-900">{emp.name} ({getDisplayEmail(emp.email)})</option>)}
                          </select>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ?Ä Î∞?Íµ¨ÏÑ±??*/}
          <div className="xl:col-span-8 space-y-8">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[600px]">
              <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">?åÏÜç ?Ä Í¥ÄÎ¶?/h2>
                <button 
                  onClick={() => { if (selectedDivision) setNewTeamDivId(selectedDivision); setShowTeamModal(true); }}
                  className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white font-black rounded-xl shadow-xl hover:bg-emerald-700 transition-all"
                >
                  <PlusCircle className="w-4 h-4" /> <span>?Ä ?ùÏÑ±</span>
                </button>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {unassignedEmployees.length > 0 && !selectedDivision && (
                  <div className="p-4 rounded-3xl border-2 border-amber-100 bg-amber-50/20">
                    <h4 className="text-lg font-black text-amber-800 mb-3">ÎØ∏Î∞∞??Íµ¨ÏÑ±??/h4>
                    <div className="flex flex-wrap gap-2">
                       {unassignedEmployees.map(emp => (
                         <div key={emp.uid} className="flex items-center gap-3 bg-white border border-slate-100 px-4 py-2 rounded-2xl shadow-sm cursor-pointer" onClick={() => { setEditingEmployee(emp); setShowEditModal(true); }}>
                           <span className="text-xs font-black text-slate-700">{emp.name}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                )}
                
                {filteredTeams.map((team) => (
                  <div key={team.id} className="p-4 rounded-3xl border-2 border-slate-50 bg-slate-50/30 hover:bg-white hover:border-indigo-100 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-[10px] font-black text-indigo-500 uppercase bg-white px-2 py-0.5 rounded-lg border">{divisions.find(d => d.id === team.divisionId)?.name}</span>
                        <h4 className="text-xl font-black text-slate-900">{team.name}</h4>
                      </div>
                      <button onClick={() => handleDeleteTeam(team.id, team.name)} className="p-2 text-slate-200 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="space-y-3">
                       <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                          <span className="text-xs font-black text-slate-500">?Ä Î¶¨Îçî</span>
                          <select className="text-xs font-black text-emerald-600 bg-transparent border-none p-0 text-right" value={team.leaderId || ''} onChange={(e) => handleAppointLeader(team.id, e.target.value)}>
                            <option value="">ÎØ∏Ï???/option>
                            {getEmployeesInTeam(team.id).map(emp => <option key={emp.uid} value={emp.uid}>{emp.name} ({getDisplayEmail(emp.email)})</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Íµ¨ÏÑ±??({getEmployeesInTeam(team.id).length})</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getEmployeesInTeam(team.id).map(emp => (
                              <div key={emp.uid} className="flex items-center gap-2 bg-white border border-slate-100 px-3 py-2 rounded-2xl shadow-sm hover:scale-105 transition-all cursor-pointer" onClick={() => { setEditingEmployee(emp); setShowEditModal(true); }}>
                                <span className="text-xs font-black text-slate-700">{emp.name}</span>
                                <History className="w-3.5 h-3.5 text-slate-200" onClick={(e) => { e.stopPropagation(); setSelectedEmpForLogs(emp); }} />
                                <X className="w-3.5 h-3.5 text-slate-200 hover:text-rose-500" onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp.uid, emp.name); }} />
                              </div>
                            ))}
                          </div>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Î™®Îã¨ ?ÑÌÑ∞ */}
      {(showDivisionModal || showTeamModal || showEmployeeModal || showEditModal || selectedEmpForLogs || showLogDeleteConfirm) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100]" />
      )}

      {/* Î≥∏Î? ?ùÏÑ± Î™®Îã¨ */}
      {showDivisionModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-slate-900">?†Í∑ú Î≥∏Î? ?§Î¶Ω</h2>
              <button onClick={() => setShowDivisionModal(false)}><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleCreateDivision} className="space-y-8">
              <input type="text" autoFocus required value={newDivName} onChange={(e) => setNewDivName(e.target.value)} placeholder="Î≥∏Î? Î™ÖÏπ≠" className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black text-lg" />
              <button type="submit" className="w-full p-5 text-white bg-indigo-600 rounded-[1.5rem] font-black">Î≥∏Î? ?ùÏÑ±</button>
            </form>
          </div>
        </div>
      )}

      {/* ?Ä ?ùÏÑ± Î™®Îã¨ */}
      {showTeamModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <h2 className="text-3xl font-black text-slate-900 mb-10">?†Í∑ú ?Ä Íµ¨Ï∂ï</h2>
            <form onSubmit={handleCreateTeam} className="space-y-6">
              <select className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black" value={newTeamDivId} onChange={(e) => setNewTeamDivId(e.target.value)}>
                <option value="">Î≥∏Î? ?†ÌÉù</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input type="text" required value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="?Ä Î™ÖÏπ≠" className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
              <button type="submit" className="w-full p-5 text-white bg-indigo-600 rounded-[1.5rem] font-black">?Ä ?ùÏÑ±</button>
              <button type="button" onClick={() => setShowTeamModal(false)} className="w-full p-4 text-slate-400 font-bold">Ï∑®ÏÜå</button>
            </form>
          </div>
        </div>
      )}

      {/* ÏßÅÏõê ?±Î°ù Î™®Îã¨ */}
      {showEmployeeModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-xl shadow-2xl animate-modal-pop">
            <h2 className="text-3xl font-black text-slate-900 mb-10">?†Í∑ú ÏßÅÏõê ?±Î°ù</h2>
            <form onSubmit={handleCreateEmployee} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" required placeholder="?¥Î¶Ñ" value={newEmp.name} onChange={(e) => setNewEmp({...newEmp, name: e.target.value})} className="p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
                <input type="text" required placeholder="?ÑÏù¥???¥Î©î??" value={newEmp.email} onChange={(e) => setNewEmp({...newEmp, email: e.target.value})} className="p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
              </div>
              <select className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black" value={newEmp.teamId} onChange={(e) => setNewEmp({...newEmp, teamId: e.target.value})}>
                <option value="">?Ä ?†ÌÉù(?†ÌÉù?¨Ìï≠)</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="submit" className="w-full p-5 text-white bg-indigo-600 rounded-[1.5rem] font-black">?±Î°ù ?ÑÎ£å</button>
              <button type="button" onClick={() => setShowEmployeeModal(false)} className="w-full p-4 text-slate-400 font-bold">Ï∑®ÏÜå</button>
            </form>
          </div>
        </div>
      )}

      {/* ??ï†/?Ä ?òÏ†ï Î™®Îã¨ */}
      {showEditModal && editingEmployee && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <h2 className="text-2xl font-black text-slate-900 mb-6">{editingEmployee.name} ?ïÎ≥¥ ?òÏ†ï</h2>
            <div className="space-y-6">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 ml-1">?åÏÜç ?Ä Î≥ÄÍ≤?/label>
                 <select value={editingEmployee.teamId || ''} onChange={(e) => setEditingEmployee({...editingEmployee, teamId: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl outline-none font-black">
                   <option value="">ÎØ∏Î∞∞??/option>
                   {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 ml-1">Í∂åÌïú ?±Í∏â</label>
                 <select value={editingEmployee.role} onChange={(e) => setEditingEmployee({...editingEmployee, role: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl outline-none font-black">
                   <option value="EMPLOYEE">?ºÎ∞ò ÏßÅÏõê (EMPLOYEE)</option>
                   <option value="SUB_ADMIN">Î∂ÄÍ¥ÄÎ¶¨Ïûê (SUB_ADMIN)</option>
                   <option value="ADMIN">ÏµúÍ≥† Í¥ÄÎ¶¨Ïûê (ADMIN)</option>
                 </select>
               </div>
               <button onClick={() => handleUpdateRole(editingEmployee, editingEmployee.teamId || '', editingEmployee.role)} className="w-full p-5 text-white bg-indigo-600 rounded-2xl font-black shadow-lg">?ÅÌÉú ?Ä?•ÌïòÍ∏?/button>
               <button onClick={() => setShowEditModal(false)} className="w-full p-4 text-slate-400 font-bold">?´Í∏∞</button>
            </div>
          </div>
        </div>
      )}

      {/* ÏßÅÏõê ?¥Î†• ?ÅÏÑ∏ Î™®Îã¨ */}
      {selectedEmpForLogs && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-2xl shadow-2xl animate-modal-pop max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-8 shrink-0">
               <h2 className="text-2xl font-black text-slate-900">{selectedEmpForLogs.name} Î≥ÄÍ≤??¥Î†•</h2>
               <button onClick={() => setSelectedEmpForLogs(null)} className="p-3 bg-slate-50 rounded-2xl"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
               {auditLogs.filter(l => l.targetId === selectedEmpForLogs.uid).map(log => (
                 <div key={log.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{log.actionType}</span>
                       <span className="text-[11px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700">{log.details}</p>
                    <p className="text-[10px] text-slate-400 mt-2">Ï≤òÎ¶¨?? {log.performedBy}</p>
                 </div>
               ))}
               {auditLogs.filter(l => l.targetId === selectedEmpForLogs.uid).length === 0 && (
                 <div className="py-20 text-center text-slate-400 font-bold">?¥Î†•??Ï°¥Ïû¨?òÏ? ?äÏäµ?àÎã§.</div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* ?¥Î†• ??†ú ?ïÏù∏ Î™®Îã¨ */}
      {showLogDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <h2 className="text-2xl font-black text-rose-600 mb-4 tracking-tight">?ÑÏ≤¥ ?¥Î†• ?ÅÍµ¨ ??†ú</h2>
            <p className="text-slate-500 font-medium mb-8">Î≥¥Ïïà???ÑÌï¥ ÎπÑÎ?Î≤àÌò∏Î•??ÖÎ†•?¥Ï£º?∏Ïöî.</p>
            <input 
              type="password" 
              placeholder="Í¥ÄÎ¶¨Ïûê ÎπÑÎ?Î≤àÌò∏"
              value={deleteLogsPassword}
              onChange={(e) => setDeleteLogsPassword(e.target.value)}
              className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black mb-6"
            />
            <div className="flex gap-4">
               <button onClick={() => { setShowLogDeleteConfirm(false); setDeleteLogsPassword(''); }} className="flex-1 p-5 text-slate-400 font-black bg-slate-100 rounded-2xl">Ï∑®ÏÜå</button>
               <button 
                  onClick={handleDeleteAllLogs}
                  disabled={!deleteLogsPassword || isProcessingLogs}
                  className="flex-[2] p-5 text-white bg-rose-600 rounded-2xl font-black disabled:opacity-50"
                >
                  {isProcessingLogs ? '??†ú Ï§?..' : '?∞Ïù¥??ÎßêÏÜå'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
