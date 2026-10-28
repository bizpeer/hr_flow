import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Download, FileCheck2, Loader2, RefreshCw } from 'lucide-react';
import { draftingKindLabel, officialLetters, seoulDate } from '../services/officialLetterService';
import type { LetterDateRange, LetterSummary } from '../services/officialLetterService';
import { useAuthStore } from '../store/authStore';

function documentError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) return '서류 접근 권한 또는 로그인 상태가 변경되었습니다. 다시 로그인한 후 확인해 주세요.';
  if (code.endsWith('aborted') || code.endsWith('failed-precondition') || code.endsWith('not-found')) return '서류 상태가 변경되었습니다. 목록을 새로고침한 후 다시 시도해 주세요.';
  return '서류를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.';
}

function recent30DayRange(): LetterDateRange {
  const endDate = seoulDate();
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function IssuedDocuments({ uid }: { uid: string }) {
  const alive = useRef(true);
  const requestId = useRef(0);
  const [initialRange] = useState(recent30DayRange);
  const [draftRange, setDraftRange] = useState<LetterDateRange>(initialRange);
  const [appliedRange, setAppliedRange] = useState<LetterDateRange>(initialRange);
  const appliedRangeRef = useRef(initialRange);
  const [rangeError, setRangeError] = useState('');
  const [state, setState] = useState<{ letters: LetterSummary[]; loading: boolean; error: string }>({ letters: [], loading: true, error: '' });
  const [downloading, setDownloading] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const load = useCallback(async (range: LetterDateRange) => {
    const request = ++requestId.current;
    setState({ letters: [], loading: true, error: '' });
    setDownloadError('');
    try {
      const result = await officialLetters.mine(range);
      if (alive.current && request === requestId.current) setState({
        letters: result.letters.filter(letter => letter.creatorId === uid && letter.status === 'ISSUED' &&
          Boolean(letter.issueDate && letter.issueDate >= range.startDate && letter.issueDate <= range.endDate)), loading: false, error: '',
      });
    } catch (error) {
      if (alive.current && request === requestId.current) setState({ letters: [], loading: false, error: documentError(error) });
    }
  }, [uid]);

  const refresh = useCallback(() => {
    void load(appliedRangeRef.current);
  }, [load]);

  const applyRange = (range: LetterDateRange) => {
    if (!range.startDate || !range.endDate) { setRangeError('시작일과 종료일을 모두 입력해 주세요.'); return; }
    if (range.startDate < '1900-01-01' || range.endDate < '1900-01-01') { setRangeError('1900년 1월 1일 이후의 날짜를 입력해 주세요.'); return; }
    if (range.startDate > range.endDate) { setRangeError('시작일은 종료일보다 늦을 수 없습니다.'); return; }
    const applied = { ...range };
    appliedRangeRef.current = applied; setAppliedRange(applied); setRangeError('');
    void load(applied);
  };

  useEffect(() => {
    alive.current = true;
    void load(appliedRangeRef.current);
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
        <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-indigo-600" />내 발급 서류</h2><p className="mt-1 text-sm text-slate-500">승인·발행된 PDF를 다운로드해 외부 PDF 프로그램에서 인쇄합니다.</p></div>
        <div className="flex items-center gap-3"><Link to="/documents" className="text-sm font-bold text-indigo-600 hover:underline">서류발급</Link><button type="button" disabled={state.loading} onClick={refresh} aria-label="내 발급 서류 새로고침" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} /></button></div>
      </div>
      <form className="mt-5 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" aria-label="내 발급 서류 기간 조회" noValidate onSubmit={event => { event.preventDefault(); applyRange(draftRange); }}>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600 sm:col-span-1">시작일
          <input type="date" min="1900-01-01" required value={draftRange.startDate} onChange={event => { setDraftRange(previous => ({ ...previous, startDate: event.target.value })); setRangeError(''); }} className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 sm:w-auto" />
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600 sm:col-span-1">종료일
          <input type="date" min="1900-01-01" required value={draftRange.endDate} onChange={event => { setDraftRange(previous => ({ ...previous, endDate: event.target.value })); setRangeError(''); }} className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 sm:w-auto" />
        </label>
        <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">조회</button>
        <button type="button" onClick={() => { const recent = recent30DayRange(); setDraftRange(recent); applyRange(recent); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">최근 30일</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">발행일 기준 (한국 시간) · {appliedRange.startDate} ~ {appliedRange.endDate}{!state.loading && !state.error ? ` · ${state.letters.length}건` : ''}</p>
      {rangeError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{rangeError}</p>}
      {downloadError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{downloadError}</div>}
      {state.loading ? <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />내 발급 서류를 불러오는 중입니다.</p> : state.error ? (
        <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{state.error}<button type="button" onClick={refresh} className="mt-2 block font-bold underline">다시 시도</button></div>
      ) : state.letters.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">선택한 기간에 발행 완료된 내 서류가 없습니다.</p> : (
        <ul aria-label="내 발급 서류 목록" className="mt-4 grid max-h-[32rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {state.letters.map(letter => (
            <li key={letter.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="min-w-0"><p className="text-xs font-semibold text-indigo-600">{letter.documentType === 'DRAFTING' ? draftingKindLabel(letter.draftingKind) : letter.documentType === 'EMPLOYMENT' ? '재직증명서' : letter.documentType === 'CAREER' ? '경력증명서' : '공문'}</p><Link to={`/${letter.documentType === 'DRAFTING' ? 'drafting' : 'documents'}?letter=${encodeURIComponent(letter.id)}`} className="mt-2 block break-words text-sm font-bold text-slate-800 hover:text-indigo-600">{letter.title}</Link>{letter.number && <p className="mt-3 break-all text-xs font-semibold text-slate-600">{letter.number}</p>}<p className="mt-1 text-xs text-slate-500">발행일 {letter.issueDate || '-'}</p></div>
              <button type="button" onClick={() => void download(letter)} disabled={Boolean(downloading)} className="mt-auto inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-50 disabled:opacity-50">{downloading === letter.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}PDF 다운로드</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MyIssuedDocuments() {
  const { user, userData } = useAuthStore();
  if (!user || !userData || user.uid !== userData.uid || (userData.status && userData.status !== 'ACTIVE') || userData.mustChangePassword || userData.role === 'SUPER_ADMIN') return null;
  return <IssuedDocuments key={`${user.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} uid={user.uid} />;
}
