import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebase';
import { officialLetters } from '../services/officialLetterService';
import type { OfficialLetter } from '../services/officialLetterService';
import { officialLetterErrorMessage as errorMessage } from '../utils/officialLetterErrors';

export function DeleteIssuedDialog({ letter, stillCurrent, onClose, onResult }: {
  letter: OfficialLetter;
  stillCurrent: () => boolean;
  onClose: () => void;
  onResult: (result: { success: boolean; cleanupPending?: boolean }) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const submitting = useRef(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    alive.current = true; dialog.current?.showModal();
    return () => { alive.current = false; };
  }, []);
  const active = () => alive.current && stillCurrent();
  const remove = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !password || !active()) return;
    const administrator = auth.currentUser;
    if (!administrator?.email) { setPassword(''); setError('관리자 인증 상태를 확인해 주세요.'); return; }
    submitting.current = true; setPending(true); setError('');
    const credential = EmailAuthProvider.credential(administrator.email, password);
    setPassword('');
    try {
      await reauthenticateWithCredential(administrator, credential);
      if (!active() || auth.currentUser?.uid !== administrator.uid) return;
      await administrator.getIdToken(true);
      if (!active() || auth.currentUser?.uid !== administrator.uid) return;
      const result = await officialLetters.deleteIssued(letter);
      if (!active()) return;
      await onResult(result);
    } catch (failure) {
      if (active()) {
        const code = typeof failure === 'object' && failure !== null && 'code' in failure ? String(failure.code) : '';
        setError(code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? '관리자 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.' : errorMessage(failure));
      }
    } finally {
      submitting.current = false;
      if (alive.current) { setPassword(''); setPending(false); }
    }
  };
  return <dialog ref={dialog} aria-labelledby="delete-issued-title" className="ol-delete-dialog m-auto w-11/12 max-w-lg rounded-2xl p-6 shadow-xl backdrop:bg-slate-900/50"
    onCancel={event => { event.preventDefault(); if (!pending) { setPassword(''); onClose(); } }}>
    <form onSubmit={event => { void remove(event); }} className="space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 id="delete-issued-title" className="font-bold text-lg">발급 서류 삭제 확인</h2><button type="button" aria-label="삭제 확인 닫기" className="ol-button" disabled={pending} onClick={() => { setPassword(''); onClose(); }}><X size={16} /></button></div>
      <p className="break-words text-sm font-semibold">{letter.number} · {letter.content.title}</p>
      <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">현재 서류 내용과 수정 전 이력, 연결된 모든 PDF 및 관련 알림을 영구 삭제합니다. 삭제한 내용은 복구할 수 없으며 발급번호는 다시 사용하지 않습니다. 회사 공용 로고·인감은 유지됩니다.</p>
      {letter.status === 'DELETING' && <p className="text-sm text-amber-800">일부 삭제가 완료되지 않았습니다. 비밀번호를 확인한 뒤 남은 삭제 처리를 다시 시도합니다.</p>}
      <label className="ol-label">관리자 비밀번호<input type="password" autoComplete="current-password" required autoFocus value={password} disabled={pending} className="ol-input" onChange={event => { setPassword(event.target.value); setError(''); }} /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {pending && <p role="status" className="text-sm text-indigo-700">관리자 인증 및 삭제 처리를 확인하고 있습니다.</p>}
      <div className="flex gap-2"><button type="submit" className="ol-primary" disabled={pending || !password}>{letter.status === 'DELETING' ? '삭제 다시 시도' : '영구 삭제'}</button><button type="button" className="ol-button" disabled={pending} onClick={() => { setPassword(''); onClose(); }}>취소</button></div>
    </form>
  </dialog>;
}
