import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import type { CompanyData, UserData } from '../store/authStore';
import { 
  Shield, Building2, Users, Globe, Search, 
  ToggleLeft, ToggleRight, Crown, Calendar,
  TrendingUp, Briefcase, AlertTriangle, Key, Trash2, Lock
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export const SuperAdminDashboard: React.FC = () => {
  const { userData } = useAuthStore();
  const [companies, setCompanies] = useState<(CompanyData & { id: string })[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  
  // 비밀번호 초기화 모달 상태
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<{uid: string, name: string} | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // 조직 삭제 모달 상태
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // companyId
  const [adminPassword, setAdminPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const calculateDDay = (createdAt: string) => {
    if (!createdAt) return 'D+0';
    try {
      const start = new Date(createdAt);
      start.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffTime = now.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return `D+${diffDays}`;
    } catch (e) {
      return 'D+0';
    }
  };

  useEffect(() => {
    if (userData?.role !== 'SUPER_ADMIN') return;

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyData & { id: string }));
      setCompanies(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    });

    const unsubUsers = onSnapshot(collection(db, 'UserProfile'), (snap) => {
      setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)));
    });

    return () => { unsubCompanies(); unsubUsers(); };
  }, [userData]);

  const handleToggleStatus = async (companyId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const action = newStatus === 'SUSPENDED' ? '정지' : '활성화';
    if (!window.confirm(`이 조직을 ${action}하시겠습니까?`)) return;

    try {
      await updateDoc(doc(db, 'companies', companyId), { status: newStatus });
    } catch (err) {
      alert('상태 변경 실패: ' + (err as Error).message);
    }
  };

  const getUsersForCompany = (companyId: string) => 
    allUsers.filter(u => u.companyId === companyId);

  const filteredCompanies = companies.filter(c => 
    !searchQuery || 
    c.nameKo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nameEn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.domain?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUsers = allUsers.filter(u => u.role !== 'SUPER_ADMIN').length;
  const activeCompanies = companies.filter(c => c.status === 'ACTIVE').length;

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    if (newPassword.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    try {
      const resetFn = httpsCallable(functions, 'adminResetPassword');
      await resetFn({ uid: resetTarget.uid, password: newPassword });
      alert(`[성공] ${resetTarget.name}님의 비밀번호가 '${newPassword}'로 초기화되었습니다.`);
      setShowResetModal(false);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      alert('비밀번호 초기화 실패: ' + (err as Error).message);
    }
  };

  const handleDeleteCompanyData = async () => {
    if (!deleteTarget || !adminPassword || !auth.currentUser?.email) return;
    
    setIsDeleting(true);
    try {
      // 1. SUPER_ADMIN 비밀번호 재확인 (보안)
      const credential = EmailAuthProvider.credential(auth.currentUser.email, adminPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // 2. 백엔드 삭제 함수 호출
      const deleteFn = httpsCallable(functions, 'adminDeleteCompanyData');
      await deleteFn({ companyId: deleteTarget });
      
      alert('[완료] 해당 조직의 모든 데이터가 영구적으로 삭제되었습니다.');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setAdminPassword('');
    } catch (err: any) {
      let msg = err.message;
      if (err.code === 'auth/wrong-password') msg = '비밀번호가 일치하지 않습니다.';
      alert('데이터 삭제 실패: ' + msg);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-black tracking-tight text-lg">플랫폼 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-violet-600 rounded-2xl text-white shadow-xl shadow-violet-100">
                <Shield className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">플랫폼 관리 센터</h1>
            </div>
            <p className="text-slate-500 font-medium">전체 조직 및 테넌트를 관리합니다. • SUPER_ADMIN</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                type="text"
                placeholder="조직 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-12 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl focus:border-violet-500 focus:ring-4 focus:ring-violet-50/50 outline-none transition-all font-bold text-slate-700"
              />
            </div>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-violet-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">전체 조직</span>
            </div>
            <p className="text-4xl font-black text-slate-900">{companies.length}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">활성 조직</span>
            </div>
            <p className="text-4xl font-black text-emerald-600">{activeCompanies}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">전체 사용자</span>
            </div>
            <p className="text-4xl font-black text-slate-900">{totalUsers}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">정지 조직</span>
            </div>
            <p className="text-4xl font-black text-amber-600">{companies.length - activeCompanies}</p>
          </div>
        </div>

        {/* 조직 목록 */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                <Briefcase className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">등록된 조직 목록</h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">{filteredCompanies.length}개</span>
            </div>
          </div>

          {filteredCompanies.length === 0 ? (
            <div className="p-20 text-center">
              <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-bold text-lg">등록된 조직이 없습니다</p>
              <p className="text-slate-300 text-sm mt-1">회원가입을 통해 새 조직이 생성됩니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredCompanies.map((company) => {
                const companyUsers = getUsersForCompany(company.id);
                const isExpanded = selectedCompany === company.id;

                return (
                  <div key={company.id} className="hover:bg-slate-50/50 transition-all">
                    <div 
                      className="p-6 flex items-center justify-between cursor-pointer"
                      onClick={() => setSelectedCompany(isExpanded ? null : company.id)}
                    >
                      <div className="flex items-center gap-5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg ${
                          company.status === 'ACTIVE' ? 'bg-indigo-600' : 'bg-slate-400'
                        }`}>
                          {company.nameEn?.[0]?.toUpperCase() || 'C'}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-black text-slate-900">{company.nameKo}</h3>
                            <span className="text-xs font-bold text-slate-400">{company.nameEn}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                              company.status === 'ACTIVE' 
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                : 'bg-rose-50 text-rose-600 border border-rose-100'
                            }`}>
                              {company.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Globe className="w-3 h-3" /> {company.domain}
                            </span>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Users className="w-3 h-3" /> {companyUsers.length}명
                            </span>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {new Date(company.createdAt).toLocaleDateString('ko-KR')}
                            </span>
                            <span className="text-xs font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1">
                              {calculateDDay(company.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(company.id, company.status); }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            company.status === 'ACTIVE'
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                          }`}
                        >
                          {company.status === 'ACTIVE' ? (
                            <><ToggleRight className="w-4 h-4" /> 정지</>
                          ) : (
                            <><ToggleLeft className="w-4 h-4" /> 활성화</>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(company.id); setShowDeleteModal(true); }}
                          className="p-2.5 bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all border border-transparent hover:border-rose-100"
                          title="모든 데이터 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 확장: 회사 상세 (사용자 목록) */}
                    {isExpanded && (
                      <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-300">
                        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Crown className="w-4 h-4 text-indigo-500" /> 소속 사용자 목록
                          </h4>
                          {companyUsers.length === 0 ? (
                            <p className="text-slate-400 text-sm py-4 text-center">사용자가 없습니다</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {companyUsers.map(user => (
                                <div key={user.uid} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black ${
                                    user.role === 'ADMIN' ? 'bg-violet-600' : 
                                    user.role === 'SUB_ADMIN' ? 'bg-indigo-600' : 'bg-slate-400'
                                  }`}>
                                    {user.name?.[0] || '?'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-slate-800 truncate">{user.name}</p>
                                    <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1.5">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                      user.role === 'ADMIN' ? 'bg-violet-50 text-violet-600' :
                                      user.role === 'SUB_ADMIN' ? 'bg-indigo-50 text-indigo-600' :
                                      'bg-slate-100 text-slate-500'
                                    }`}>
                                      {user.role}
                                    </span>
                                    {user.role === 'ADMIN' && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setResetTarget({uid: user.uid, name: user.name || ''}); setShowResetModal(true); }}
                                        className="p-1 px-1.5 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-all flex items-center gap-1 text-[9px] font-bold"
                                        /**
                                         * 관리자 권한으로 사용자의 비밀번호를 초기화합니다.
                                         * 호출자는 반드시 'ADMIN' 권한을 가지고 있어야 합니다.
                                         */
                                      >
                                        <Key className="w-2.5 h-2.5" /> PW 초기화
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 비밀번호 초기화 모달 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-violet-50 rounded-2xl text-violet-600">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">비밀번호 초기화</h3>
                <p className="text-xs text-slate-400 font-bold">{resetTarget?.name}님</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">새 임시 비밀번호</label>
                <input 
                  type="text" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="최소 6자 이상"
                  className="w-full mt-1 p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-50/50 transition-all font-bold"
                />
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button 
                  onClick={handleResetPassword}
                  className="w-full p-4 bg-violet-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-violet-100 hover:bg-violet-700 transition-all"
                >
                  변경사항 저장
                </button>
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="w-full p-4 text-slate-400 font-bold text-sm hover:bg-slate-50 rounded-2xl transition-all"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 조직 삭제 보안 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-rose-50 rounded-2xl text-rose-600">
                <Trash2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">조직 데이터 전체 삭제</h3>
                <p className="text-xs text-rose-500 font-bold">이 작업은 영구적이며 복구할 수 없습니다.</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl">
                <p className="text-xs text-rose-700 font-medium leading-relaxed">
                  해당 조직과 관련된 모든 데이터(직원, 근태, 결재, 휴가 등)가 파기되며, 소속된 모든 사용자의 인증 계정도 영구 삭제됩니다.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5 ml-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">본인 비밀번호 재확인 (SUPER_ADMIN)</label>
                </div>
                <input 
                  type="password" 
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50/50 transition-all font-bold"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  disabled={isDeleting || !adminPassword}
                  onClick={handleDeleteCompanyData}
                  className={`w-full p-4 bg-rose-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 ${
                    isDeleting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : '영구 삭제 실행'}
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={() => { setShowDeleteModal(false); setAdminPassword(''); }}
                  className="w-full p-4 text-slate-400 font-bold text-sm hover:bg-slate-50 rounded-2xl transition-all"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
