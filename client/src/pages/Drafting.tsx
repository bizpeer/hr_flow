import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, FilePenLine, History, Plus, RefreshCw, Save, Send, X } from 'lucide-react';
import { auth } from '../firebase';
import { useAuthStore } from '../store/authStore';
import type { UserData } from '../store/authStore';
import { officialLetters, seoulDate } from '../services/officialLetterService';
import type { DraftingApprover, DraftingBootstrap, DraftingRoute, LetterContent, LetterDateRange, LetterHistory, LetterSummary, OfficialLetter } from '../services/officialLetterService';
import { getErrorMessage } from '../utils/errors';
import { DeleteIssuedDialog } from './OfficialLetters';
import './OfficialLetters.css';

const statuses = { DRAFT: '작성 중', PENDING: '결재 대기', REJECTED: '반려', ISSUED: '발행 완료', DELETING: '삭제 처리 중' };
const emptyContent = (): LetterContent => ({ recipient: '', reference: '', title: '', body: '', attachments: '', cooperationNote: '' });
const emptyRoute = (): DraftingRoute => ({ teamLeader: false, divisionHead: true, cooperationDivisionIds: [], representative: false });
const scopeOf = (profile: UserData | null) => profile ? JSON.stringify([profile.uid, profile.companyId, profile.role,
  profile.divisionId || '', profile.teamId || '', profile.status || 'ACTIVE', !!profile.mustChangePassword]) : '';
const linkKey = (id: string, token = '') => id ? JSON.stringify([id, token]) : '';
function recentRange(): LetterDateRange {
  const endDate = seoulDate(); const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
function routeApprovers(route: DraftingRoute, bootstrap: DraftingBootstrap): DraftingApprover[] {
  const candidates = bootstrap.candidates;
  const cooperation = route.cooperationDivisionIds.map(id => candidates.cooperationHeads.find(person => person.divisionId === id)).filter((person): person is DraftingApprover => !!person);
  return [route.teamLeader ? candidates.teamLeader : null,
    ...(route.representative ? [route.divisionHead ? candidates.divisionHead : null, ...cooperation, candidates.representative] : [...cooperation, candidates.divisionHead]),
  ].filter((person): person is DraftingApprover => !!person);
}

let activeDraftHistoryGuard: ((event: Event) => void) | null = null;
const dispatchDraftHistory = (event: Event) => activeDraftHistoryGuard?.(event);
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', dispatchDraftHistory, true);
  window.addEventListener('hashchange', dispatchDraftHistory, true);
  import.meta.hot?.dispose(() => {
    window.removeEventListener('popstate', dispatchDraftHistory, true);
    window.removeEventListener('hashchange', dispatchDraftHistory, true);
    activeDraftHistoryGuard = null;
  });
}

function DraftingWorkspace({ profile, scope }: { profile: UserData; scope: string }) {
  const navigate = useNavigate(); const location = useLocation();
  const [params, setParams] = useSearchParams();
  const linkedId = params.get('letter') || ''; const notification = params.get('notification') || '';
  const linkedKey = linkKey(linkedId, notification);
  const alive = useRef(true); const busyRef = useRef(false); const dirtyRef = useRef(false);
  const listSequence = useRef(0); const selectionSequence = useRef(0); const bootstrapSequence = useRef(0);
  const handledLink = useRef(''); const navigationUrl = useRef(window.location.href);
  const selectedRef = useRef<OfficialLetter | null>(null);
  const [bootstrap, setBootstrap] = useState<DraftingBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState(''); const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [letters, setLetters] = useState<LetterSummary[]>([]); const [listLoading, setListLoading] = useState(true); const [listError, setListError] = useState('');
  const [selected, setSelected] = useState<OfficialLetter | null>(null); const [editorOpen, setEditorOpen] = useState(false);
  const [content, setContent] = useState<LetterContent>(emptyContent); const [route, setRoute] = useState<DraftingRoute>(emptyRoute);
  const [creationId, setCreationId] = useState(() => crypto.randomUUID());
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [opening, setOpening] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [history, setHistory] = useState<LetterHistory[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ letter: OfficialLetter; scope: string } | null>(null);
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('ALL');
  const [initialRange] = useState(recentRange); const [range, setRange] = useState(initialRange); const appliedRange = useRef(initialRange);
  const [rangeError, setRangeError] = useState('');
  const isAdmin = profile.role === 'ADMIN';
  const current = useCallback(() => {
    const state = useAuthStore.getState();
    return alive.current && scopeOf(state.userData) === scope && state.user?.uid === profile.uid &&
      auth.currentUser?.uid === profile.uid && state.companyData?.id === profile.companyId && state.companyData.status === 'ACTIVE';
  }, [profile.uid, profile.companyId, scope]);

  const confirmLeave = useCallback(() => {
    if (busyRef.current) { setError('처리 중인 작업이 끝난 뒤 이동해 주세요.'); return false; }
    if (!dirtyRef.current) return true;
    if (!window.confirm('저장하지 않은 기안서 입력을 버리고 이동할까요?')) return false;
    dirtyRef.current = false; setDirty(false); return true;
  }, []);
  const loadBootstrap = useCallback(async (id?: string) => {
    const request = ++bootstrapSequence.current;
    setBootstrapLoading(true); setBootstrapError('');
    try { const result = await officialLetters.draftingBootstrap(id); if (current() && request === bootstrapSequence.current) { setBootstrap(result); return result; } return null; }
    catch (failure) { if (current() && request === bootstrapSequence.current) setBootstrapError(getErrorMessage(failure)); return null; }
    finally { if (current() && request === bootstrapSequence.current) setBootstrapLoading(false); }
  }, [current]);
  const loadList = useCallback(async (period: LetterDateRange) => {
    const request = ++listSequence.current; setListLoading(true); setListError('');
    try {
      const result = await officialLetters.list(isAdmin ? period : undefined);
      if (current() && request === listSequence.current) setLetters(result.letters.filter(letter => letter.documentType === 'DRAFTING'));
    } catch (failure) { if (current() && request === listSequence.current) setListError(getErrorMessage(failure)); }
    finally { if (current() && request === listSequence.current) setListLoading(false); }
  }, [current, isAdmin]);
  const adopt = useCallback((letter: OfficialLetter) => {
    selectedRef.current = letter; setSelected(letter); setContent(letter.content); setRoute(letter.drafting?.route || emptyRoute());
    setEditorOpen(true); dirtyRef.current = false; setDirty(false); setHistory(null); setDeleteTarget(null);
  }, []);
  const readSelected = useCallback(async (id: string) => {
    const request = ++selectionSequence.current; setOpening(true); setError(''); setNotice('');
    try {
      const { letter } = await officialLetters.get(id);
      if (!current() || request !== selectionSequence.current) return;
      if (letter.documentType !== 'DRAFTING') { navigate(`/documents?letter=${encodeURIComponent(id)}`, { replace: true }); return; }
      adopt(letter); await loadBootstrap(id);
    } catch (failure) { if (current() && request === selectionSequence.current) setError(getErrorMessage(failure)); }
    finally { if (current() && request === selectionSequence.current) setOpening(false); }
  }, [adopt, current, navigate, loadBootstrap]);
  const setLetterLink = useCallback((id?: string) => {
    handledLink.current = linkKey(id || '');
    setParams(previous => { const next = new URLSearchParams(previous); if (id) next.set('letter', id); else next.delete('letter'); next.delete('notification'); return next; }, { replace: true });
  }, [setParams]);
  const cancelRequests = useCallback(() => {
    listSequence.current++; selectionSequence.current++; bootstrapSequence.current++;
  }, []);

  useEffect(() => {
    alive.current = true;
    void Promise.resolve().then(() => { if (alive.current) { void loadBootstrap(); void loadList(appliedRange.current); } });
    return () => { alive.current = false; cancelRequests(); };
  }, [loadBootstrap, loadList, cancelRequests]);
  useEffect(() => { navigationUrl.current = window.location.href; }, [location.key, location.pathname, location.search, location.hash]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const beforeLink = (event: MouseEvent) => {
      if ((!dirtyRef.current && !busyRef.current) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.href === window.location.href) return;
      if (!confirmLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const beforeNavigation = (event: Event) => { if (!confirmLeave()) event.preventDefault(); };
    const beforeHistory = (event: Event) => {
      if (window.location.href === navigationUrl.current) return;
      if (!confirmLeave()) { event.stopImmediatePropagation(); window.history.replaceState(window.history.state, '', navigationUrl.current); return; }
      navigationUrl.current = window.location.href;
    };
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', beforeLink, true);
    window.addEventListener('hr-flow:before-navigation', beforeNavigation); activeDraftHistoryGuard = beforeHistory;
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeLink, true);
      window.removeEventListener('hr-flow:before-navigation', beforeNavigation); if (activeDraftHistoryGuard === beforeHistory) activeDraftHistoryGuard = null; };
  }, [confirmLeave]);
  useEffect(() => {
    if (!linkedId || handledLink.current === linkedKey || busy) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active || !current()) return;
      handledLink.current = linkedKey;
      if (!confirmLeave()) { setLetterLink(selectedRef.current?.id); return; }
      await readSelected(linkedId);
    });
    return () => { active = false; };
  }, [linkedId, linkedKey, busy, confirmLeave, current, readSelected, setLetterLink]);

  const markDirty = () => { dirtyRef.current = true; setDirty(true); setNotice(''); };
  const updateContent = (key: keyof LetterContent, value: string) => { setContent(previous => ({ ...previous, [key]: value })); markDirty(); };
  const updateRoute = (next: DraftingRoute) => { setRoute(next); markDirty(); };
  const begin = () => {
    if (!confirmLeave()) return;
    void run(async () => {
      const defaults = await loadBootstrap(); if (!defaults || !current()) return;
      selectionSequence.current++; selectedRef.current = null; setSelected(null); setContent(emptyContent());
      setRoute({ ...defaults.defaults, cooperationDivisionIds: [...defaults.defaults.cooperationDivisionIds] });
      setCreationId(crypto.randomUUID()); setEditorOpen(true); setHistory(null); setDeleteTarget(null); setLetterLink();
    });
  };
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || !current()) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (failure) { if (current()) setError(getErrorMessage(failure)); }
    finally { busyRef.current = false; if (current()) setBusy(false); }
  };
  const reloadSelected = async (letter: OfficialLetter) => {
    if (!current() || selectedRef.current?.id !== letter.id) return null;
    const { letter: fresh } = await officialLetters.get(letter.id);
    if (!current() || selectedRef.current?.id !== letter.id) return null;
    adopt(fresh); await loadList(appliedRange.current); return fresh;
  };
  const deletionCurrent = (target: { letter: OfficialLetter; scope: string }) => {
    const letter = selectedRef.current;
    const requestedId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('letter');
    return current() && target.scope === scope && useAuthStore.getState().userData?.role === 'ADMIN' && !dirtyRef.current &&
      requestedId === target.letter.id &&
      letter?.id === target.letter.id && letter.revision === target.letter.revision && (letter.status === 'ISSUED' || letter.status === 'DELETING');
  };
  const deletionResult = async (target: { letter: OfficialLetter; scope: string }, result: { success: boolean; cleanupPending?: boolean }) => {
    if (!deletionCurrent(target)) return;
    setDeleteTarget(null); setHistory(null);
    if (result.cleanupPending) {
      const pending: OfficialLetter = { ...target.letter, status: 'DELETING', pdfReady: false, permissions: { canReview: false, canFinalApprove: false } };
      adopt(pending); setLetters(previous => previous.map(letter => letter.id === pending.id ? { ...letter, status: 'DELETING', pdfReady: false } : letter));
      try { await reloadSelected(pending); } catch { /* Keep the confirmed read-only deletion state while offline. */ }
      if (current()) setError('일부 파일 또는 이력의 삭제가 완료되지 않았습니다. ‘삭제 다시 시도’로 남은 처리를 완료해 주세요.');
      return;
    }
    if (!result.success) { setError('삭제 결과를 확인하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.'); return; }
    selectedRef.current = null; setSelected(null); setEditorOpen(false); setContent(emptyContent()); dirtyRef.current = false; setDirty(false);
    setLetters(previous => previous.filter(letter => letter.id !== target.letter.id)); setLetterLink();
    await loadList(appliedRange.current);
    if (current()) setNotice('기안서와 연결된 PDF·이력을 삭제했습니다. 삭제한 기안번호는 다시 사용하지 않습니다.');
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!bootstrap || !canEdit) return;
    if (route.cooperationDivisionIds.length > 5 || (!route.representative && !route.divisionHead) || (route.teamLeader && !bootstrap.candidates.teamLeader) ||
      (route.divisionHead && !bootstrap.candidates.divisionHead) || (route.representative && !bootstrap.candidates.representative) ||
      route.cooperationDivisionIds.some(id => !bootstrap.candidates.cooperationHeads.some(person => person.divisionId === id))) {
      setError('현재 조직에서 선택할 수 없는 결재자가 있습니다. 조직 정보를 새로고침하고 결재선을 확인해 주세요.'); return;
    }
    void run(async () => {
      const { id } = await officialLetters.saveDrafting(content, route, selected, creationId);
      if (!current()) return;
      const { letter } = await officialLetters.get(id); if (!current()) return;
      adopt(letter); setLetterLink(id); await loadList(appliedRange.current);
      if (current()) setNotice('기안서를 저장했습니다. 기안일과 번호가 확정되었으며 결재 요청 후 선택한 결재자가 순서대로 승인합니다.');
    });
  };
  const applyRange = (period: LetterDateRange) => {
    if (!period.startDate || !period.endDate) { setRangeError('시작일과 종료일을 모두 입력해 주세요.'); return; }
    if (period.startDate < '1900-01-01' || period.endDate < '1900-01-01' || period.startDate > period.endDate) { setRangeError('1900년 이후 날짜를 입력하고 시작일이 종료일보다 늦지 않은지 확인해 주세요.'); return; }
    appliedRange.current = { ...period }; setRangeError(''); void loadList(period);
  };
  const deleting = selected?.status === 'DELETING';
  const canEdit = !deleting && (!selected || (isAdmin || selected.creatorId === profile.uid) && (!selected.everIssued || isAdmin));
  const canSubmit = selected && !deleting && (isAdmin || selected.creatorId === profile.uid) && (selected.status === 'DRAFT' || selected.status === 'REJECTED');
  const canReview = selected?.status === 'PENDING' && selected.permissions?.canReview === true;
  const isFinal = selected?.permissions?.canFinalApprove === true;
  const filtered = letters.filter(letter => (statusFilter === 'ALL' || letter.status === statusFilter) && `${letter.title} ${letter.number} ${letter.creatorName}`.toLowerCase().includes(search.toLowerCase()));
  const chosen = bootstrap ? routeApprovers(route, bootstrap) : [];
  const missingCooperations = bootstrap ? route.cooperationDivisionIds.filter(id =>
    !bootstrap.candidates.cooperationHeads.some(person => person.divisionId === id)) : [];
  const locked = busy || opening;

  return <div className="official-letters-screen space-y-5 p-4 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><FilePenLine className="h-7 w-7 text-indigo-600" />기안서</h1><p className="mt-2 text-sm leading-6 text-slate-500">내부 품의를 작성하고 조직 결재를 요청합니다. 보존년한 3년 표시는 자동 삭제를 의미하지 않습니다.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className="ol-button" disabled={locked || listLoading || bootstrapLoading} onClick={() => { void loadList(appliedRange.current); void loadBootstrap(selectedRef.current?.id); }}><RefreshCw size={16} />새로고침</button><button type="button" className="ol-primary" disabled={locked || bootstrapLoading} onClick={begin}><Plus size={16} />새 기안서</button></div></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {bootstrapLoading && <p role="status" className="text-sm text-indigo-700">조직 결재 정보를 확인하고 있습니다.</p>}
    {bootstrapError && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{bootstrapError}<button type="button" className="ol-button ml-2" disabled={locked} onClick={() => void loadBootstrap(selectedRef.current?.id)}>조직 정보 다시 확인</button></div>}
    <section className="ol-card" aria-label="기안서 목록"><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-lg font-bold">{isAdmin ? '회사 기안서' : '내 기안서와 결재 서류'}</h2><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="drafting-status">기안서 상태 필터</label><select id="drafting-status" className="ol-input max-w-40" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">모든 상태</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="기안서 검색" className="ol-input max-w-64" placeholder="번호·제목·작성자 검색" value={search} onChange={event => setSearch(event.target.value)} /></div></div>
      {isAdmin && <form aria-label="기안서 기간 조회" noValidate className="mt-4 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" onSubmit={event => { event.preventDefault(); applyRange(range); }}><label className="ol-label col-span-2 sm:col-span-1">시작일<input type="date" required min="1900-01-01" className="ol-input" value={range.startDate} onChange={event => setRange(previous => ({ ...previous, startDate: event.target.value }))} /></label><label className="ol-label col-span-2 sm:col-span-1">종료일<input type="date" required min="1900-01-01" className="ol-input" value={range.endDate} onChange={event => setRange(previous => ({ ...previous, endDate: event.target.value }))} /></label><button className="ol-primary">조회</button><button type="button" className="ol-button" onClick={() => { const recent = recentRange(); setRange(recent); applyRange(recent); }}>최근 30일</button><p className="w-full text-xs text-slate-500">최종 수정일 기준 · 한국 시간</p>{rangeError && <p role="alert" className="w-full text-sm text-red-700">{rangeError}</p>}</form>}
      {listLoading ? <p role="status" className="py-6 text-sm text-indigo-700">기안서를 불러오는 중입니다.</p> : listError ? <div role="alert" className="mt-4 text-sm text-red-700">{listError}<button type="button" className="ol-button ml-2" onClick={() => void loadList(appliedRange.current)}>목록 다시 시도</button></div> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{['기안번호', '제목', '작성자', '상태', '개정'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{filtered.map(letter => <tr key={letter.id} className="border-t border-slate-100"><td className="whitespace-nowrap p-3">{letter.number || '저장 전'}</td><td className="min-w-36 p-3"><button className="text-left font-bold text-indigo-700 underline underline-offset-4" disabled={locked} onClick={() => { if (confirmLeave()) { setLetterLink(letter.id); void readSelected(letter.id); } }}>{letter.title}</button></td><td className="whitespace-nowrap p-3">{letter.creatorName}</td><td className="p-3"><span className={`ol-status ol-status-${letter.status}`}>{statuses[letter.status]}</span></td><td className="p-3">{letter.revision}</td></tr>)}</tbody></table>{!filtered.length && <p className="py-8 text-center text-sm text-slate-500">표시할 기안서가 없습니다.</p>}</div>}
    </section>
    {opening && <p role="status" className="text-sm text-indigo-700">선택한 기안서를 확인하고 있습니다.</p>}
    {editorOpen && <section className="ol-card space-y-5" aria-label="기안서 작성 및 결재"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{selected ? `기안서 상세 · 개정 ${selected.revision}` : '새 기안서 작성'}</h2><button type="button" aria-label="기안서 닫기" className="ol-button" disabled={locked} onClick={() => { if (confirmLeave()) { selectionSequence.current++; selectedRef.current = null; setSelected(null); setEditorOpen(false); setHistory(null); setDeleteTarget(null); setLetterLink(); } }}><X size={16} /></button></div>
      {selected && <div className="flex flex-wrap gap-3 text-sm"><span className={`ol-status ol-status-${selected.status}`}>{statuses[selected.status]}</span><span>작성자 {selected.creatorName}</span>{selected.rejectionReason && <p className="w-full text-orange-800">반려 사유: {selected.rejectionReason}</p>}</div>}
      <form onSubmit={save} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="ol-label">기안일<input className="ol-input" readOnly value={selected?.drafting?.draftDate || bootstrap?.draftDate || ''} /></label><label className="ol-label">기안번호<input className="ol-input" readOnly value={selected?.number || '최초 저장 시 자동 부여'} /></label><label className="ol-label">본부 / 팀<input className="ol-input" readOnly value={`${selected?.drafting?.divisionName || bootstrap?.division.name || ''} / ${selected?.drafting?.teamName || bootstrap?.team?.name || '미배정'}`} /></label><label className="ol-label">보존년한<input className="ol-input" readOnly value="3년 (자동 삭제 아님)" /></label></div>
        <fieldset disabled={locked || !canEdit} className="space-y-4 disabled:opacity-80"><label className="ol-label">제목<input required maxLength={200} className="ol-input" value={content.title} onChange={event => updateContent('title', event.target.value)} /></label><label className="ol-label">상세 내용<textarea aria-label="상세 내용" required maxLength={20000} rows={12} className="ol-input leading-7" value={content.body} onChange={event => updateContent('body', event.target.value)} /></label><label className="ol-label">참조 요청사항<textarea aria-label="참조 요청사항" maxLength={3000} rows={3} className="ol-input" value={content.cooperationNote || ''} onChange={event => updateContent('cooperationNote', event.target.value)} /></label><label className="ol-label">첨부 설명<textarea aria-label="첨부 설명" aria-describedby="drafting-attachment-help" maxLength={1000} rows={3} className="ol-input" value={content.attachments} onChange={event => updateContent('attachments', event.target.value)} /><span id="drafting-attachment-help" className="text-xs font-normal text-slate-500">첨부자료의 이름이나 설명을 텍스트로 입력합니다.</span></label>
          {bootstrap && <div className="space-y-4 rounded-xl border border-slate-200 p-4"><h3 className="font-bold">조직 결재선 선택</h3><p className="text-sm leading-6 text-slate-500">본부장 전결은 팀장 → 협조 본부장 → 본부장 순서입니다. 대표 결재는 팀장 → 선택한 본부장 → 협조 본부장 → 대표 순서이며, 선택하지 않은 단계는 생략됩니다.</p><div className="grid gap-3 sm:grid-cols-2">{(['teamLeader', 'divisionHead', 'representative'] as const).map(key => { const person = bootstrap.candidates[key]; const label = key === 'teamLeader' ? '팀장' : key === 'divisionHead' ? '본부장' : '대표 (마지막 결재)'; return <label key={key} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={route[key]} disabled={!person && !route[key] || key === 'divisionHead' && !route.representative} onChange={event => updateRoute({ ...route, [key]: event.target.checked, ...(key === 'representative' && !event.target.checked ? { divisionHead: true } : {}) })} /><span><strong>{label}</strong><span className="mt-1 block text-slate-500">{person ? `${person.name} · ${person.divisionName || bootstrap.companyName}` : '현재 지정된 책임자가 없습니다.'}</span>{key === 'divisionHead' && !route.representative && <span className="mt-1 block text-xs text-indigo-700">본부장 전결 시 필수</span>}</span></label>; })}</div><fieldset className="space-y-2"><legend className="mb-2 text-sm font-bold">협조 본부장 (최대 5개)</legend>{bootstrap.candidates.cooperationHeads.length ? bootstrap.candidates.cooperationHeads.map(person => <label key={person.divisionId} className="flex items-start gap-2 rounded-lg border border-slate-100 p-3 text-sm"><input type="checkbox" className="mt-1" checked={route.cooperationDivisionIds.includes(person.divisionId)} disabled={!route.cooperationDivisionIds.includes(person.divisionId) && route.cooperationDivisionIds.length >= 5} onChange={event => updateRoute({ ...route, cooperationDivisionIds: event.target.checked ? [...route.cooperationDivisionIds, person.divisionId] : route.cooperationDivisionIds.filter(id => id !== person.divisionId) })} /><span>{person.divisionName} · {person.name}</span></label>) : <p className="text-sm text-slate-500">선택할 수 있는 다른 본부의 책임자가 없습니다.</p>}{missingCooperations.map(id => { const previous = selected?.approvalLine.find(step => step.divisionId === id); return <div key={id} role="group" aria-label={`미지정 협조 본부 ${id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><span><strong>{previous?.divisionName || id}</strong> · {previous?.roleLabel || '협조 본부장'} {previous?.name || ''} · 현재 미지정<span className="mt-1 block break-all text-xs text-amber-800">본부 ID: {id} · 기존 선택을 제거한 뒤 현재 결재자를 선택해 주세요.</span></span><button type="button" aria-label={`미지정 협조 본부 ${id} 제거`} className="ol-button" disabled={locked || !canEdit} onClick={() => { if (!locked && canEdit) updateRoute({ ...route, cooperationDivisionIds: route.cooperationDivisionIds.filter(value => value !== id) }); }}>선택에서 제거</button></div>; })}</fieldset><div className="rounded-lg bg-indigo-50 p-3 text-sm leading-7 text-indigo-900"><strong>선택한 역할 순서</strong><p>{chosen.map(person => `${person.roleLabel} ${person.name}`).join(' → ') || '결재자를 확인해 주세요.'}</p><p className="mt-1 text-xs">겸직자는 저장 시 한 단계로 합쳐집니다. 저장 후 확정 결재선을 확인하세요. 본인이 조직 책임자인 경우에도 직접 승인해야 합니다.</p></div></div>}
        </fieldset>
        {canEdit && <button className="ol-primary" disabled={locked || !bootstrap}><Save size={16} />{busy ? '처리 중...' : '기안서 저장'}</button>}{dirty && <span className="ml-3 text-sm text-amber-700">저장하지 않은 변경이 있습니다.</span>}
      </form>
      {selected && <><div className="space-y-3 border-t border-slate-200 pt-5"><h3 className="font-bold">확정 결재선</h3><ol className="space-y-2">{selected.approvalLine.map((step, index) => <li key={step.uid} className="flex flex-wrap gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><strong>{index + 1}. {step.roleLabel || '결재자'} {step.name}</strong><span className="text-slate-500">{step.divisionName}</span><span className={step.approvedAt ? 'text-emerald-700' : 'text-slate-500'}>{step.approvedAt ? `승인 · ${new Date(step.approvedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` : '승인 대기'}</span></li>)}</ol></div><div className="flex flex-wrap gap-2">
        {canSubmit && <button type="button" className="ol-primary" disabled={locked || dirty} onClick={() => void run(async () => { await officialLetters.submit(selected); const fresh = await reloadSelected(selected); if (fresh && current()) setNotice('결재를 요청했습니다. 관리자 작성 건도 선택한 결재자의 순차 승인이 필요합니다.'); })}><Send size={16} />결재 요청</button>}
        {canReview && <><button type="button" className="ol-primary" disabled={locked || dirty} onClick={() => { if (!window.confirm(isFinal ? '마지막 결재를 승인하고 PDF를 발행할까요?' : '현재 결재 단계를 승인할까요?')) return; void run(async () => { await officialLetters.review(selected, 'approve'); const fresh = await reloadSelected(selected); if (fresh && current()) setNotice(fresh.status === 'ISSUED' ? '최종 승인되었습니다. 서버에 저장된 PDF를 다운로드할 수 있습니다.' : '현재 단계를 승인했습니다. 다음 결재자에게 알림을 보냈습니다.'); }); }}><CheckCircle2 size={16} />{isFinal ? '최종 승인·발행' : '결재 승인'}</button><button type="button" className="ol-button" disabled={locked || dirty} onClick={() => { const reason = window.prompt('반려 사유를 입력해 주세요.'); if (reason?.trim()) void run(async () => { await officialLetters.review(selected, 'reject', { reason: reason.trim() }); await reloadSelected(selected); }); }}>반려</button></>}
        {selected.status === 'ISSUED' && <button type="button" className="ol-button" disabled={locked || dirty} onClick={() => void run(async () => { const result = await officialLetters.pdf(selected); if (!current() || selectedRef.current?.id !== selected.id || selectedRef.current.revision !== selected.revision) return; const bytes = Uint8Array.from(atob(result.base64), value => value.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); })}><Download size={16} />PDF 다운로드</button>}
        {isAdmin && !deleting && <button type="button" className="ol-button" disabled={locked || dirty} onClick={() => void run(async () => { const result = await officialLetters.history(selected); if (current() && selectedRef.current?.id === selected.id) setHistory(result.history); })}><History size={16} />수정 전 보관 이력</button>}
        {isAdmin && (selected.status === 'ISSUED' || deleting) && <button type="button" className="ol-button text-red-700" disabled={locked || dirty} onClick={() => setDeleteTarget({ letter: selected, scope })}>{deleting ? '삭제 다시 시도' : '발급 기안서 삭제'}</button>}
      </div></>}
      <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">기안서 배치 미리보기</summary><article className="mt-4 space-y-5 rounded-lg border border-slate-300 bg-white p-5 text-sm leading-7"><h3 className="text-center text-2xl font-black tracking-widest">기 안 서</h3><dl className="grid grid-cols-1 gap-2 border-y border-slate-200 py-3 sm:grid-cols-2"><div>기안일: {selected?.drafting?.draftDate || bootstrap?.draftDate || '저장 전'}</div><div>기안번호: {selected?.number || '최초 저장 시 자동 부여'}</div><div>기안부서: {selected?.drafting?.divisionName || bootstrap?.division.name} / {selected?.drafting?.teamName || bootstrap?.team?.name || '미배정'}</div><div>기안자: {selected?.creatorName || profile.name} · 보존년한: 3년</div></dl><h4 className="border-b border-slate-200 pb-3 text-base font-bold">제목: {content.title || '제목을 입력해 주세요.'}</h4><p className="whitespace-pre-wrap break-words">{content.body || '상세 내용을 입력해 주세요.'}</p>{content.cooperationNote && <div className="border-t border-slate-200 pt-3"><strong>참조 요청사항</strong><p className="whitespace-pre-wrap break-words">{content.cooperationNote}</p></div>}{content.attachments && <div className="border-t border-slate-200 pt-3"><strong>첨부 설명</strong><p className="whitespace-pre-wrap break-words">{content.attachments}</p></div>}<p className="text-right font-bold">{bootstrap?.companyName || '회사 내부 품의'}</p></article></details>
      {history && !deleting && <div className="space-y-3 border-t border-slate-200 pt-5"><h3 className="font-bold">수정 전 내용 보관함 · 관리자 전용</h3>{!history.length && <p className="text-sm text-slate-500">보관된 이전 개정본이 없습니다.</p>}{history.map(version => <details key={version.historyId} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">개정 {version.revision} · {version.number} · {statuses[version.status]} · {version.content.title}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{version.content.body}</p>{version.content.cooperationNote && <p className="mt-3 whitespace-pre-wrap break-words text-sm">참조 요청사항: {version.content.cooperationNote}</p>}{version.content.attachments && <p className="mt-3 whitespace-pre-wrap break-words text-sm">첨부 설명: {version.content.attachments}</p>}<button type="button" className="ol-button mt-4 text-red-700" disabled={locked || dirty} onClick={() => { if (!selected || !window.confirm(`개정 ${version.revision}의 보관 내용을 영구 삭제할까요? 기안번호는 다시 사용하지 않습니다.`)) return; void run(async () => { await officialLetters.deleteHistory(selected, version.historyId); if (!current() || selectedRef.current?.id !== selected.id || selectedRef.current.revision !== selected.revision) return; const result = await officialLetters.history(selected); if (current() && selectedRef.current?.id === selected.id) { setHistory(result.history); setNotice('선택한 보관 내용을 삭제했습니다. 기안번호는 다시 사용하지 않습니다.'); } }); }}>이 보관본 영구 삭제</button></details>)}</div>}
    </section>}
    {deleteTarget && deletionCurrent(deleteTarget) && <DeleteIssuedDialog letter={deleteTarget.letter} stillCurrent={() => deletionCurrent(deleteTarget)} onClose={() => setDeleteTarget(null)} onResult={result => deletionResult(deleteTarget, result)} />}
  </div>;
}

export function Drafting() {
  const { user, userData, companyData } = useAuthStore();
  if (!user || !userData || user.uid !== userData.uid || userData.role === 'SUPER_ADMIN' || userData.mustChangePassword ||
    userData.status && userData.status !== 'ACTIVE' || companyData?.id !== userData.companyId || companyData.status !== 'ACTIVE') {
    return <p className="p-8 text-sm text-slate-600">업무 이용이 가능한 가입 회사 계정으로 접근해 주세요.</p>;
  }
  const scope = scopeOf(userData);
  return <DraftingWorkspace key={scope} profile={userData} scope={scope} />;
}
