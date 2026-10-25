import { useCallback, useEffect, useRef, useState } from 'react';
import { officialLetters } from '../services/officialLetterService';
import type { LetterSummary } from '../services/officialLetterService';
import { useAuthStore } from '../store/authStore';

function inboxError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.endsWith('permission-denied')) return '서류 결재 권한이 없습니다. 회사 관리자에게 결재 권한과 소속 본부를 확인해 주세요.';
  if (code.endsWith('unauthenticated')) return '로그인 상태를 확인한 후 다시 시도해 주세요.';
  return '서류 결재함을 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.';
}

export interface DocumentApprovalInboxState {
  canAccess: boolean;
  role: 'ADMIN' | 'SUB_ADMIN' | null;
  letters: LetterSummary[];
  loading: boolean;
  error: string;
  pendingCount: number | null;
  refresh: () => void;
}

export function useDocumentApprovalInbox(): DocumentApprovalInboxState {
  const { user, userData, loading: authLoading, sessionReady } = useAuthStore();
  const role = userData?.role === 'ADMIN' || userData?.role === 'SUB_ADMIN' ? userData.role : null;
  const canAccess = Boolean(!authLoading && sessionReady && user && userData && user.uid === userData.uid &&
    userData.companyId && role && (userData.status == null || userData.status === 'ACTIVE') && !userData.mustChangePassword);
  const scope = JSON.stringify([user?.uid, userData?.uid, userData?.companyId, role, userData?.divisionId || '']);
  const sequence = useRef(0);
  const [stored, setStored] = useState<{ scope: string; letters: LetterSummary[]; loading: boolean; error: string }>({
    scope: '', letters: [], loading: true, error: '',
  });

  const refresh = useCallback(() => {
    if (!canAccess) return;
    const request = ++sequence.current;
    // Start asynchronously so the initial effect and focus/manual refresh use
    // one path, while a superseded scope can never publish its response.
    void Promise.resolve().then(async () => {
      if (request !== sequence.current) return;
      setStored({ scope, letters: [], loading: true, error: '' });
      try {
        const result = await officialLetters.approvals();
        if (request === sequence.current) setStored({ scope, letters: result.letters, loading: false, error: '' });
      } catch (error) {
        if (request === sequence.current) setStored({ scope, letters: [], loading: false, error: inboxError(error) });
      }
    });
  }, [canAccess, scope]);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => { sequence.current += 1; window.removeEventListener('focus', refresh); };
  }, [refresh]);

  const current = canAccess && stored.scope === scope;
  const loading = canAccess && (!current || stored.loading);
  const error = current ? stored.error : '';
  const letters = current ? stored.letters : [];
  return { canAccess, role, letters, loading, error, refresh,
    pendingCount: canAccess && !loading && !error ? letters.filter(letter => letter.status === 'PENDING').length : null };
}
