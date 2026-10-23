import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Plus, Settings, Download, History, CheckCircle, Send, RefreshCw, X, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { officialLetters, seoulDate, koreanDate, previewNumber, readLetterImage } from '../services/officialLetterService';
import type { ApprovalStep, ApproverCandidate, LetterContent, LetterHistory, LetterSettings, LetterSummary, OfficialLetter } from '../services/officialLetterService';
import './OfficialLetters.css';

const emptyContent = (): LetterContent => ({ recipient: '', reference: '', title: '',
  body: '1. 귀사의 무궁한 발전을 기원합니다.\n\n2. 아래와 같이 안내드립니다.\n\n- 아 래 -\n\n\n끝.', attachments: '' });
const blankSettings = (companyName = ''): LetterSettings => ({ companyName, address: '', representative: '',
  phone: '', email: '', logoData: '', sealData: '', lastFront: 0, version: 0 });
const statuses = { DRAFT: '작성 중', PENDING: '결재 대기', REJECTED: '반려', ISSUED: '발행 완료' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.';
const letterLinkKey = (id: string, notification = '') => id ? JSON.stringify([id, notification]) : '';

export function OfficialLetters() {
  const { userData } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedLetterId = searchParams.get('letter') || '';
  const linkedKey = letterLinkKey(linkedLetterId, searchParams.get('notification') || '');
  const handledLink = useRef('');
  const dirtyRef = useRef(false);
  const currentUserId = userData?.uid;
  const currentRole = userData?.role;
  const isAdmin = userData?.role === 'ADMIN';
  const [tab, setTab] = useState<'documents' | 'settings'>('documents');
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [settings, setSettings] = useState<LetterSettings>(blankSettings());
  const [savedSettings, setSavedSettings] = useState<LetterSettings | null>(null);
  const [defaultLine, setDefaultLine] = useState<ApprovalStep[]>([]);
  const [selected, setSelected] = useState<OfficialLetter | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [content, setContent] = useState<LetterContent>(emptyContent());
  const [working, setBusy] = useState(true);
  const [settledLink, setSettledLink] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<LetterHistory[] | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [overrideNumber, setOverrideNumber] = useState(false);
  const [front, setFront] = useState(1);
  const [reassignmentOpen, setReassignmentOpen] = useState(false);
  const [candidates, setCandidates] = useState<ApproverCandidate[]>([]);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [candidateToAdd, setCandidateToAdd] = useState('');
  const busy = working || Boolean(linkedKey && settledLink !== linkedKey);

  async function refresh() {
    const [bootstrap, list] = await Promise.all([officialLetters.bootstrap(), officialLetters.list()]);
    setSavedSettings(bootstrap.settings);
    setSettings(bootstrap.settings || blankSettings(bootstrap.companyName));
    setDefaultLine(bootstrap.approvalLine);
    setLetters(list.letters);
  }
  useEffect(() => {
    let active = true;
    Promise.all([officialLetters.bootstrap(), officialLetters.list()]).then(([bootstrap, list]) => {
      if (!active) return;
      setSettings(bootstrap.settings || blankSettings(bootstrap.companyName));
      setSavedSettings(bootstrap.settings); setDefaultLine(bootstrap.approvalLine); setLetters(list.letters);
    }).catch(e => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    if (!linkedLetterId || handledLink.current === linkedKey || !currentUserId || currentRole === 'SUPER_ADMIN') return;
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      if (dirtyRef.current && !window.confirm('저장하지 않은 입력을 닫고 알림의 공문을 열까요?')) {
        handledLink.current = linkedKey; setSettledLink(linkedKey); return;
      }
      const { letter } = await officialLetters.get(linkedLetterId);
      if (!active) return;
      handledLink.current = linkedKey; setSettledLink(linkedKey);
      setSelected(letter); setContent(letter.content); setEditing(true); setDirty(false); setHistory(null);
      setApprovalOpen(false); setReassignmentOpen(false); setTab('documents'); setError('');
    }).catch(e => { if (active) { handledLink.current = linkedKey; setSettledLink(linkedKey); setError(errorMessage(e)); } });
    return () => { active = false; };
  }, [linkedLetterId, linkedKey, currentUserId, currentRole]);

  function setLetterLink(id?: string) {
    const key = letterLinkKey(id || '');
    handledLink.current = key;
    setSettledLink(key);
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (id) next.set('letter', id); else next.delete('letter');
      next.delete('notification');
      return next;
    }, { replace: true });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function open(id: string) {
    if (dirty && !window.confirm('저장하지 않은 입력을 닫고 선택한 공문을 열까요?')) return;
    setLetterLink(id);
    await run(async () => {
      const { letter } = await officialLetters.get(id);
      setSelected(letter); setContent(letter.content); setEditing(true); setDirty(false); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false);
    });
  }
  async function reloadSelected() {
    if (selected) {
      const { letter } = await officialLetters.get(selected.id);
      setSelected(letter); setContent(letter.content); setDirty(false);
    }
    await refresh();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const { id } = await officialLetters.save(content, selected);
      const { letter } = await officialLetters.get(id);
      setSelected(letter); setContent(letter.content); setDirty(false);
      setLetterLink(id); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false);
      await refresh(); setNotice('저장했습니다. PDF 발행에는 결재 요청과 회사 최고관리자의 최종 승인이 필요합니다.');
    });
  }
  function begin() {
    if (dirty && !window.confirm('저장하지 않은 입력을 닫고 새 공문을 작성할까요?')) return;
    setLetterLink(); setTab('documents'); setSelected(null); setContent(emptyContent()); setEditing(true); setDirty(false); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false); setError(''); setNotice('');
  }
  async function beginReassignment() {
    if (!selected || !isAdmin) return;
    await run(async () => {
      const result = await officialLetters.approverCandidates(selected);
      setCandidates(result.candidates); setApproverIds(selected.approvalLine.map(step => step.uid));
      setReassignmentReason(''); setCandidateToAdd(''); setApprovalOpen(false); setReassignmentOpen(true);
    });
  }
  function moveApprover(index: number, offset: number) {
    setApproverIds(previous => {
      const next = [...previous];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  async function download(openViewer: boolean) {
    if (!selected) return;
    const viewer = openViewer ? window.open('about:blank', '_blank') : null;
    await run(async () => {
      try {
        const result = await officialLetters.pdf(selected);
        const bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        if (viewer) viewer.location.replace(url);
        else {
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename;
          anchor.click();
          if (openViewer) setNotice('새 창이 차단되어 PDF를 다운로드했습니다. 파일을 열어 인쇄해 주세요.');
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (e) { viewer?.close(); throw e; }
    });
  }

  if (!userData || userData.role === 'SUPER_ADMIN') return <div className="p-8">가입 회사 계정으로 접근해 주세요.</div>;
  const canEdit = !selected?.everIssued || isAdmin;
  const line = selected?.approvalLine || defaultLine;
  const nextStep = line.find(step => !step.approvedAt);
  const canReview = selected?.status === 'PENDING' && (isAdmin || nextStep?.uid === userData.uid);
  const branding = selected?.branding || savedSettings || settings;
  const filtered = letters.filter(letter => `${letter.number} ${letter.title} ${letter.recipient} ${letter.creatorName}`.toLowerCase().includes(search.toLowerCase()));
  const updateContent = (key: keyof LetterContent, value: string) => { setContent(previous => ({ ...previous, [key]: value })); setDirty(true); };
  const issueDate = seoulDate();
  const hasUnavailableApprover = approverIds.some(uid => !candidates.some(candidate => candidate.uid === uid));

  return <div className="official-letters-screen p-4 md:p-8 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-black flex gap-2 items-center"><FileText className="text-indigo-600" />공문 관리</h1>
        <p className="text-slate-500 mt-2 text-sm">회사 공문 작성부터 결재, PDF 발행과 개정 이력까지 관리합니다.</p></div>
      <button className="ol-primary" disabled={busy} onClick={begin}><Plus size={17} />새 공문 작성</button>
    </header>
    <div className="flex flex-wrap gap-2">
      <button className={tab === 'documents' ? 'ol-primary' : 'ol-button'} onClick={() => setTab('documents')}><FileText size={16} />공문함</button>
      {isAdmin && <button className={tab === 'settings' ? 'ol-primary' : 'ol-button'} onClick={() => setTab('settings')}><Settings size={16} />회사 공문 템플릿</button>}
      <button className="ol-button" disabled={busy} onClick={() => { if (dirty && !window.confirm('저장하지 않은 입력을 닫고 새로고침할까요?')) return; void run(async () => { await reloadSelected(); setNotice('최신 내용을 불러왔습니다.'); }); }}><RefreshCw size={16} />새로고침</button>
      {busy && <span role="status" className="text-sm self-center text-indigo-600">처리 중…</span>}
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 text-red-800 p-4">{error}<p className="mt-1 text-sm">충돌이 발생한 경우 입력 내용을 복사한 뒤 새로고침해 주세요.</p></div>}
    {notice && <div role="status" className="rounded-xl bg-emerald-50 text-emerald-800 p-4">{notice}</div>}

    {tab === 'settings' && isAdmin ? <form className="ol-card space-y-5" onSubmit={event => {
      event.preventDefault(); void run(async () => { await officialLetters.saveSettings(settings); await refresh(); setNotice('회사 템플릿을 저장했습니다. 이미 결재 요청한 공문은 요청 당시의 템플릿을 유지합니다.'); });
    }}>
      <h2 className="text-xl font-bold">회사 공문 기본정보</h2>
      <p className="text-sm text-slate-500">로고와 인감은 300KB 이하 PNG/JPEG, 최대 4096px로 등록합니다. 인감 원본은 회사 관리자에게만 표시됩니다.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {([['companyName', '회사명', 120], ['representative', '대표자 이름', 80], ['address', '회사 주소', 300], ['phone', '전화번호', 80], ['email', '이메일', 120]] as const).map(([key, label, max]) =>
          <label className="ol-label" key={key}>{label}<input className="ol-input" required={!['phone', 'email'].includes(key)} maxLength={max} value={settings[key]} onChange={e => setSettings(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">{([['logoData', '회사 로고'], ['sealData', '대표자 인감']] as const).map(([key, label]) =>
        <label key={key} className="ol-label">{label}
          <input className="ol-input" type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; if (!file) return;
            void run(async () => { const data = await readLetterImage(file); setSettings(previous => ({ ...previous, [key]: data })); });
          }} />
          {settings[key] && <img src={settings[key]} alt={label} className="max-h-24 max-w-52 object-contain border rounded-lg p-2" />}
        </label>)}</div>
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <h3 className="font-bold">문서번호 시작점</h3>
        <p className="text-sm text-slate-600">최초 등록 시 이전에 발행한 문서번호의 앞 세 자리 숫자를 입력합니다. 최초 발행이면 000으로 입력합니다. 앞 세 자리만 새 발행마다 1씩 증가하며 날짜·연도 변경 시 초기화되지 않습니다. 뒤 여섯 자리는 한국 시간 기준 실제 발행일(YYMMDD)로 자동 기록됩니다.</p>
        <label className="ol-label max-w-sm">이전 발행번호 앞 세 자리<input type="number" className="ol-input" min={0} max={999} required disabled={settings.version > 0} value={settings.lastFront} onChange={event => setSettings(previous => ({ ...previous, lastFront: Number(event.target.value) }))} /></label>
        <p className="text-sm font-semibold">다음 예상 번호: {previewNumber(settings.lastFront + 1, issueDate)} · {koreanDate(issueDate)}</p>
        <p className="text-xs text-slate-500">예: 2026년 11월 5일의 첫 문서번호는 001-261105입니다. 저장 후 시작점은 보존됩니다. 관리자는 최종 승인 창에서 앞 세 자리 번호를 직접 지정할 수 있습니다. 999 다음 번호는 자동 발행을 중단하고 관리자 번호 입력이 필요합니다.</p>
      </div>
      <button className="ol-primary" disabled={busy}>템플릿 저장</button>
    </form> : <>
      <section className="ol-card">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="font-bold text-lg">{isAdmin ? '회사 전체 공문' : '내 공문과 결재 공문'} <span className="text-slate-400">{letters.length}</span></h2>
          <input aria-label="공문 검색" placeholder="문서번호, 제목, 수신처, 작성자 검색" className="ol-input max-w-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr>{['문서번호 / 개정', '제목 / 수신처', '작성자', '상태', '수정일'].map(label => <th key={label} className="p-3 whitespace-nowrap">{label}</th>)}</tr></thead>
          <tbody>{filtered.map(letter => <tr key={letter.id} className="border-t border-slate-100 hover:bg-indigo-50">
            <td className="p-3 whitespace-nowrap">{letter.number || '미발행'}<div className="text-xs text-slate-400">개정 {letter.revision}</div></td>
            <td className="p-3"><button className="text-indigo-700 font-bold text-left underline underline-offset-4" disabled={busy} onClick={() => { void open(letter.id); }}>{letter.title}</button><div className="text-xs text-slate-500 mt-1">{letter.recipient}</div></td>
            <td className="p-3 whitespace-nowrap">{letter.creatorName}</td><td className="p-3 whitespace-nowrap"><span className={`ol-status ol-status-${letter.status}`}>{statuses[letter.status]}</span></td>
            <td className="p-3 whitespace-nowrap text-slate-500">{new Date(letter.updatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
          </tr>)}</tbody></table>
          {!filtered.length && <p className="text-center p-8 text-slate-500">{busy ? '공문을 불러오는 중입니다.' : '표시할 공문이 없습니다. 새 공문을 작성해 주세요.'}</p>}
        </div>
      </section>
      {editing && <section className="ol-card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{selected ? `공문 상세 · 개정 ${selected.revision}` : '새 공문 작성'}</h2>
          <button aria-label="공문 닫기" className="ol-button" onClick={() => { if (!dirty || window.confirm('저장하지 않은 입력을 닫을까요?')) { setLetterLink(); setEditing(false); setDirty(false); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false); } }}><X size={16} /></button></div>
        {selected && <div className="flex flex-wrap gap-3 text-sm items-center"><span className={`ol-status ol-status-${selected.status}`}>{statuses[selected.status]}</span><span>작성자: {selected.creatorName}</span>{selected.number && <span>최근 발행번호: {selected.number}</span>}{selected.approvedByName && selected.status === 'ISSUED' && <span>최종 승인: {selected.approvedByName}</span>}</div>}
        <div className="rounded-xl bg-indigo-50 p-4 text-sm space-y-2"><p className="font-bold">결재라인: 작성자 → {line.map(step => `${step.name}${step.approvedAt ? ' (승인)' : ''}`).join(' → ')}{line.length ? ' → ' : ''}회사 최고관리자(ADMIN)</p>
          <p>조직관리에 등록된 담당 팀장·본부장을 자동 배정하며, 회사 최고관리자가 결재자를 재배정할 수 있습니다. 작성자·현재 결재자·회사 최고관리자가 열람할 수 있습니다. 결재 요청과 처리 결과는 앱 알림으로 전달됩니다. 발행본을 수정하면 이전 내용이 보관되고 다시 결재해야 합니다.</p></div>
        {selected?.reassignment && <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1"><p className="font-semibold">최근 결재자 재배정: {new Date(selected.reassignment.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p><p className="whitespace-pre-wrap break-words">사유: {selected.reassignment.reason}</p><p className="text-slate-500">재배정 전에 진행한 승인은 초기화되었습니다.</p></div>}
        {selected?.rejectionReason && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">반려 사유: {selected.rejectionReason}</p>}
        <form onSubmit={event => { void save(event); }} className="space-y-4">
          <fieldset disabled={busy || !canEdit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4"><label className="ol-label">수신처<input required maxLength={200} className="ol-input" value={content.recipient} onChange={e => updateContent('recipient', e.target.value)} /></label>
              <label className="ol-label">참조<input maxLength={200} className="ol-input" value={content.reference} onChange={e => updateContent('reference', e.target.value)} /></label></div>
            <label className="ol-label">제목<input required maxLength={200} className="ol-input" value={content.title} onChange={e => updateContent('title', e.target.value)} /></label>
            <label className="ol-label">본문<textarea aria-label="본문" required maxLength={20000} rows={15} className="ol-input leading-7" value={content.body} onChange={e => updateContent('body', e.target.value)} /></label>
            <label className="ol-label">붙임 목록<textarea aria-label="붙임 목록" maxLength={1000} rows={2} className="ol-input" value={content.attachments} onChange={e => updateContent('attachments', e.target.value)} /></label>
          </fieldset>
          {canEdit ? <button className="ol-primary" disabled={busy || (!!selected && !dirty)}>{selected?.everIssued ? '새 개정본 저장 (재승인 필요)' : '작성 내용 저장'}</button> : <p className="text-sm text-slate-500">발행된 공문의 수정은 회사 최고관리자만 가능합니다.</p>}
        </form>
        {selected && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {['DRAFT', 'REJECTED'].includes(selected.status) && <button className="ol-primary" disabled={busy || dirty} onClick={() => { void run(async () => { await officialLetters.submit(selected); await reloadSelected(); setNotice('결재를 요청했습니다.'); }); }}><Send size={16} />결재 요청</button>}
          {canReview && <>
            <button className="ol-primary" disabled={busy || dirty || (isAdmin && !!nextStep)} onClick={() => {
              if (isAdmin) { setOverrideNumber(false); setFront((savedSettings?.lastFront || 0) + 1); setReassignmentOpen(false); setApprovalOpen(true); }
              else { void run(async () => { await officialLetters.review(selected, 'approve'); await reloadSelected(); setNotice('중간 결재를 승인했습니다. 최고관리자 최종 승인이 남아 있습니다.'); }); }
            }}><CheckCircle size={16} />{isAdmin ? '최종 승인·발행' : '중간 결재 승인'}</button>
            <button className="ol-button" disabled={busy || dirty} onClick={() => { const reason = window.prompt('반려 사유를 입력해 주세요.'); if (reason?.trim()) { void run(async () => { await officialLetters.review(selected, 'reject', { reason }); await reloadSelected(); }); } }}>반려</button>
          </>}
          {selected.status === 'ISSUED' && <><button className="ol-primary" disabled={busy || dirty} onClick={() => { void download(false); }}><Download size={16} />PDF 다운로드</button><button className="ol-button" disabled={busy || dirty} onClick={() => { void download(true); }}>PDF 열기·인쇄</button></>}
          {isAdmin && <><button className="ol-button" disabled={busy || dirty} onClick={() => { void beginReassignment(); }}><Users size={16} />결재자 재배정</button><button className="ol-button" disabled={busy || dirty} onClick={() => { void run(async () => { setHistory((await officialLetters.history(selected)).history); }); }}><History size={16} />수정 전 보관 이력</button></>}
          {dirty && <p className="w-full text-sm text-amber-700">변경 내용을 먼저 저장해 주세요. 저장하면 결재를 다시 요청해야 합니다.</p>}
        </div>}
        {reassignmentOpen && selected && isAdmin && <form className="rounded-xl border-2 border-indigo-200 p-5 space-y-4" onSubmit={event => {
          event.preventDefault();
          if (!reassignmentReason.trim() || hasUnavailableApprover || dirty) return;
          if (!approverIds.length && !window.confirm('중간 결재자 없이 회사 최고관리자가 직접 최종 승인하는 결재라인으로 변경할까요? 이전 승인은 모두 초기화됩니다.')) return;
          void run(async () => {
            await officialLetters.reassign(selected, approverIds, reassignmentReason.trim());
            setReassignmentOpen(false); setHistory(null); await reloadSelected();
            setNotice(selected.status === 'PENDING' ? '결재자를 재배정했습니다. 기존 승인을 초기화하고 새 결재라인에 결재를 요청했습니다.' : '결재자를 재배정했습니다. 새 결재라인으로 결재를 다시 요청해 주세요.');
          });
        }}>
          <h3 className="font-bold">결재자 재배정 · 회사 최고관리자 전용</h3>
          <p className="text-sm text-slate-600">같은 회사의 활성 구성원 중 중간 결재자를 최대 10명 선택하고 결재 순서를 지정합니다. 작성자와 회사 최고관리자는 중간 결재자에 포함하지 않습니다.</p>
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">변경 전 문서는 보관되고 개정번호가 증가하며 기존 승인은 모두 초기화됩니다. {selected.status === 'PENDING' ? '현재 문서는 결재 대기 상태를 유지하고 새 결재라인에 알림을 보냅니다.' : selected.status === 'ISSUED' ? '발행된 문서는 작성 중으로 변경됩니다. 새 결재 요청과 최종 승인 전에는 PDF를 생성·출력할 수 없습니다.' : '문서는 작성 중으로 변경되며 결재를 다시 요청해야 합니다.'}</p>
          <fieldset disabled={busy || dirty} className="space-y-4">
            <ol aria-label="새 중간 결재 순서" className="space-y-2">
              {approverIds.map((uid, index) => {
                const candidate = candidates.find(person => person.uid === uid);
                const name = candidate?.name || selected.approvalLine.find(step => step.uid === uid)?.name || '기존 결재자';
                return <li key={uid} className="rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-36 text-sm"><strong>{index + 1}. {name}</strong>{candidate ? <span className="ml-2 text-slate-500">{candidate.role === 'SUB_ADMIN' ? '부서관리자' : '구성원'}</span> : <span className="block text-red-700">현재 선택할 수 없는 계정입니다. 제거 후 재배정해 주세요.</span>}</span>
                  <button type="button" className="ol-button" aria-label={`${name} 위로 이동`} disabled={index === 0} onClick={() => moveApprover(index, -1)}><ArrowUp size={16} /></button>
                  <button type="button" className="ol-button" aria-label={`${name} 아래로 이동`} disabled={index === approverIds.length - 1} onClick={() => moveApprover(index, 1)}><ArrowDown size={16} /></button>
                  <button type="button" className="ol-button" aria-label={`${name} 결재라인에서 제거`} onClick={() => setApproverIds(previous => previous.filter(id => id !== uid))}>제거</button>
                </li>;
              })}
            </ol>
            {!approverIds.length && <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">중간 결재자가 없습니다. 결재 요청 후 회사 최고관리자가 직접 최종 승인합니다. 저장 시 한 번 더 확인합니다.</p>}
            <div className="flex flex-wrap items-end gap-2">
              <label className="ol-label flex-1 min-w-52">중간 결재자 추가<select className="ol-input" value={candidateToAdd} disabled={approverIds.length >= 10} onChange={event => setCandidateToAdd(event.target.value)}>
                <option value="">결재자를 선택해 주세요</option>
                {candidates.filter(candidate => !approverIds.includes(candidate.uid)).map(candidate => <option key={candidate.uid} value={candidate.uid}>{candidate.name} · {candidate.role === 'SUB_ADMIN' ? '부서관리자' : '구성원'}</option>)}
              </select></label>
              <button type="button" className="ol-button" disabled={!candidateToAdd || approverIds.length >= 10} onClick={() => {
                if (candidates.some(candidate => candidate.uid === candidateToAdd) && !approverIds.includes(candidateToAdd)) setApproverIds(previous => [...previous, candidateToAdd]);
                setCandidateToAdd('');
              }}><Plus size={16} />추가</button>
            </div>
            <label className="ol-label">재배정 사유<textarea required maxLength={1000} rows={3} className="ol-input" value={reassignmentReason} onChange={event => setReassignmentReason(event.target.value)} placeholder="담당자 변경 등 재배정 사유를 입력해 주세요." /></label>
          </fieldset>
          <div className="flex gap-2"><button className="ol-primary" disabled={busy || dirty || !reassignmentReason.trim() || hasUnavailableApprover}>결재자 재배정 저장</button><button type="button" className="ol-button" disabled={busy} onClick={() => setReassignmentOpen(false)}>취소</button></div>
        </form>}
        {approvalOpen && selected && <form className="rounded-xl border-2 border-indigo-200 p-5 space-y-4" onSubmit={event => {
          event.preventDefault(); void run(async () => { await officialLetters.review(selected, 'approve', overrideNumber ? { front } : {}); setApprovalOpen(false); await reloadSelected(); setNotice('현재 개정본을 최종 승인하고 문서번호를 발행했습니다. PDF를 다운로드하거나 열어 인쇄할 수 있습니다.'); });
        }}><h3 className="font-bold">최고관리자 최종 승인</h3>
          <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
            <p>{branding.companyName} · 대표 {branding.representative}</p><p>{branding.address}</p>
            {selected.branding?.sealData && <img src={selected.branding.sealData} alt="결재 요청 당시 인감 (관리자 전용)" className="h-20 w-20 object-contain" />}
          </div>
          <p className="text-sm text-slate-600">아래 내용과 결재 요청 당시의 회사정보를 확인한 후 승인합니다. 번호는 발행 시 서버에서 확정하며, 동시 발행 시 예상 번호가 달라질 수 있습니다.</p>
          <p className="text-sm">발행일: <strong>{koreanDate(issueDate)}</strong> (한국 시간 기준 실제 최종 승인일로 자동 기록)</p>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={overrideNumber} onChange={e => setOverrideNumber(e.target.checked)} />관리자 문서번호 직접 지정</label>
          {overrideNumber && <label className="ol-label max-w-xs">앞 세 자리<input type="number" required min={1} max={999} className="ol-input" value={front} onChange={e => setFront(Number(e.target.value))} /></label>}
          <p className="font-bold">{previewNumber(front, issueDate)} · {koreanDate(issueDate)}</p>
          <p className="text-xs text-slate-500">이미 사용한 번호는 재사용할 수 없습니다. 직접 지정한 번호가 기존 최대값보다 크면 이후 자동 번호도 그 다음부터 부여됩니다.</p>
          <div className="flex gap-2"><button className="ol-primary" disabled={busy}>승인하고 발행번호 확정</button><button type="button" className="ol-button" onClick={() => setApprovalOpen(false)}>취소</button></div>
        </form>}
        <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">공문 배치 미리보기 (인감 없는 작성본)</summary>
          <article className="ol-preview mt-4">
            <div className="ol-draft">작성본 · PDF 발행 전</div>
            {(selected?.branding?.logoData || savedSettings?.logoData) && <img src={selected?.branding?.logoData || savedSettings?.logoData} alt="회사 로고" className="max-w-48 max-h-16 object-contain mb-5" />}
            <p className="text-sm mb-2">{branding.address || '회사 주소를 등록해 주세요.'}</p>
            <div className="border-y border-black py-2">문서번호: {selected?.status === 'ISSUED' ? selected.number : '최종 승인 시 자동 부여'}</div>
            <div className="border-b border-black py-2">수신: {content.recipient}</div>
            {content.reference && <div className="border-b border-black py-2">참조: {content.reference}</div>}
            <div className="border-b-4 border-black py-2 font-bold">제목: {content.title}</div>
            <p className="whitespace-pre-wrap break-words leading-8 my-5">{content.body}</p>
            {content.attachments && <p className="whitespace-pre-wrap">붙임: {content.attachments}</p>}
            <p className="text-center mt-10">{koreanDate(selected?.issueDate || seoulDate())}</p>
            <p className="text-center text-xl font-bold mt-6">{branding.companyName}</p>
            <p className="text-center text-lg font-bold mt-2">대표이사 {branding.representative} <span className="text-sm text-slate-400">(승인 후 PDF에 인감 적용)</span></p>
          </article>
        </details>
        {history && <div className="space-y-3 border-t pt-5"><h3 className="font-bold">수정 전 내용 보관함 · 관리자 전용</h3>{!history.length && <p className="text-sm text-slate-500">보관된 이전 개정본이 없습니다.</p>}
          {history.map(version => <details key={version.historyId} className="border rounded-xl p-4"><summary className="cursor-pointer">개정 {version.revision} · {version.number || '미발행'} · {statuses[version.status]} · {version.content.title}</summary>
            <div className="text-sm space-y-3 mt-4"><p>보관: {new Date(version.archivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p><p>수신: {version.content.recipient} / 참조: {version.content.reference}</p><p className="whitespace-pre-wrap leading-7">{version.content.body}</p><p className="whitespace-pre-wrap">붙임: {version.content.attachments}</p>
              <button className="ol-button text-red-700" disabled={busy} onClick={() => {
                if (!selected || !window.confirm(`개정 ${version.revision}의 보관 내용을 영구 삭제할까요? 문서번호는 재사용되지 않습니다.`)) return;
                void run(async () => { await officialLetters.deleteHistory(selected, version.historyId); setHistory((await officialLetters.history(selected)).history); setNotice('선택한 보관 내용을 삭제했습니다.'); });
              }}>이 보관본 영구 삭제</button></div>
          </details>)}</div>}
      </section>}
    </>}
  </div>;
}
