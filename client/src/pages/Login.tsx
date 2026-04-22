import React, { useState } from 'react';
import { auth, db, functions } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, LogIn, UserPlus, AlertCircle, Mail, Lock, User, Building2, Globe, ArrowRight } from 'lucide-react';

type TabMode = 'login' | 'register';

export const Login: React.FC = () => {
  const [mode, setMode] = useState<TabMode>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const navigate = useNavigate();

  // 로그인 폼
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 회원가입 폼
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regOrgKo, setRegOrgKo] = useState('');
  const [regOrgEn, setRegOrgEn] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail.trim().toLowerCase(), loginPassword);
      
      // [고스트 계정(Ghost Session) 방어 로직] 
      // DB에서 수동으로 문서를 삭제했을 때 Firebase Auth만 남는 현상 방지
      if (userCredential.user.email !== 'bizpeer@gmail.com') {
        const { getDoc } = await import('firebase/firestore');
        const profileSnap = await getDoc(doc(db, 'UserProfile', userCredential.user.uid));
        
        if (!profileSnap.exists()) {
          try {
            await userCredential.user.delete(); // 즉각적인 Auth DB 찌꺼기 삭제
            setError('이전 테넌트(조직) 정보가 제거된 계정입니다. 안전하게 초기화되었으므로, [회원가입] 탭에서 새로운 조직을 생성해주세요.');
          } catch (e) {
            await auth.signOut();
            setError('접근할 수 없는 계정입니다 (데이터 유실). 원활한 처리를 위해 관리자에게 문의해주세요.');
          }
          setLoading(false);
          return;
        }
      }

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('보안 정책상 잠시 후 다시 시도해주세요.');
      } else {
        setError('로그인 중 오류가 발생했습니다: ' + err.message);
      }
    } finally {
      if (!error) setLoading(false); // 오류가 세팅된 경우 UI 로딩 상태는 바로 위 코드블록에서 해제함
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 유효성 검증
    if (regPassword !== regConfirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (regPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (!regOrgKo.trim() || !regOrgEn.trim()) {
      setError('조직 이름(한글, 영문)을 모두 입력해주세요.');
      return;
    }
    if (!regEmail.includes('@') || !regEmail.includes('.')) {
      setError('유효한 이메일 주소를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = regEmail.trim().toLowerCase();
      const domain = normalizedEmail.split('@')[1];

      // [도메인 중복 체크 로직 추가]
      const checkDomain = httpsCallable(functions, 'checkDomainAvailability');
      const result = await checkDomain({ domain });
      const { available, message: domainMsg } = result.data as { available: boolean; message?: string };

      if (!available) {
        setError(domainMsg || '이미 등록된 회사 도메인입니다. 관리자 계정 생성 시 중복된 도메인은 사용할 수 없습니다.');
        setLoading(false);
        return;
      }
      
      // 1. Firebase Auth 계정 생성
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, regPassword);
      const uid = userCredential.user.uid;

      // 2. 이메일에서 도메인 추출 → company_id로 사용
      const companyId = domain.replace(/\./g, '_'); // aeterno.co.kr → aeterno_co_kr

      // 3. 회사 문서 생성
      await setDoc(doc(db, 'companies', companyId), {
        nameKo: regOrgKo.trim(),
        nameEn: regOrgEn.trim(),
        domain: domain,
        adminUid: uid,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
        plan: 'FREE'
      });

      // 4. UserProfile 생성 (ADMIN 권한)
      await setDoc(doc(db, 'UserProfile', uid), {
        uid,
        email: normalizedEmail,
        name: regName.trim(),
        role: 'ADMIN',
        companyId: companyId,
        teamHistory: [],
        mustChangePassword: false,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      });

      // 5. 회사별 config 문서 생성
      await setDoc(doc(db, 'config', companyId), {
        defaultDomain: domain,
        updatedAt: new Date().toISOString(),
        updatedBy: uid
      });

      console.log("[Register] Company and Admin created:", companyId);
      setRegisterSuccess(true);
      
      // 2초 후 대시보드로 이동
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);

    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('이미 등록된 이메일입니다. 로그인을 시도해주세요.');
      } else {
        setError('회원가입 중 오류가 발생했습니다: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (registerSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900">
        <div className="text-center animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border-2 border-emerald-200 dark:border-emerald-500/30">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">조직 생성 완료!</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">대시보드로 이동합니다...</p>
          <Loader2 className="w-6 h-6 text-indigo-500 dark:text-indigo-400 animate-spin mx-auto mt-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 relative overflow-hidden">
      {/* 백그라운드 장식 */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-200/50 dark:bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-200/50 dark:bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-100/50 dark:bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md mx-4 relative z-10">
        {/* 로고 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-xl italic shadow-xl shadow-indigo-200 dark:shadow-indigo-900/50">HF</div>
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">HR <span className="text-indigo-600 dark:text-indigo-400">FLOW</span></div>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">조직의 성장을 가속화하는 지능형 HR 솔루션</p>
        </div>

        {/* 탭 전환 */}
        <div className="flex bg-white/60 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-1.5 mb-6 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 ${
              mode === 'login' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <LogIn className="w-4 h-4" />
            로그인
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 ${
              mode === 'register' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            회원가입
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 p-4 rounded-2xl flex items-center gap-3 text-sm font-medium mb-6 backdrop-blur-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* 카드 */}
        <div className="bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl rounded-3xl border border-white/50 dark:border-slate-700/50 overflow-hidden shadow-2xl">
          {mode === 'login' ? (
            /* 로그인 폼 */
            <form onSubmit={handleLogin} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="비밀번호 입력"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-200 dark:shadow-indigo-900/30 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          ) : (
            /* 회원가입 폼 */
            <form onSubmit={handleRegister} className="p-8 space-y-5">
              <div className="text-center mb-2">
                <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">가입 즉시 조직 관리자(ADMIN) 권한이 부여됩니다</p>
              </div>

              <div className="space-y-4">
                {/* 관리자 정보 */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">관리자 이름</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">이메일 (로그인 ID)</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">이메일 도메인이 회사 ID로 자동 생성됩니다</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">비밀번호</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <input
                        type="password"
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="6자 이상"
                        className="w-full pl-11 pr-3 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">비밀번호 확인</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <input
                        type="password"
                        required
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="재입력"
                        className={`w-full pl-11 pr-3 py-3.5 bg-slate-50 dark:bg-slate-900/50 border rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 outline-none transition-all font-medium text-sm ${
                          regConfirmPassword && regPassword !== regConfirmPassword 
                            ? 'border-rose-300 dark:border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20' 
                            : 'border-slate-200 dark:border-slate-600/50 focus:border-indigo-500 focus:ring-indigo-500/20'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 구분선 */}
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <Building2 className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <span className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">조직 정보</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">조직명 (한글)</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      required
                      value={regOrgKo}
                      onChange={(e) => setRegOrgKo(e.target.value)}
                      placeholder="에테르노"
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">조직명 (영문)</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      required
                      value={regOrgEn}
                      onChange={(e) => setRegOrgEn(e.target.value)}
                      placeholder="Aeterno"
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600/50 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-200 dark:shadow-indigo-900/30 active:scale-[0.98] disabled:opacity-50 mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                {loading ? '등록 중...' : '조직 생성 및 가입'}
              </button>
            </form>
          )}
        </div>

        {/* 하단 */}
        <p className="text-center text-slate-500 dark:text-slate-600 text-xs mt-8 font-medium">
          © 2026 HR Flow SaaS Platform. All rights reserved.
        </p>
      </div>
    </div>
  );
};
