import React, { useState, useEffect } from 'react';
import { Settings, Lock, AlertCircle, CheckCircle2, ShieldCheck, Key, Globe, Layout, Fingerprint, ShieldAlert, Users } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { query, where } from 'firebase/firestore';

export const AdminSettings: React.FC = () => {
  // Password Reset State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Domain Config State
  const { fetchCompanyDomain, companyData } = useAuthStore();
  const [tempDomain, setTempDomain] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  
  const { userData } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchConfig = async () => {
      if (userData?.companyId) {
        try {
          await fetchCompanyDomain(userData.companyId);
        } catch (err) {
          console.error("Error fetching config:", err);
        }
      }
    };
    fetchConfig();
  }, [fetchCompanyDomain, userData?.companyId]);

  // 시스템 도메인이 로드되면 입력창의 임시 상태 초기화
  useEffect(() => {
    if (companyData?.domain) {
      setTempDomain(companyData.domain);
    }
  }, [companyData]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '입력하신 두 비밀번호가 일치하지 않습니다.' });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: '보안을 위해 비밀번호는 최소 4자 이상이어야 합니다.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setMessage({ type: 'success', text: '관리자 비밀번호가 성공적으로 변경되었습니다.' });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: '인증 세션이 만료되었습니다. 다시 로그인해주세요.' });
      }
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setMessage({ type: 'error', text: '보안 정책상 최근 로그인이 필요합니다. 로그아웃 후 다시 시도해주세요.' });
      } else {
        setMessage({ type: 'error', text: '비밀번호 변경 중 오류가 발생했습니다: ' + err.message });
      }
    } finally {
      setLoading(false);
    }
  };

  // 0. 관리자 비밀번호 공통 검증 로직
  const verifyAdmin = async () => {
    if (!verifyPassword) {
      throw new Error("관리자 비밀번호를 입력해주세요.");
    }
    try {
      if (!auth.currentUser?.email) throw new Error("인증 정보가 없습니다.");
      // 보안 재인증 수행
      await signInWithEmailAndPassword(auth, auth.currentUser.email, verifyPassword);
      return true;
    } catch (err: any) {
      if (err.code === 'auth/too-many-requests') {
        throw new Error("보안 정책상 너무 많은 요청이 발생했습니다. 잠시 후(약 10~30분) 다시 시도해 주세요.");
      }
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error("비밀번호가 일치하지 않습니다. 다시 확인해주세요.");
      }
      throw err;
    }
  };

  const handleUpdateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempDomain || !tempDomain.includes('.')) {
      setMessage({ type: 'error', text: '유효한 회사 도메인 형식을 입력해주세요 (예: bzpeer.com)' });
      return;
    }
    if (!verifyPassword) {
      setMessage({ type: 'error', text: '설정 변경을 위해 관리자 비밀번호를 입력해주세요.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      // 1. 비밀번호 재검증 (공통 로직 사용)
      await verifyAdmin();

      // 2. 도메인 설정 저장 (회사 문서 업데이트)
      if (!userData?.companyId) throw new Error("회사 정보가 없습니다.");
      
      await setDoc(doc(db, 'companies', userData.companyId), {
        domain: tempDomain.replace('@', ''), // @ 기호 제거
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || 'unknown'
      }, { merge: true });

      // 3. 스토어 갱신
      await fetchCompanyDomain(userData.companyId);
      
      setMessage({ type: 'success', text: `회원가입 기본 도메인이 @${tempDomain}으로 변경되었습니다.` });
      setVerifyPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAllUsersDomain = async () => {
    if (!window.confirm("모든 기존 사용자의 프로필 도메인을 현재 설정된 도메인으로 동기화하시겠습니까?")) return;
    if (!verifyPassword) {
      setMessage({ type: 'error', text: '동기화를 위해 관리자 비밀번호를 입력해주세요.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      // 1. 비밀번호 재검증 (공통 로직 사용)
      await verifyAdmin();

      // 2. 해당 회사 사용자 프로필 조회 및 일괄 업데이트 (Batch)
      if (!userData?.companyId) throw new Error("회사 정보가 없습니다.");
      
      const q = query(collection(db, 'UserProfile'), where('companyId', '==', userData.companyId));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      let count = 0;

      querySnapshot.forEach((userDoc) => {
        const data = userDoc.data();
        if (data.email && data.email.includes('@')) {
          const [id] = data.email.split('@');
          const newEmail = `${id}@${tempDomain}`;
          if (data.email !== newEmail) {
            batch.update(userDoc.ref, { email: newEmail });
            count++;
          }
        }
      });

      if (count > 0) {
        await batch.commit();
        setMessage({ type: 'success', text: `${count}명의 사용자 도메인 동기화가 완료되었습니다.` });
      } else {
        setMessage({ type: 'success', text: '이미 모든 사용자가 최신 도메인을 사용 중입니다.' });
      }
      setVerifyPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: '동기화 중 오류: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Page Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
              <Settings className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">시스템 환경 설정</h1>
          </div>
          <p className="text-slate-500 font-medium">인사 시스템 기본 정보 및 관리자 보안 옵션을 구성합니다.</p>
        </div>

        {/* Status Message */}
        {message.text && (
          <div className={`w-full p-6 bg-white rounded-[2rem] flex items-center gap-4 shadow-xl border-l-8 animate-modal-pop transition-all ${
            message.type === 'success' ? 'border-emerald-500 shadow-emerald-50' : 'border-rose-500 shadow-rose-50'
          }`}>
            <div className={`p-2 rounded-full ${message.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
              {message.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <p className={`text-sm font-black tracking-tight ${message.type === 'success' ? 'text-emerald-800' : 'text-rose-800'}`}>
                {message.type === 'success' ? '환경 설정 업데이트 완료' : '시스템 경고'}
              </p>
              <p className="text-slate-500 text-xs font-semibold mt-0.5">{message.text}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* System Default Domain Section - Replacing External DB per user request */}
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden group">
             <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl">
                    <Globe className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">시스템 기본 도메인 설정</h2>
                </div>
                <div className="flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-indigo-500" />
                   <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Global Policy</span>
                </div>
             </div>

             <form onSubmit={handleUpdateDomain} className="p-8 space-y-6">
                <div className="space-y-6">
                   <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-black text-slate-800 ml-1">
                        회사 공용 도메인 (Email Domain)
                      </label>
                      <div className="relative">
                         <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">@</span>
                         <input 
                           type="text"
                           value={tempDomain}
                           onChange={(e) => setTempDomain(e.target.value.replace('@', ''))}
                           placeholder="bzpeer.com"
                           className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700 shadow-inner"
                         />
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold ml-1">입력 시 자동 완성 및 기본 ID 배정에 사용됩니다.</p>
                   </div>

                   <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-black text-rose-600 ml-1">
                        <Key className="w-4 h-4" /> 정보 변경 승인 (관리자 암호)
                      </label>
                      <input 
                        type="password"
                        required
                        value={verifyPassword}
                        onChange={(e) => setVerifyPassword(e.target.value)}
                        placeholder="현재 접속된 관리자 비밀번호 입력"
                        className="w-full px-6 py-4 bg-rose-50/30 border-2 border-transparent rounded-2xl focus:border-rose-500 focus:bg-white outline-none transition-all font-bold text-slate-700 shadow-inner"
                      />
                   </div>

                   <div className="p-5 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                      <div className="flex items-start gap-3">
                         <AlertCircle className="w-4 h-4 text-indigo-500 mt-0.5" />
                         <div className="space-y-1">
                            <p className="text-[11px] font-black text-indigo-900">도메인 변경 시 주의사항</p>
                            <p className="text-[10px] text-indigo-700 font-medium leading-relaxed">
                              도메인을 변경하면 새로 생성되는 직원의 ID에 즉시 적용됩니다.<br/>
                              기존 사용자의 도메인도 아래 버튼으로 일괄 전환할 수 있습니다.
                            </p>
                         </div>
                      </div>
                   </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-200 hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                >
                   {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                   <span>시스템 도메인 변경 적용</span>
                </button>

                <div className="pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={handleSyncAllUsersDomain}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-50 text-indigo-600 font-bold rounded-2xl hover:bg-indigo-100 transition-all active:scale-95 disabled:opacity-50 border border-indigo-100"
                  >
                    <Users className="w-4 h-4" />
                    <span>기존 사용자 도메인 일체화 수행</span>
                  </button>
                </div>
             </form>
          </div>

          {/* Security & Access Protection Section */}
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden group">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600 text-white rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">코어 보안 프로토콜</h2>
              </div>
              <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                Protected
              </span>
            </div>

            <form onSubmit={handleChangePassword} className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-black text-slate-800 ml-1">
                    <Fingerprint className="w-4 h-4 text-emerald-500" /> 신규 마스터 비밀번호
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="최소 4자 이상"
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-bold text-slate-700 shadow-inner"
                  />
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-black text-slate-800 ml-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 비밀번호 재검증
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="재입력 확인"
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all font-bold text-slate-700 shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-5 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-5 h-5" />}
                <span>보안 키 업데이트 적용</span>
              </button>
            </form>
          </div>

          {/* System Infrastructure Info - Added to replace/restore previous External DB info */}
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden lg:col-span-2">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-900">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-500 text-white rounded-xl">
                   <Layout className="w-5 h-5" />
                 </div>
                 <h2 className="text-xl font-black text-white tracking-tight">시스템 백본 및 인프라 상태</h2>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Core Engine Active</span>
               </div>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
               <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">주력 데이터베이스 엔진</p>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 font-black italic">F</div>
                     <div>
                        <p className="text-sm font-black text-slate-800">Firebase Firestore</p>
                        <p className="text-[10px] text-slate-400 font-bold">Cloud Native NoSQL</p>
                     </div>
                  </div>
               </div>
               <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">인증 보안 프로토콜</p>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <ShieldCheck className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-sm font-black text-slate-800">Firebase Auth</p>
                        <p className="text-[10px] text-slate-400 font-bold">JWT / OAuth 2.0</p>
                     </div>
                  </div>
               </div>
               <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">파일 서버 스토리지</p>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                     <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-sky-600">
                        <Globe className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-sm font-black text-slate-800">Firebase Storage</p>
                        <p className="text-[10px] text-slate-400 font-bold">GCP Infrastructure</p>
                     </div>
                  </div>
               </div>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <div className="text-center py-10 opacity-30">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">System Version 2.0.4 Premium Core</p>
        </div>
      </div>
    </div>
  );
};
