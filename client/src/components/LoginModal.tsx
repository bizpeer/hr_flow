import { useState } from 'react';
import type { FormEvent } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { accountSecurity } from '../services/accountSecurityService';
import { AlertCircle, X, KeyRound, Loader2, LogOut } from 'lucide-react';

function PasswordChangeDialog({ manual, required }: { manual: boolean; required: boolean }) {
  const { logout, setLoginModalOpen } = useAuthStore();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function change(event: FormEvent) {
    event.preventDefault(); setError('');
    if (newPassword !== confirmation) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    if (newPassword.length < 12 || newPassword.length > 128) { setError('새 비밀번호는 12~128자로 입력해 주세요.'); return; }
    setWorking(true);
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error('인증 세션이 만료되었습니다. 다시 로그인해 주세요.');
      if (manual) {
        if (!currentPassword) throw new Error('현재 비밀번호를 입력해 주세요.');
        try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword)); }
        catch { throw new Error('현재 비밀번호를 확인해 주세요.'); }
        await user.getIdToken(true);
      }
      await accountSecurity.changePassword(newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      await logout();
      window.alert('비밀번호를 변경했습니다. 1초 후 새 비밀번호로 다시 로그인해 주세요.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '비밀번호를 변경하지 못했습니다. 다시 시도해 주세요.');
    } finally { setWorking(false); }
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative p-8">
      {(!required || manual) && <button type="button" aria-label="비밀번호 변경 닫기" disabled={working} className="absolute top-4 right-4 p-2 text-slate-500" onClick={() => setLoginModalOpen(false)}><X size={20} /></button>}
      <div className="flex justify-center mb-5"><KeyRound className="text-indigo-600" size={40} /></div>
      <h2 id="password-change-title" className="text-2xl font-bold text-center">비밀번호 변경</h2>
      <p className="text-slate-600 text-sm text-center mt-3 mb-6">{required ? '초기 비밀번호를 변경해야 업무 기능을 사용할 수 있습니다.' : '현재 비밀번호를 확인한 뒤 새 비밀번호를 설정합니다.'} 변경 후에는 새 비밀번호로 다시 로그인합니다.</p>
      <form onSubmit={event => { void change(event); }} className="space-y-4">
        {error && <p role="alert" className="bg-red-50 text-red-800 p-3 rounded-lg flex gap-2 text-sm"><AlertCircle className="shrink-0" size={18} />{error}</p>}
        <fieldset disabled={working} className="space-y-4">
          {manual && <label className="block text-sm font-semibold">현재 비밀번호<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="w-full px-4 py-3 border rounded-xl mt-1" /></label>}
          <label className="block text-sm font-semibold">새 비밀번호<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="w-full px-4 py-3 border rounded-xl mt-1" /></label>
          <label className="block text-sm font-semibold">새 비밀번호 확인<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full px-4 py-3 border rounded-xl mt-1" /></label>
          <p className="text-xs text-slate-500">12~128자를 입력해 주세요. 공통 초기 비밀번호를 새 비밀번호로 사용할 수 없습니다. 최근 로그인 시간이 오래되었다면 다시 로그인해 주세요.</p>
          <button className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold flex gap-2 items-center justify-center">{working && <Loader2 className="animate-spin" size={18} />}비밀번호 변경 후 다시 로그인</button>
        </fieldset>
      </form>
      <button type="button" disabled={working} className="mt-5 w-full flex gap-2 justify-center items-center text-sm text-slate-600" onClick={() => { void logout(); }}><LogOut size={16} />로그아웃하고 다시 로그인</button>
    </div>
  </div>;
}

export function LoginModal() {
  const { userData, isLoginModalOpen, isManualChangeMode } = useAuthStore();
  if (!userData || !isLoginModalOpen || (!userData.mustChangePassword && !isManualChangeMode)) return null;
  return <PasswordChangeDialog key={`${userData.uid}:${isManualChangeMode}`} manual={isManualChangeMode} required={!!userData.mustChangePassword} />;
}
