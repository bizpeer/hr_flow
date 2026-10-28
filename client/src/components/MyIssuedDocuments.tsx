import { Button, Input, Panel } from './ui';
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
    <Panel as="section" className="wf-panel wf-issued-documents" aria-label="내 발급 서류">
      <div className="wf-panel-head">
        <div><h2><FileCheck2 size={18} />내 발급 서류</h2><p className="wf-issued-description">승인·발행된 PDF를 다운로드해 외부 PDF 프로그램에서 인쇄합니다.</p></div>
        <div className="wf-issued-head-actions"><Link to="/documents" className="wf-issued-link">서류발급</Link><Button type="button" disabled={state.loading} onClick={refresh} aria-label="내 발급 서류 새로고침" className="wf-btn wf-issued-refresh"><RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} /></Button></div>
      </div>
      <form className="wf-issued-date-filter" aria-label="내 발급 서류 기간 조회" noValidate onSubmit={event => { event.preventDefault(); applyRange(draftRange); }}>
        <label className="wf-field">시작일<Input type="date" min="1900-01-01" required value={draftRange.startDate} onChange={event => { setDraftRange(previous => ({ ...previous, startDate: event.target.value })); setRangeError(''); }} className="wf-input" /></label>
        <label className="wf-field">종료일<Input type="date" min="1900-01-01" required value={draftRange.endDate} onChange={event => { setDraftRange(previous => ({ ...previous, endDate: event.target.value })); setRangeError(''); }} className="wf-input" /></label>
        <Button type="submit" className="wf-btn wf-btn-primary">조회</Button>
        <Button type="button" onClick={() => { const recent = recent30DayRange(); setDraftRange(recent); applyRange(recent); }} className="wf-btn">최근 30일</Button>
      </form>
      <p className="wf-issued-period">발행일 기준 (한국 시간) · {appliedRange.startDate} ~ {appliedRange.endDate}{!state.loading && !state.error ? ` · ${state.letters.length}건` : ''}</p>
      {rangeError && <p role="alert" className="wf-issued-error">{rangeError}</p>}
      {downloadError && <div role="alert" className="wf-issued-error"><AlertCircle size={16} />{downloadError}</div>}
      {state.loading ? <p role="status" className="wf-issued-empty"><Loader2 size={18} className="animate-spin" />내 발급 서류를 불러오는 중입니다.</p> : state.error ? (
        <div role="alert" className="wf-issued-error">{state.error}<button type="button" onClick={refresh}>다시 시도</button></div>
      ) : state.letters.length === 0 ? <p className="wf-issued-empty">선택한 기간에 발행 완료된 내 서류가 없습니다.</p> : (
        <ul aria-label="내 발급 서류 목록" className="wf-issued-grid">
          {state.letters.map(letter => (
            <li key={letter.id} className="wf-issued-document">
              <div><p className="wf-issued-kind">{letter.documentType === 'DRAFTING' ? draftingKindLabel(letter.draftingKind) : letter.documentType === 'EMPLOYMENT' ? '재직증명서' : letter.documentType === 'CAREER' ? '경력증명서' : '공문'}</p><Link to={`/${letter.documentType === 'DRAFTING' ? 'drafting' : 'documents'}?letter=${encodeURIComponent(letter.id)}`} className="wf-issued-document-title">{letter.title}</Link>{letter.number && <p className="wf-issued-number">{letter.number}</p>}<p className="wf-issued-date">발행일 {letter.issueDate || '-'}</p></div>
              <Button type="button" onClick={() => void download(letter)} disabled={Boolean(downloading)} className="wf-btn wf-issued-download">{downloading === letter.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}<span>PDF 다운로드</span></Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function MyIssuedDocuments() {
  const { user, userData } = useAuthStore();
  if (!user || !userData || user.uid !== userData.uid || (userData.status && userData.status !== 'ACTIVE') || userData.mustChangePassword || userData.role === 'SUPER_ADMIN') return null;
  return <IssuedDocuments key={`${user.uid}:${userData.companyId}:${userData.role}:${userData.divisionId || ''}`} uid={user.uid} />;
}
