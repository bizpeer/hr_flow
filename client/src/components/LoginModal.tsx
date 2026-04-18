import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updatePassword
} from 'firebase/auth';
import { 
  doc, setDoc, collection, getDocs, query, limit, updateDoc, addDoc, where 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, X, Settings, Loader2, KeyRound, CheckCircle2, UserPlus } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { 
    isLoginModalOpen, setLoginModalOpen, userData, systemDomain, 
    isManualChangeMode 
  } = useAuthStore();
  
  // 로그인 관련
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [authStatus, setAuthStatus] = useState<'IDLE' | 'CHECKING' | 'RECOVERING'>('IDLE');

  // 비밀번호 변경 관련
  const [isChangeMode, setIsChangeMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeSuccess, setChangeSuccess] = useState(false);

  // 마스터 어드민 자동 시딩 및 비밀번호 변경 체크
  useEffect(() => {
    const checkStatus = async () => {
      if (!isLoginModalOpen) return;
      
      try {
        setIsInitializing(true);
        const q = query(collection(db, 'UserProfile'), limit(1));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          console.log("No users found. Seeding master admin...");
          await handleSeedMasterAdmin(true); 
        }
      } catch (err) {
        console.error("Initialization check failed:", err);
      } finally {
        setIsInitializing(false);
      }
    };

    checkStatus();
  }, [isLoginModalOpen]);

  // 로그인 성공 후 mustChangePassword 상태 감시
  useEffect(() => {
    // userData가 완전히 로딩될 때까지 기다립니다
    if (!userData) return;

    console.log("[Auth] UserData Loaded - mustChangePassword:", userData.mustChangePassword);

    if (userData.mustChangePassword && !userData.email?.toLowerCase().trim().startsWith('bizpeer@')) {
      console.log("[Login] mustChangePassword is TRUE. Switching to change mode.");
      setIsChangeMode(true);
      setLoading(false); // 로딩 상태 해제하여 폼이 보이게 함
    } else {
      console.log("[Login] Normal user. Closing modal.");
      setIsChangeMode(false);
      setLoginModalOpen(false); 
    }
  }, [userData, setLoginModalOpen]);

  // 모달이 처음 열릴 때 초기 상태 동기화 (예: 대시보드 진입 시 자동 오픈 대응)
  useEffect(() => {
    const isMaster = userData?.email?.toLowerCase().trim().startsWith('bizpeer@');
    if (isLoginModalOpen && (userData?.mustChangePassword && !isMaster)) {
      setIsChangeMode(true);
    } else if (isLoginModalOpen && isManualChangeMode) {
      // 수동으로 연 경우
      setIsChangeMode(true);
    }
  }, [isLoginModalOpen, userData, isManualChangeMode]);

  if (!isLoginModalOpen) return null;

  // 자동 계정 생성 로직 (관리자 사전 등록 직원)
  const handleAutoRegistration = async (rawInput: string, loginPass: string) => {
    setAuthStatus('RECOVERING');
    setError('');
    
    try {
      const normalizedInput = rawInput.trim().toLowerCase();
      const authEmail = normalizedInput.includes('@') ? normalizedInput : `${normalizedInput}@${systemDomain}`;

      // 1. 보안 규칙을 통과하기 위해 Auth 계정 생성 (또는 로그인)
      // 실제 데이터 이동(Migration)은 authStore.ts의 initAuth에서 자동으로 감지하고 처리합니다.
      try {
        console.log("[Login] Attempting auth account creation for activation...");
        await createUserWithEmailAndPassword(auth, authEmail, loginPass);
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
           await signInWithEmailAndPassword(auth, authEmail, loginPass);
        } else {
           throw authErr;
        }
      }

      console.log("[Login] Auth account ready. Waiting for authStore to migrate profile...");
    } catch (err: any) {
      let msg = err.message;
      if (err.code === 'auth/invalid-email') msg = "유효하지 않은 이메일 형식입니다.";
      if (err.code === 'auth/email-already-in-use') msg = "이미 활성화된 계정입니다. 일반 로그인을 시도하세요.";
      if (err.code === 'permission-denied') msg = "현재 접근 권한이 서버 보안 규칙에 의해 거부되었습니다.";
      
      setError(msg);
      console.error("[Login] Activation failed:", err);
      setLoading(false);
    } finally {
      setAuthStatus('IDLE');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const loginInput = email.trim().toLowerCase();
    
    // Auth 인증용 이메일 결정
    let authEmail = loginInput;
    
    // 만약 @가 포함되어 있지 않다면 (아이디만 입력했다면) 실제 계정 탐색 시도
    if (!loginInput.includes('@')) {
      try {
        const q = query(
          collection(db, 'UserProfile'),
          where('email', '>=', loginInput + '@'),
          where('email', '<=', loginInput + '@' + '\uf8ff'),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const actualEmail = querySnapshot.docs[0].data().email;
          console.log(`[Discovery] ID '${loginInput}' matched actual email: ${actualEmail}`);
          authEmail = actualEmail;
        } else {
          // 탐색 실패 시 기본 도메인 사용 (폴백)
          authEmail = `${loginInput}@${systemDomain}`;
        }
      } catch (discoveryErr) {
        console.warn('Email discovery failed:', discoveryErr);
        authEmail = `${loginInput}@${systemDomain}`;
      }
    }

    try {
      await signInWithEmailAndPassword(auth, authEmail, password);
      setLoading(false);
      // mustChangePassword 감시는 useEffect에서 처리
    } catch (err: any) {
      // 계정 없음 혹은 인증 실패 시 자동 활성화 프로세스 시도
      console.log("Login failed, attempting account activation flow...");
      await handleAutoRegistration(authEmail, password);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("인증 세션이 만료되었습니다.");

      await updatePassword(user, newPassword);

      try {
        await updateDoc(doc(db, 'UserProfile', user.uid), {
          mustChangePassword: false,
          lastPasswordChange: new Date().toISOString()
        });

        await addDoc(collection(db, 'AuditLogs'), {
          timestamp: new Date().toISOString(),
          actionType: 'UPDATE_PASSWORD',
          performedBy: userData?.name || '시스템',
          targetId: user.uid,
          targetName: userData?.name || '',
          details: '최초 로그인 비밀번호 변경 완료 (계정 활성화)'
        });
      } catch (dbErr) {
        console.error("Non-fatal Database Error during password change:", dbErr);
      }

      setLoading(false);
      setChangeSuccess(true);
      alert("비밀번호가 성공적으로 변경되었습니다.");
      setLoginModalOpen(false);

      setChangeSuccess(true);
      setTimeout(() => {
        setLoginModalOpen(false);
        setChangeSuccess(false);
      }, 2000);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError('보안 세션이 만료되었습니다. 안전한 비밀번호 변경을 위해 로그아웃 후 다시 로그인해 주세요.');
      } else {
        setError('비밀번호 변경 실패: ' + err.message);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedMasterAdmin = async (isAuto = false) => {
    const adminEmail = `bizpeer@${systemDomain}`;
    const adminPassword = "123456";

    try {
      if (!isAuto) setLoading(true);
      setError('');
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
      const uid = userCredential.user.uid;
      
      await setDoc(doc(db, 'UserProfile', uid), {
        uid,
        email: adminEmail,
        name: '최고 관리자',
        role: 'ADMIN',
        teamHistory: [],
        mustChangePassword: true,
        createdAt: new Date().toISOString()
      });
      
      if (isAuto) {
        alert(`[시스템 초기설정 완료] 마스터 관리자 계정이 생성되었습니다.\nID: bizpeer\nPW: ${adminPassword}`);
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        if (!isAuto) console.log("Master Admin already exists.");
      }
    } finally {
      if (!isAuto) setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative animate-in fade-in zoom-in duration-300">
        {/* 최고관리자이거나, 수동 모드이거나, 비밀번호 변경 필수 모드가 아닐 때 닫기 버튼을 노출합니다 */}
        {(!isChangeMode || (isChangeMode && (!userData?.mustChangePassword || userData?.email?.toLowerCase().includes('bizpeer@') || isManualChangeMode))) && (
          <button 
            onClick={() => setLoginModalOpen(false)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-8">
          {authStatus !== 'IDLE' ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-indigo-600">
              <UserPlus className="w-12 h-12 animate-pulse" />
              <div className="text-center">
                <p className="font-bold text-lg">계정을 활성화하는 중입니다</p>
                <p className="text-sm text-gray-400">최초 로그인 시 1회 진행됩니다.</p>
              </div>
              <Loader2 className="w-6 h-6 animate-spin mt-2" />
            </div>
          ) : isChangeMode ? (
            <div className="text-center">
              {changeSuccess ? (
                <div className="py-10 flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">환영합니다!</h3>
                  <p className="text-gray-500">계정이 활성화되었습니다.</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center mb-6">
                    <div className="p-4 bg-indigo-50 rounded-2xl">
                      <KeyRound className="w-10 h-10 text-indigo-600" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">비밀번호 변경</h2>
                  <p className="text-gray-500 text-sm mb-8">보안을 위해 초기 비밀번호를<br/>반드시 변경해 주세요.</p>

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    {error && (
                      <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-center gap-2 text-xs font-medium border border-red-100">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                      </div>
                    )}
                    <div className="text-left">
                      <label className="block text-xs font-bold text-gray-500 uppercase ml-1 mb-1.5">새 비밀번호 (1차 입력)</label>
                      <input
                        type="password"
                        required
                        className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        placeholder="최소 6자 이상"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div className="text-left">
                      <label className="block text-xs font-bold text-gray-500 uppercase ml-1 mb-1.5">비밀번호 재확인 (2차 입력)</label>
                      <input
                        type="password"
                        required
                        className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 outline-none transition-all ${
                          confirmPassword && newPassword !== confirmPassword 
                            ? 'border-red-200 focus:ring-red-500 focus:border-red-500' 
                            : 'border-indigo-100 focus:ring-indigo-500 focus:border-indigo-500'
                        }`}
                        placeholder="새 비밀번호 다시 입력"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 mt-4"
                    >
                      {loading ? '변경 중...' : '비밀번호 저장 및 시작'}
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  <span className="text-indigo-600">HR Flow</span> 로그인
                </h2>
                <p className="text-gray-500">계속하시려면 로그인해주세요</p>
              </div>

              {isInitializing ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-indigo-600">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="font-medium">시스템 최적화 중...</p>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-5">
                  {error && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-100">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">아이디 또는 이메일</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        placeholder="아이디 또는 email@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">비밀번호</label>
                      <input
                        type="password"
                        required
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        placeholder="비밀번호 입력"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                  >
                    {loading ? '인증 중...' : '로그인'}
                  </button>
                </form>
              )}
              
              <div className="mt-6 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  최초 로그인 시 비밀번호 변경 요망
                </p>
                <button 
                  onClick={() => handleSeedMasterAdmin(false)}
                  className="text-xs text-indigo-400 hover:text-indigo-600 flex items-center gap-1.5 px-2 py-1 hover:bg-indigo-50 rounded-lg transition-all font-medium"
                  title="마스터 계정 초기화"
                >
                  <Settings className="w-4 h-4" />
                  마스터 설정
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
