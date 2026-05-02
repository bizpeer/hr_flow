import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, Building2, User, Globe, ArrowRight, Loader2, LogOut } from 'lucide-react';

export const ProfileSetup: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [orgKo, setOrgKo] = useState('');
  const [orgEn, setOrgEn] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim() || !orgKo.trim() || !orgEn.trim()) {
      setError('모든 정보를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = user.email!.trim().toLowerCase();
      const domain = normalizedEmail.split('@')[1];
      const companyId = domain.replace(/\./g, '_');

      // 1. 회사 문서 생성
      await setDoc(doc(db, 'companies', companyId), {
        nameKo: orgKo.trim(),
        nameEn: orgEn.trim(),
        domain: domain,
        adminUid: user.uid,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
        plan: 'FREE'
      });

      // 2. UserProfile 생성 (ADMIN 권한 부여)
      await setDoc(doc(db, 'UserProfile', user.uid), {
        uid: user.uid,
        email: normalizedEmail,
        name: name.trim(),
        role: 'ADMIN',
        companyId: companyId,
        teamHistory: [],
        mustChangePassword: false,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      });

      // 3. Config 생성
      await setDoc(doc(db, 'config', companyId), {
        defaultDomain: domain,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      });

      console.log("[ProfileSetup] Recovery complete for:", companyId);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError('프로필 생성 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setLoading(true);
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
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">프로필 정보가 없습니다.</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                계정은 존재하나 필수 프로필 데이터가 없습니다. 서비스 이용을 위해 정보를 다시 설정해주세요.
              </p>
            </div>
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
              disabled={loading}
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
