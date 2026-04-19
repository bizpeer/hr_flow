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
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
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
  const { userData, companyData, systemDomain, getDisplayEmail } = useAuthStore();
  const navigate = useNavigate();
  const isMasterAdmin = userData?.role === 'ADMIN';

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 모달 제어용
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  // 입력 필드용
  const [newDivName, setNewDivName] = useState('');
  const [newTeamDivId, setNewTeamDivId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newEmp, setNewEmp] = useState({ name: '', email: '', teamId: '', password: '', joinDate: new Date().toISOString().split('T')[0] });

  // 정보 수정용 (임명/이동)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // 이력 조회 및 삭제용
  const [selectedEmpForLogs, setSelectedEmpForLogs] = useState<Employee | null>(null);
  const [showLogDeleteConfirm, setShowLogDeleteConfirm] = useState(false);
  const [deleteLogsPassword, setDeleteLogsPassword] = useState('');
  const [isProcessingLogs, setIsProcessingLogs] = useState(false);
  const [logSearchResults, setLogSearchResults] = useState<AuditLog[] | null>(null);

  // 부관리자(SUB_ADMIN) 접근 차단 리다이렉트
  useEffect(() => {
    if (userData && userData.role === 'SUB_ADMIN') {
      alert('조직 관리 메뉴에 대한 접근 권한이 없습니다.');
      navigate('/attendance');
    }
  }, [userData, navigate]);

  // Firestore 데이터 실시간 구독 (companyId 기반 격리)
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
        performedBy: userData?.name || '시스템',
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
      await logAction('CREATE_DIVISION', docRef.id, newDivName, '새 본부 생성');
      setNewDivName(''); setShowDivisionModal(false);
    } catch (err) {
      alert("본부 생성 실패: " + (err as Error).message);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamDivId) return;
    try {
      const docRef = await addDoc(collection(db, 'teams'), { divisionId: newTeamDivId, name: newTeamName, leaderId: '', companyId: userData?.companyId || '' });
      const divName = divisions.find(d => d.id === newTeamDivId)?.name || '알 수 없음';
      await logAction('CREATE_TEAM', docRef.id, newTeamName, `${divName} 소속 팀 생성`);
      setNewTeamName(''); setNewTeamDivId(''); setShowTeamModal(false);
    } catch (err) {
      alert("팀 생성 실패: " + (err as Error).message);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmp.password.length < 6) {
      alert("임시 비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    try {
      const loginInput = newEmp.email.trim().toLowerCase();
      const finalEmail = loginInput.includes('@') ? loginInput : `${loginInput}@${systemDomain}`;

      // 1. 중복 아이디 체크 (UX 차원)
      const q = query(collection(db, 'UserProfile'), where('email', '==', finalEmail), where('companyId', '==', userData?.companyId || ''));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        alert(`[중복 오류] '${finalEmail}' 아이디는 이미 등록되어 있습니다.\n다른 아이디를 사용해 주세요.`);
        return;
      }

      // 2. Cloud Function 호출 (계정 + 프로필 동시 생성)
      const createMemberFn = httpsCallable(functions, 'adminCreateMember');
      const result = await createMemberFn({
        name: newEmp.name,
        email: finalEmail,
        password: newEmp.password,
        teamId: newEmp.teamId,
        joinDate: newEmp.joinDate
      });

      const data = result.data as { success: boolean, uid: string, message: string };
      const newUid = data.uid;
      
      // 3. 로그 기록 및 알림
      await logAction('CREATE_MEMBER', newUid, newEmp.name, `직원 등록 (${finalEmail}) / 임비: ${newEmp.password}`);
      alert(`[안내] 신규 직원 계정이 생성되었습니다.\n아이디: ${finalEmail}\n임시 비밀번호: ${newEmp.password}\n\n* 해당 직원은 첫 로그인 시 비밀번호를 의무적으로 변경해야 합니다.`);
      
      setShowEmployeeModal(false);
      setNewEmp({ name: '', email: '', teamId: '', password: '', joinDate: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      console.error("Employee Registration Error:", err);
      alert("직원 등록 실패: " + (err.message || String(err)));
    }
  };

  const handleDeleteEmployee = async (uid: string, name: string) => {
    if (!window.confirm(`'${name}' 직원을 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'UserProfile', uid));
      await logAction('DELETE_MEMBER', uid, name, '직원 삭제(영구)');
    } catch (err) {
      alert("삭제 실패: " + (err as Error).message);
    }
  };

  const handleUpdateRole = async (emp: Employee, newTeamId: string, newRole: string) => {
    try {
      const originalEmp = employees.find(e => e.uid === emp.uid);
      
      // 최초 회사를 생성한 최고 관리자(Owner) 권한 강등 보호
      if (emp.uid === companyData?.adminUid && newRole !== 'ADMIN') {
        alert("최초 회사를 생성한 최고 관리자(Owner)의 권한은 변경할 수 없습니다.");
        return;
      }

      // 본인 권한 변경 시도 차단
      if (emp.uid === userData?.uid && originalEmp && originalEmp.role !== newRole) {
        alert("운영 실수 방지를 위해 본인의 권한은 직접 변경할 수 없습니다.");
        return;
      }

      const userRef = doc(db, 'UserProfile', emp.uid);
      const selectedTeam = teams.find(t => t.id === newTeamId);
      const divisionId = selectedTeam?.divisionId || '';
      const teamName = selectedTeam?.name || '미배정';
      
      const newHistory = [...(emp.teamHistory || []), {
        teamId: newTeamId, teamName, joinedAt: new Date().toISOString(), role: newRole
      }];

      await updateDoc(userRef, {
        teamId: newTeamId,
        divisionId,
        role: newRole,
        teamHistory: newHistory
      });
      
      await logAction('UPDATE_MEMBER', emp.uid, emp.name, `${teamName} 로 이동 / 역할: ${newRole}`);
      alert(`${emp.name}님의 소속/역할이 ${newRole} 등급으로 변경되었습니다.`);
      setShowEditModal(false);
      setEditingEmployee(null);
    } catch (err) {
      alert("변경 실패: " + (err as Error).message);
    }
  };

  const handleAppointHead = async (divisionId: string, userId: string) => {
    try {
      await setDoc(doc(db, 'divisions', divisionId), { headId: userId }, { merge: true });
      const empName = employees.find(e => e.uid === userId)?.name || '미임명';
      const divName = divisions.find(d => d.id === divisionId)?.name || '';
      await logAction('APPOINT_HEAD', divisionId, divName, `본부장 임명: ${empName}`);
      alert("본부장이 임명되었습니다.");
    } catch (err) {
      alert("임명 실패: " + (err as Error).message);
    }
  };

  const handleAppointLeader = async (teamId: string, userId: string) => {
    try {
      await setDoc(doc(db, 'teams', teamId), { leaderId: userId }, { merge: true });
      const empName = employees.find(e => e.uid === userId)?.name || '미임명';
      const teamName = teams.find(t => t.id === teamId)?.name || '';
      await logAction('APPOINT_LEADER', teamId, teamName, `팀장 임명: ${empName}`);
      alert("팀장이 임명되었습니다.");
    } catch (err) {
      alert("임명 실패: " + (err as Error).message);
    }
  };

  const handleDeleteDivision = async (id: string, name: string) => {
    const hasTeams = teams.some(t => t.divisionId === id);
    if (hasTeams) {
      alert("소속된 팀이 있는 본부는 삭제할 수 없습니다.");
      return;
    }
    if (!window.confirm(`'${name}' 본부를 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'divisions', id));
      await logAction('DELETE_DIVISION', id, name, '본부 삭제');
    } catch (err) {
      alert("삭제 실패: " + (err as Error).message);
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    const hasEmployees = employees.some(e => e.teamId === id);
    if (hasEmployees) {
      alert("이 팀에 소속된 직원이 있습니다.");
      return;
    }
    if (!window.confirm(`'${name}' 팀을 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'teams', id));
      await logAction('DELETE_TEAM', id, name, '팀 삭제');
    } catch (err) {
      alert("삭제 실패: " + (err as Error).message);
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
        throw new Error('비밀번호가 일치하지 않습니다.');
      }

      const { writeBatch, getDocs, collection } = await import('firebase/firestore');
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, 'AuditLogs'));
      snap.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      alert('모든 조직 변경 이력이 삭제되었습니다.');
      setShowLogDeleteConfirm(false);
      setDeleteLogsPassword('');
    } catch (err) {
      alert('삭제 중 오류: ' + (err as Error).message);
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
          <p className="text-slate-500 font-black tracking-tight text-lg">조직 엔진 최적화 중...</p>
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
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">전사 조직 관리 시스템</h1>
            </div>
            <p className="text-slate-500 font-medium">본부 및 팀의 구조를 설계하고 인사 정보를 통합 관리합니다.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 relative group hidden xl:flex">
              <input 
                type="text" 
                placeholder="구성원 이름 검색..." 
                value={searchQuery}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchLogs(); }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-11 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all font-bold text-slate-700 premium-shadow"
              />
              <Search className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" />
              <button 
                onClick={handleSearchLogs}
                className="p-3.5 bg-white border-2 border-slate-100 text-indigo-600 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all shadow-sm flex items-center justify-center group/btn"
                title="해당 인원 이력 검색"
              >
                <History className="w-6 h-6 group-hover/btn:rotate-12 transition-transform" />
              </button>
            </div>
            <button 
              onClick={() => setShowEmployeeModal(true)}
              className="flex items-center gap-2.5 px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 shrink-0"
            >
              <UserPlus className="w-5 h-5" />
              <span>직원 등록</span>
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
                  <h3 className="text-white font-black text-xl flex items-center gap-2 tracking-tight">시스템 마스터 제어판</h3>
                  <p className="text-slate-400 text-sm font-medium mt-1">부관리자 임명 및 시스템 전역 보안 설정을 관리할 수 있습니다.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowLogDeleteConfirm(true)}
                  className="bg-rose-500/10 text-rose-400 px-6 py-3.5 rounded-2xl border border-rose-500/20 font-black hover:bg-rose-500 hover:text-white transition-all text-xs flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  전체 이력 삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 이력 검색 결과 섹션 */}
        {logSearchResults && (
          <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-indigo-100 overflow-hidden animate-in slide-in-from-top-4 duration-500">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-indigo-50/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-xl">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">"{searchQuery}" 이력 검색 결과</h2>
                  <p className="text-xs font-bold text-indigo-500 mt-0.5">총 {logSearchResults.length}건의 기록이 발견되었습니다.</p>
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
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">일시</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">수행자</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">변경 분류</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">대상 객체</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">상세 변경 내용</th>
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
                    <tr><td colSpan={5} className="text-center py-24 text-slate-400 font-bold">검색 결과가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 조직 엔진 (Main Grid) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* 본부 리스트 */}
          <div className="xl:col-span-4 space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Building className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">본부 구성</h2>
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
                          <span className="text-xs font-bold text-slate-400">본부장:</span>
                          <select 
                            className={`flex-1 text-xs font-black bg-transparent border-none focus:ring-0 p-0 appearance-none ${selectedDivision === div.id ? 'text-white' : 'text-indigo-600'}`}
                            value={div.headId || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleAppointHead(div.id, e.target.value)}
                          >
                            <option value="" className="text-slate-900">미임명</option>
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

          {/* 팀 및 구성원 */}
          <div className="xl:col-span-8 space-y-8">
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[600px]">
              <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">소속 팀 관리</h2>
                <button 
                  onClick={() => { if (selectedDivision) setNewTeamDivId(selectedDivision); setShowTeamModal(true); }}
                  className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white font-black rounded-xl shadow-xl hover:bg-emerald-700 transition-all"
                >
                  <PlusCircle className="w-4 h-4" /> <span>팀 생성</span>
                </button>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {unassignedEmployees.length > 0 && !selectedDivision && (
                  <div className="p-4 rounded-3xl border-2 border-amber-100 bg-amber-50/20">
                    <h4 className="text-lg font-black text-amber-800 mb-3">미배정 구성원</h4>
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
                          <span className="text-xs font-black text-slate-500">팀 리더</span>
                          <select className="text-xs font-black text-emerald-600 bg-transparent border-none p-0 text-right" value={team.leaderId || ''} onChange={(e) => handleAppointLeader(team.id, e.target.value)}>
                            <option value="">미지정</option>
                            {getEmployeesInTeam(team.id).map(emp => <option key={emp.uid} value={emp.uid}>{emp.name} ({getDisplayEmail(emp.email)})</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase">구성원 ({getEmployeesInTeam(team.id).length})</span>
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

      {/* 모달 필터 */}
      {(showDivisionModal || showTeamModal || showEmployeeModal || showEditModal || selectedEmpForLogs || showLogDeleteConfirm) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100]" />
      )}

      {/* 본부 생성 모달 */}
      {showDivisionModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-slate-900">신규 본부 설립</h2>
              <button onClick={() => setShowDivisionModal(false)}><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleCreateDivision} className="space-y-8">
              <input type="text" autoFocus required value={newDivName} onChange={(e) => setNewDivName(e.target.value)} placeholder="본부 명칭" className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black text-lg" />
              <button type="submit" className="w-full p-5 text-white bg-indigo-600 rounded-[1.5rem] font-black">본부 생성</button>
            </form>
          </div>
        </div>
      )}

      {/* 팀 생성 모달 */}
      {showTeamModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <h2 className="text-3xl font-black text-slate-900 mb-10">신규 팀 구축</h2>
            <form onSubmit={handleCreateTeam} className="space-y-6">
              <select className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black" value={newTeamDivId} onChange={(e) => setNewTeamDivId(e.target.value)}>
                <option value="">본부 선택</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input type="text" required value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="팀 명칭" className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
              <button type="submit" className="w-full p-5 text-white bg-indigo-600 rounded-[1.5rem] font-black">팀 생성</button>
              <button type="button" onClick={() => setShowTeamModal(false)} className="w-full p-4 text-slate-400 font-bold">취소</button>
            </form>
          </div>
        </div>
      )}

      {/* 직원 등록 모달 */}
      {showEmployeeModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-xl shadow-2xl animate-modal-pop">
            <h2 className="text-3xl font-black text-slate-900 mb-10">신규 직원 등록</h2>
            <form onSubmit={handleCreateEmployee} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" required placeholder="이름" value={newEmp.name} onChange={(e) => setNewEmp({...newEmp, name: e.target.value})} className="p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
                <input type="text" required placeholder="아이디(이메일)" value={newEmp.email} onChange={(e) => setNewEmp({...newEmp, email: e.target.value})} className="p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="password" required placeholder="임시 비밀번호" value={newEmp.password} onChange={(e) => setNewEmp({...newEmp, password: e.target.value})} className="p-5 bg-slate-50 rounded-[2rem] outline-none font-black" />
                <select className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black" value={newEmp.teamId} onChange={(e) => setNewEmp({...newEmp, teamId: e.target.value})}>
                  <option value="">팀 선택(선택사항)</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full p-5 text-white bg-indigo-600 rounded-[1.5rem] font-black">등록 완료</button>
              <button type="button" onClick={() => setShowEmployeeModal(false)} className="w-full p-4 text-slate-400 font-bold">취소</button>
            </form>
          </div>
        </div>
      )}

      {/* 역할/팀 수정 모달 */}
      {showEditModal && editingEmployee && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <h2 className="text-2xl font-black text-slate-900 mb-6">{editingEmployee.name} 정보 수정</h2>
            <div className="space-y-6">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 ml-1">소속 팀 변경</label>
                 <select value={editingEmployee.teamId || ''} onChange={(e) => setEditingEmployee({...editingEmployee, teamId: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl outline-none font-black">
                   <option value="">미배정</option>
                   {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
               </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 ml-1">
                    권한 등급 
                    {editingEmployee.uid === companyData?.adminUid ? " (사내 최고 관리자 - 변경 불가)" : 
                     editingEmployee.uid === userData?.uid ? " (본인 변경 불가)" : ""}
                  </label>
                  <select 
                    value={editingEmployee.role} 
                    onChange={(e) => setEditingEmployee({...editingEmployee, role: e.target.value})} 
                    className="w-full p-5 bg-slate-50 rounded-2xl outline-none font-black disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={editingEmployee.uid === userData?.uid || editingEmployee.uid === companyData?.adminUid}
                  >
                    <option value="MEMBER">일반 직원 (MEMBER)</option>
                    <option value="SUB_ADMIN">부관리자 (SUB_ADMIN)</option>
                    <option value="ADMIN">최고 관리자 (ADMIN)</option>
                  </select>
                </div>
               <button onClick={() => handleUpdateRole(editingEmployee, editingEmployee.teamId || '', editingEmployee.role)} className="w-full p-5 text-white bg-indigo-600 rounded-2xl font-black shadow-lg">상태 저장하기</button>
               <button onClick={() => setShowEditModal(false)} className="w-full p-4 text-slate-400 font-bold">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 직원 이력 상세 모달 */}
      {selectedEmpForLogs && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-2xl shadow-2xl animate-modal-pop max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-8 shrink-0">
               <h2 className="text-2xl font-black text-slate-900">{selectedEmpForLogs.name} 변경 이력</h2>
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
                    <p className="text-[10px] text-slate-400 mt-2">처리자: {log.performedBy}</p>
                 </div>
               ))}
               {auditLogs.filter(l => l.targetId === selectedEmpForLogs.uid).length === 0 && (
                 <div className="py-20 text-center text-slate-400 font-bold">이력이 존재하지 않습니다.</div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* 이력 삭제 확인 모달 */}
      {showLogDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-modal-pop">
            <h2 className="text-2xl font-black text-rose-600 mb-4 tracking-tight">전체 이력 영구 삭제</h2>
            <p className="text-slate-500 font-medium mb-8">보안을 위해 비밀번호를 입력해주세요.</p>
            <input 
              type="password" 
              placeholder="관리자 비밀번호"
              value={deleteLogsPassword}
              onChange={(e) => setDeleteLogsPassword(e.target.value)}
              className="w-full p-5 bg-slate-50 rounded-[2rem] outline-none font-black mb-6"
            />
            <div className="flex gap-4">
               <button onClick={() => { setShowLogDeleteConfirm(false); setDeleteLogsPassword(''); }} className="flex-1 p-5 text-slate-400 font-black bg-slate-100 rounded-2xl">취소</button>
               <button 
                  onClick={handleDeleteAllLogs}
                  disabled={!deleteLogsPassword || isProcessingLogs}
                  className="flex-[2] p-5 text-white bg-rose-600 rounded-2xl font-black disabled:opacity-50"
                >
                  {isProcessingLogs ? '삭제 중...' : '데이터 말소'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
