import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Download, FileCheck2, Loader2, RefreshCw } from 'lucide-react';
import { officialLetters } from '../services/officialLetterService';
import type { LetterSummary } from '../services/officialLetterService';
import { useAuthStore } from '../store/authStore';

function documentError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) return '서류 접근 권한 또는 로그인 상태가 변경되었습니다. 다시 로그인한 후 확인해 주세요.';
  if (code.endsWith('aborted') || code.endsWith('failed-precondition') || code.endsWith('not-found')) return '서류 상태가 변경되었습니다. 목록을 새로고침한 후 다시 시도해 주세요.';
  return '서류를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.';
}

function IssuedDocuments({ uid }: { uid: string }) {
  const alive = useRef(true);
  const requestId = useRef(0);
  const [state, setState] = useState<{ letters: LetterSummary[]; loading: boolean; error: string }>({ letters: [], loading: true, error: '' });
  const [downloading, setDownloading] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const load = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const result = await officialLetters.mine();
      if (alive.current && request === requestId.current) setState({
        letters: result.letters.filter(letter => letter.creatorId === uid && letter.status === 'ISSUED'), loading: false, error: '',
      });
    } catch (error) {
      if (alive.current && request === requestId.current) setState({ letters: [], loading: false, error: documentError(error) });
    }
  }, [uid]);

  const refresh = useCallback(() => {
    setState({ letters: [], loading: true, error: '' });
    setDownloadError('');
    void load();
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void load();
    window.addEventListener('focus', refresh);
    return () => { alive.current = false; requestId.current += 1; window.removeEventListener('focus', refresh); };
  }, [load, refresh]);

  const download = async (summary: LetterSummary) => {
    setDownloading(summary.id);
    setDownloadError('');
    try {
      const { letter } = await officialLetters.get(summary.id);
      if (!alive.current) return;
      if (letter.creatorId !== uid || letter.status !== 'ISSUED') {
        setDownloadError('서류 상태가 변경되었습니다. 목록을 새로고침해 주세요.');
        return;
      }
      // Get the current revision first; the server rechecks approval and access
      // when returning the private PDF, including after generation.
      const result = await officialLetters.pdf(letter);
      if (!alive.current) return;
      const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (alive.current) setDownloadError(documentError(error));
    } finally {
      if (alive.current) setDownloading('');
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7" aria-label="내 발급 서류">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-indigo-600" />내 발급 서류</h2><p className="mt-1 text-sm text-slate-500">내가 신청하고 승인·발행이 완료된 서류를 내려받습니다.</p></div>
        <div className="flex items-center gap-3"><Link to="/documents" className="text-sm font-bold text-indigo-600 hover:underline">서류발급</Link><button type="button" disabled={state.loading} onClick={refresh} aria-label="내 발급 서류 새로고침" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} /></button></div>
      </div>
      {downloadError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{downloadError}</div>}
      {state.loading ? <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />내 발급 서류를 불러오는 중입니다.</p> : state.error ? (
        <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{state.error}<button type="button" onClick={refresh} className="mt-2 block font-bold underline">다시 시도</button></div>
      ) : state.letters.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">발행 완료된 내 서류가 없습니다.</p> : (
        <div className="mt-4 max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {state.letters.map(letter => (
            <div key={letter.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0"><p className="text-xs font-semibold text-indigo-600">{letter.documentType === 'EMPLOYMENT' ? '재직증명서' : letter.documentType === 'CAREER' ? '경력증명서' : '공문'}</p><Link to={`/documents?letter=${encodeURIComponent(letter.id)}`} className="mt-1 block break-words text-sm font-bold text-slate-800 hover:text-indigo-600">{letter.title}</Link><p className="mt-1 text-xs text-slate-500">{letter.number} · 발행일 {letter.issueDate || '-'}</p></div>
              <button type="button" onClick={() => void download(letter)} disabled={Boolean(downloading)} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 sm:self-auto">{downloading === letter.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{letter.pdfReady ? 'PDF 다운로드' : 'PDF 생성·다운로드'}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function MyIssuedDocuments() {
  const { user, userData } = useAuthStore();
  if (!user || !userData || user.uid !== userData.uid || userData.status === 'RESIGNED' || userData.role === 'SUPER_ADMIN') return null;
  return <IssuedDocuments key={`${user.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} uid={user.uid} />;
}
