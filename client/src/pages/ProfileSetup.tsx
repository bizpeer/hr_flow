import React, { useState } from 'react';
import { reload, sendEmailVerification } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { accountSecurity, clearCompanySignup, readCompanySignup, saveCompanySignup } from '../services/accountSecurityService';
import { AlertCircle, Building2, User, Globe, ArrowRight, Loader2, LogOut } from 'lucide-react';

export const ProfileSetup: React.FC = () => {
  const { user, logout, refreshSession } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft] = useState(() => readCompanySignup(user?.email || ''));
  const [name, setName] = useState(draft.name);
  const [orgKo, setOrgKo] = useState(draft.nameKo);
  const [orgEn, setOrgEn] = useState(draft.nameEn);
  const [verified, setVerified] = useState(!!user?.emailVerified);
  const [notice, setNotice] = useState('');

  if (!user) return null;

  const checkVerification = async (resend: boolean) => {
    setError(''); setNotice(''); setLoading(true);
    try {
      if (resend) { await sendEmailVerification(user); setNotice('인증 메일을 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.'); }
      else {
        await reload(user); await user.getIdToken(true); setVerified(user.emailVerified);
        if (!user.emailVerified) setError('이메일 인증이 아직 확인되지 않았습니다. 인증 메일의 링크를 누른 후 다시 확인해 주세요.');
        else setNotice('이메일 인증을 확인했습니다. 아래 조직 등록을 완료해 주세요.');
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '이메일 인증 상태를 확인하지 못했습니다.'); }
    finally { setLoading(false); }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim() || !orgKo.trim() || !orgEn.trim()) {
      setError('모든 정보를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const company = { name: name.trim(), nameKo: orgKo.trim(), nameEn: orgEn.trim() };
      saveCompanySignup(user.email || '', company);
      await reload(user); await user.getIdToken(true); setVerified(user.emailVerified);
      if (!user.emailVerified) { setError('조직 등록 전에 이메일 인증을 완료해 주세요.'); return; }
      await accountSecurity.createCompany(company);
      clearCompanySignup(user.email || '');
      await refreshSession();
      if (useAuthStore.getState().authError) throw new Error(useAuthStore.getState().authError || '계정 상태를 다시 확인해 주세요.');
      window.location.hash = '/dashboard';
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : '프로필 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg">HF</div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">프로필 설정</h1>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-2xl p-4 mb-8 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">이메일 인증 후 조직 등록을 완료해 주세요.</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                회사 식별자와 관리자 프로필은 서버에서 생성합니다. 기존 등록 복구는 해당 회사의 원래 소유자만 할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 mb-6 space-y-3 text-sm">
            <p className="font-semibold break-all">{user.email}</p>
            <p>{verified ? '이메일 인증 완료' : '이메일 인증이 필요합니다. 인증 메일의 링크를 누른 뒤 확인해 주세요.'}</p>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => { void checkVerification(false); }} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">이메일 인증 확인</button>
              {!verified && <button type="button" disabled={loading} onClick={() => { void checkVerification(true); }} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700">인증 메일 다시 보내기</button>}</div>
            {notice && <p role="status" className="text-emerald-700">{notice}</p>}
          </div>

          <form onSubmit={handleSetup} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">사용자 이름</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-white"
                  placeholder="성함을 입력하세요"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">조직 이름 (한글)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    maxLength={120}
                    value={orgKo}
                    onChange={(e) => setOrgKo(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-white"
                    placeholder="예: (주)에이테르노"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">조직 이름 (영문)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                    <Globe className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    maxLength={120}
                    value={orgEn}
                    onChange={(e) => setOrgEn(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-white"
                    placeholder="예: Aeterno Co., Ltd."
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !verified}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 group active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  설정 완료 및 시작하기
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700/50">
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              다른 계정으로 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
