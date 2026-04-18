import React, { useState, useEffect } from 'react';
import { updatePassword } from 'firebase/auth';
import { 
  doc, updateDoc, addDoc, collection
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, X, KeyRound, CheckCircle2 } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { 
    isLoginModalOpen, setLoginModalOpen, userData,
    isManualChangeMode 
  } = useAuthStore();
  
  // 비밀번호 변경 관련
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [isChangeMode, setIsChangeMode] = useState(false);

  // 비밀번호 변경 필수 체크
  useEffect(() => {
    if (!userData) return;

    const isSuperAdmin = userData.role === 'SUPER_ADMIN';

    if (userData.mustChangePassword && !isSuperAdmin) {
      setIsChangeMode(true);
      setLoading(false);
    } else {
      setIsChangeMode(false);
      setLoginModalOpen(false);
    }
  }, [userData, setLoginModalOpen]);

  // 모달이 열릴 때 상태 동기화
  useEffect(() => {
    const isSuperAdmin = userData?.role === 'SUPER_ADMIN';
    if (isLoginModalOpen && (userData?.mustChangePassword && !isSuperAdmin)) {
      setIsChangeMode(true);
    } else if (isLoginModalOpen && isManualChangeMode) {
      setIsChangeMode(true);
    }
  }, [isLoginModalOpen, userData, isManualChangeMode]);

  if (!isLoginModalOpen) return null;

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
          details: '최초 로그인 비밀번호 변경 완료 (계정 활성화)',
          companyId: userData?.companyId || ''
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
        setError('보안 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.');
      } else {
        setError('비밀번호 변경 실패: ' + err.message);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 비밀번호 변경 모드가 아니면 모달을 표시하지 않음 (로그인은 Login.tsx에서 처리)
  if (!isChangeMode) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative animate-in fade-in zoom-in duration-300">
        {/* 수동 모드이거나, 비밀번호 변경 필수 모드가 아닐 때 닫기 버튼 */}
        {(!userData?.mustChangePassword || isManualChangeMode) && (
          <button 
            onClick={() => setLoginModalOpen(false)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-8">
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
        </div>
      </div>
    </div>
  );
};
