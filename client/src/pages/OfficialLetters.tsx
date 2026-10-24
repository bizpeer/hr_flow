import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Plus, Settings, Download, History, CheckCircle, Send, RefreshCw, X, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { officialLetters, seoulDate, koreanDate, previewNumber, readLetterImage } from '../services/officialLetterService';
import type { ApprovalStep, ApproverCandidate, CertificateContent, DocumentApprover, DocumentType, LetterContent, LetterHistory, LetterSettings, LetterSummary, OfficialLetter } from '../services/officialLetterService';
import './OfficialLetters.css';

const emptyContent = (): LetterContent => ({ recipient: '', reference: '', title: '',
  body: '1. 귀사의 무궁한 발전을 기원합니다.\n\n2. 아래와 같이 안내드립니다.\n\n- 아 래 -\n\n\n끝.', attachments: '' });
const documentLabels: Record<DocumentType, string> = { OFFICIAL: '공문', EMPLOYMENT: '재직증명서', CAREER: '경력증명서' };
const certificateFieldLabels: Record<keyof CertificateContent, string> = { nameKo: '한글 성명', nameEn: '영문 성명', birthDate: '생년월일', address: '주소', division: '소속', position: '직위', startDate: '입사일', endDate: '퇴사일', purpose: '제출 용도', department: '담당부서', contactName: '담당자', contactPhone: '연락처' };
const emptyCertificate = (defaults: Partial<CertificateContent> = {}): CertificateContent => ({
  nameKo: '', nameEn: '', birthDate: '', address: '', division: '', position: '', startDate: '', endDate: '',
  purpose: '', department: '', contactName: '', contactPhone: '', ...defaults,
});
function certificateContent(type: DocumentType, certificate: CertificateContent): LetterContent {
  return { recipient: certificate.nameKo, reference: '', title: documentLabels[type],
    body: `${certificate.nameKo}님의 ${type === 'CAREER' ? '경력' : '재직'} 사실을 증명합니다.\n용도: ${certificate.purpose}`,
    attachments: '', certificate };
}
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
  const [employeeDefaults, setEmployeeDefaults] = useState<Partial<CertificateContent>>({});
  const [canApproveDocuments, setCanApproveDocuments] = useState(false);
  const [documentApprovers, setDocumentApprovers] = useState<DocumentApprover[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>('OFFICIAL');
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'ALL'>('ALL');
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
    setEmployeeDefaults(bootstrap.employeeDefaults || {}); setCanApproveDocuments(!!bootstrap.canApproveDocuments);
    setDocumentApprovers(bootstrap.documentApprovers || []);
    setLetters(list.letters);
  }
  useEffect(() => {
    let active = true;
    Promise.all([officialLetters.bootstrap(), officialLetters.list()]).then(([bootstrap, list]) => {
      if (!active) return;
      setSettings(bootstrap.settings || blankSettings(bootstrap.companyName));
      setSavedSettings(bootstrap.settings); setDefaultLine(bootstrap.approvalLine); setLetters(list.letters);
      setEmployeeDefaults(bootstrap.employeeDefaults || {}); setCanApproveDocuments(!!bootstrap.canApproveDocuments);
      setDocumentApprovers(bootstrap.documentApprovers || []);
    }).catch(e => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    if (!linkedLetterId || handledLink.current === linkedKey || !currentUserId || currentRole === 'SUPER_ADMIN') return;
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      if (dirtyRef.current && !window.confirm('저장하지 않은 입력을 닫고 알림의 서류를 열까요?')) {
        handledLink.current = linkedKey; setSettledLink(linkedKey); return;
      }
      const { letter } = await officialLetters.get(linkedLetterId);
      if (!active) return;
      handledLink.current = linkedKey; setSettledLink(linkedKey);
      setSelected(letter); setDocumentType(letter.documentType || 'OFFICIAL'); setContent(letter.content); setEditing(true); setDirty(false); setHistory(null);
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
    if (dirty && !window.confirm('저장하지 않은 입력을 닫고 선택한 서류를 열까요?')) return;
    setLetterLink(id);
    await run(async () => {
      const { letter } = await officialLetters.get(id);
      setSelected(letter); setDocumentType(letter.documentType || 'OFFICIAL'); setContent(letter.content); setEditing(true); setDirty(false); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false);
    });
  }
  async function reloadSelected() {
    let refreshedLetter: OfficialLetter | null = null;
    if (selected) {
      const { letter } = await officialLetters.get(selected.id);
      setSelected(letter); setDocumentType(letter.documentType || 'OFFICIAL'); setContent(letter.content); setDirty(false);
      refreshedLetter = letter;
    }
    await refresh();
    return refreshedLetter;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const savedContent = documentType === 'OFFICIAL' ? content : certificateContent(documentType, emptyCertificate(content.certificate));
      const { id } = await officialLetters.save(savedContent, selected, documentType);
      const { letter } = await officialLetters.get(id);
      setSelected(letter); setContent(letter.content); setDirty(false);
      setLetterLink(id); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false);
      await refresh(); setNotice(isAdmin && letter.creatorId === userData?.uid ? '초안을 저장했습니다. 제출하면 즉시 승인·발급되며 PDF를 다운로드할 수 있습니다.' : '초안을 저장했습니다. 결재 요청 후 권한을 가진 관리자의 최종 승인이 필요합니다.');
    });
  }
  function begin(type: DocumentType) {
    if (dirty && !window.confirm('저장하지 않은 입력을 닫고 새 서류를 작성할까요?')) return;
    setLetterLink(); setTab('documents'); setSelected(null); setDocumentType(type);
    setContent(type === 'OFFICIAL' ? emptyContent() : certificateContent(type, emptyCertificate(employeeDefaults)));
    setEditing(true); setDirty(false); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false); setError(''); setNotice('');
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
        if (selected.pdfReady === false) await reloadSelected();
      } catch (e) { viewer?.close(); throw e; }
    });
  }

  if (!userData || userData.role === 'SUPER_ADMIN') return <div className="p-8">가입 회사 계정으로 접근해 주세요.</div>;
  const canEdit = !selected || isAdmin || (!selected.everIssued && selected.participantIds.includes(userData.uid));
  const autoIssueOnSubmit = isAdmin && selected?.creatorId === userData.uid;
  const line = selected?.approvalLine || defaultLine;
  const nextStep = line.find(step => !step.approvedAt);
  const canReview = selected?.status === 'PENDING' && (selected.permissions?.canReview ?? (isAdmin || nextStep?.uid === userData.uid));
  const canFinalApprove = selected?.permissions?.canFinalApprove ?? (isAdmin && !nextStep && selected?.status === 'PENDING');
  const canApproveCurrentStep = nextStep?.uid === userData.uid;
  const branding = selected?.branding || savedSettings || settings;
  const filtered = letters.filter(letter => (typeFilter === 'ALL' || (letter.documentType || 'OFFICIAL') === typeFilter) && `${letter.number} ${letter.title} ${letter.recipient} ${letter.creatorName}`.toLowerCase().includes(search.toLowerCase()));
  const updateContent = (key: keyof LetterContent, value: string) => { setContent(previous => ({ ...previous, [key]: value })); setDirty(true); };
  const issueDate = seoulDate();
  const certificate = emptyCertificate(content.certificate);
  const updateCertificate = (key: keyof CertificateContent, value: string) => {
    setContent(previous => certificateContent(documentType, { ...emptyCertificate(previous.certificate), [key]: value })); setDirty(true);
  };
  const hasUnavailableApprover = approverIds.some(uid => !candidates.some(candidate => candidate.uid === uid));

  return <div className="official-letters-screen p-4 md:p-8 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-black flex gap-2 items-center"><FileText className="text-indigo-600" />서류 발급</h1>
        <p className="text-slate-500 mt-2 text-sm">공문·재직증명서·경력증명서를 작성하고 결재와 PDF 발급을 관리합니다.</p></div>
      <div className="flex flex-wrap gap-2">{(Object.keys(documentLabels) as DocumentType[]).map(type => <button key={type} className="ol-primary" disabled={busy} onClick={() => begin(type)}><Plus size={17} />{documentLabels[type]} 작성</button>)}</div>
    </header>
    <div className="flex flex-wrap gap-2">
      <button className={tab === 'documents' ? 'ol-primary' : 'ol-button'} onClick={() => setTab('documents')}><FileText size={16} />서류함</button>
      {isAdmin && <button className={tab === 'settings' ? 'ol-primary' : 'ol-button'} onClick={() => setTab('settings')}><Settings size={16} />회사 서류 템플릿</button>}
      <button className="ol-button" disabled={busy} onClick={() => { if (dirty && !window.confirm('저장하지 않은 입력을 닫고 새로고침할까요?')) return; void run(async () => { await reloadSelected(); setNotice('최신 내용을 불러왔습니다.'); }); }}><RefreshCw size={16} />새로고침</button>
      {busy && <span role="status" className="text-sm self-center text-indigo-600">처리 중…</span>}
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 text-red-800 p-4">{error}<p className="mt-1 text-sm">충돌이 발생한 경우 입력 내용을 복사한 뒤 새로고침해 주세요.</p></div>}
    {notice && <div role="status" className="rounded-xl bg-emerald-50 text-emerald-800 p-4">{notice}</div>}
    {!isAdmin && canApproveDocuments && <p className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900">서류 최종 승인 권한이 부여되어 있습니다. 본인 작성 서류를 제외한 같은 본부의 서류를 순차 결재 완료 후 최종 승인할 수 있습니다. 회사 로고·인감·번호 설정은 회사 관리자만 변경할 수 있습니다.</p>}

    {tab === 'settings' && isAdmin ? <form className="ol-card space-y-5" onSubmit={event => {
      event.preventDefault(); void run(async () => { await officialLetters.saveSettings(settings); await refresh(); setNotice('회사 서류 템플릿을 저장했습니다. 이미 결재 요청한 서류는 요청 당시의 템플릿을 유지합니다.'); });
    }}>
      <h2 className="text-xl font-bold">회사 서류 기본정보</h2>
      <p className="text-sm text-slate-500">로고와 인감은 300KB 이하 PNG/JPEG, 최대 4096px로 등록합니다. 인감 원본은 회사 관리자에게만 표시됩니다.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {([['companyName', '회사명', 120], ['companyNameEn', '영문 회사명 (선택)', 120], ['representative', '대표자 이름', 80], ['address', '회사 주소', 300], ['phone', '전화번호', 80], ['email', '이메일', 120]] as const).map(([key, label, max]) =>
          <label className="ol-label" key={key}>{label}<input className="ol-input" required={!['phone', 'email', 'companyNameEn'].includes(key)} maxLength={max} value={settings[key] || ''} onChange={e => setSettings(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}
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
      <fieldset disabled={busy} className="rounded-xl border border-slate-200 p-4 space-y-3"><legend className="font-bold px-2">서류 최종 승인 권한 위임</legend>
        <p className="text-sm text-slate-600">활성 부서관리자(SUB_ADMIN) 최대 50명에게 같은 본부 구성원의 서류 최종 승인 권한을 부여합니다. 인감·회사정보·문서번호 설정과 발행본 수정 권한은 위임되지 않습니다.</p>
        {documentApprovers.length ? documentApprovers.map(approver => <label key={approver.uid} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" checked={(settings.documentApproverIds || []).includes(approver.uid)} disabled={!(settings.documentApproverIds || []).includes(approver.uid) && (settings.documentApproverIds || []).length >= 50} onChange={event => setSettings(previous => ({ ...previous, documentApproverIds: event.target.checked ? [...new Set([...(previous.documentApproverIds || []), approver.uid])] : (previous.documentApproverIds || []).filter(uid => uid !== approver.uid) }))} /><span className="font-semibold">{approver.name}</span><span className="text-slate-500">{approver.divisionName || '소속 본부 서류'}</span></label>) : <p className="text-sm text-slate-500">권한을 위임할 활성 부서관리자가 없습니다.</p>}
        {(settings.documentApproverIds || []).some(uid => !documentApprovers.some(approver => approver.uid === uid)) && <button type="button" className="ol-button" onClick={() => setSettings(previous => ({ ...previous, documentApproverIds: (previous.documentApproverIds || []).filter(uid => documentApprovers.some(approver => approver.uid === uid)) }))}>현재 선택할 수 없는 관리자의 기존 승인 권한 제거</button>}
      </fieldset>
      <button className="ol-primary" disabled={busy}>템플릿 저장</button>
    </form> : <>
      <section className="ol-card">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="font-bold text-lg">{isAdmin ? '회사 전체 서류' : '내 서류와 결재 서류'} <span className="text-slate-400">{letters.length}</span></h2>
          <div className="flex flex-wrap gap-2"><select aria-label="서류 종류 필터" className="ol-input max-w-48" value={typeFilter} onChange={event => setTypeFilter(event.target.value as DocumentType | 'ALL')}><option value="ALL">모든 서류</option>{(Object.keys(documentLabels) as DocumentType[]).map(type => <option key={type} value={type}>{documentLabels[type]}</option>)}</select><input aria-label="서류 검색" placeholder="문서번호, 제목, 대상자, 작성자 검색" className="ol-input max-w-sm" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr>{['문서번호 / 개정', '종류 / 제목 / 대상자', '작성자', '상태', '수정일'].map(label => <th key={label} className="p-3 whitespace-nowrap">{label}</th>)}</tr></thead>
          <tbody>{filtered.map(letter => <tr key={letter.id} className="border-t border-slate-100 hover:bg-indigo-50">
            <td className="p-3 whitespace-nowrap">{letter.number || '미발행'}<div className="text-xs text-slate-400">개정 {letter.revision}</div></td>
            <td className="p-3"><div className="text-xs text-slate-500 mb-1">{documentLabels[letter.documentType || 'OFFICIAL']}</div><button className="text-indigo-700 font-bold text-left underline underline-offset-4" disabled={busy} onClick={() => { void open(letter.id); }}>{letter.title}</button><div className="text-xs text-slate-500 mt-1">{letter.recipient}</div></td>
            <td className="p-3 whitespace-nowrap">{letter.creatorName}</td><td className="p-3 whitespace-nowrap"><span className={`ol-status ol-status-${letter.status}`}>{statuses[letter.status]}</span></td>
            <td className="p-3 whitespace-nowrap text-slate-500">{new Date(letter.updatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
          </tr>)}</tbody></table>
          {!filtered.length && <p className="text-center p-8 text-slate-500">{busy ? '서류를 불러오는 중입니다.' : '표시할 서류가 없습니다. 서류 종류를 선택하여 새로 작성해 주세요.'}</p>}
        </div>
      </section>
      {editing && <section className="ol-card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{documentLabels[documentType]} {selected ? `상세 · 개정 ${selected.revision}` : '작성'}</h2>
          <button aria-label="서류 닫기" className="ol-button" onClick={() => { if (!dirty || window.confirm('저장하지 않은 입력을 닫을까요?')) { setLetterLink(); setEditing(false); setDirty(false); setHistory(null); setApprovalOpen(false); setReassignmentOpen(false); } }}><X size={16} /></button></div>
        {selected && <div className="flex flex-wrap gap-3 text-sm items-center"><span className={`ol-status ol-status-${selected.status}`}>{statuses[selected.status]}</span><span>작성자: {selected.creatorName}</span>{selected.number && <span>최근 발행번호: {selected.number}</span>}{selected.approvedByName && selected.status === 'ISSUED' && <span>최종 승인: {selected.approvedByName}</span>}</div>}
        <div className="rounded-xl bg-indigo-50 p-4 text-sm space-y-2"><p className="font-bold">결재라인: 작성자 → {line.map(step => `${step.name}${step.approvedAt ? ' (승인)' : ''}`).join(' → ')}{line.length ? ' → ' : ''}회사 관리자 또는 권한을 위임받은 부서관리자</p>
          <p>결재 요청과 처리 결과는 앱 알림으로 전달됩니다. 회사 관리자가 직접 작성한 서류는 제출 즉시 승인·발급됩니다. 그 외 서류는 결재 후 발급되며, 위임받은 부서관리자는 같은 본부 서류만 최종 승인할 수 있습니다. 발행본 수정은 회사 관리자만 가능하며 재승인이 필요합니다.</p></div>
        {selected?.reassignment && <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1"><p className="font-semibold">최근 결재자 재배정: {new Date(selected.reassignment.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p><p className="whitespace-pre-wrap break-words">사유: {selected.reassignment.reason}</p><p className="text-slate-500">재배정 전에 진행한 승인은 초기화되었습니다.</p></div>}
        {selected?.rejectionReason && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">반려 사유: {selected.rejectionReason}</p>}
        <form onSubmit={event => { void save(event); }} className="space-y-4">
          <fieldset disabled={busy || !canEdit} className="space-y-4">
            {documentType === 'OFFICIAL' ? <><div className="grid md:grid-cols-2 gap-4"><label className="ol-label">수신처<input required maxLength={200} className="ol-input" value={content.recipient} onChange={e => updateContent('recipient', e.target.value)} /></label>
              <label className="ol-label">참조<input maxLength={200} className="ol-input" value={content.reference} onChange={e => updateContent('reference', e.target.value)} /></label></div>
            <label className="ol-label">제목<input required maxLength={200} className="ol-input" value={content.title} onChange={e => updateContent('title', e.target.value)} /></label>
            <label className="ol-label">본문<textarea aria-label="본문" required maxLength={20000} rows={15} className="ol-input leading-7" value={content.body} onChange={e => updateContent('body', e.target.value)} /></label>
            <label className="ol-label">붙임 목록<textarea aria-label="붙임 목록" maxLength={1000} rows={2} className="ol-input" value={content.attachments} onChange={e => updateContent('attachments', e.target.value)} /></label></> : <>
              <p className="text-sm text-slate-500">회원정보에 등록된 본인 정보를 기본으로 불러옵니다. 발급 대상자의 정보와 제출 용도를 확인해 주세요. 주민등록번호는 입력하지 않습니다.</p>
              <div className="grid md:grid-cols-2 gap-4">{([['nameKo', '성명 (한글) / Korean Name', 80, true], ['nameEn', '성명 (영문, 선택) / English Name', 100, false]] as const).map(([key, label, max, required]) => <label key={key} className="ol-label">{label}<input required={required} maxLength={max} className="ol-input" value={certificate[key]} onChange={event => updateCertificate(key, event.target.value)} /></label>)}
                <label className="ol-label">생년월일 (선택) / Date of Birth<input type="date" min="1900-01-01" max={certificate.startDate || issueDate} className="ol-input" value={certificate.birthDate} onChange={event => updateCertificate('birthDate', event.target.value)} /></label>
                <label className="ol-label">주소 / Address<input required maxLength={300} className="ol-input" value={certificate.address} onChange={event => updateCertificate('address', event.target.value)} /></label>
                <label className="ol-label">소속 / Division<input required maxLength={120} className="ol-input" value={certificate.division} onChange={event => updateCertificate('division', event.target.value)} /></label>
                <label className="ol-label">직위 / Position<input required maxLength={100} className="ol-input" value={certificate.position} onChange={event => updateCertificate('position', event.target.value)} /></label>
                <label className="ol-label">입사일 / Employment Start<input type="date" required min={certificate.birthDate || '1900-01-01'} max={certificate.endDate && certificate.endDate < issueDate ? certificate.endDate : issueDate} className="ol-input" value={certificate.startDate} onChange={event => updateCertificate('startDate', event.target.value)} /></label>
                {documentType === 'CAREER' ? <label className="ol-label">퇴사일 / Employment End<input type="date" required min={certificate.startDate || undefined} max={issueDate} className="ol-input" value={certificate.endDate} onChange={event => updateCertificate('endDate', event.target.value)} /></label> : <div className="ol-label">재직 상태 / Employment Status<p className="ol-input text-slate-600">현재 재직 중 / Present</p></div>}
              </div>
              <label className="ol-label">제출 용도 / Purpose<input required maxLength={200} className="ol-input" value={certificate.purpose} onChange={event => updateCertificate('purpose', event.target.value)} placeholder="예: 금융기관 제출용" /></label>
              <fieldset className="rounded-xl border border-slate-200 p-4 grid md:grid-cols-3 gap-4"><legend className="px-2 font-semibold text-sm">발급 담당자 / Issuing Office</legend>
                {([['department', '담당부서 / Department', 100], ['contactName', '담당자 / Contact', 80], ['contactPhone', '연락처 / Telephone', 80]] as const).map(([key, label, max]) => <label key={key} className="ol-label">{label}<input maxLength={max} className="ol-input" value={certificate[key]} onChange={event => updateCertificate(key, event.target.value)} /></label>)}
              </fieldset>
            </>}
          </fieldset>
          {canEdit ? <button className="ol-primary" disabled={busy || (!!selected && !dirty)}>{selected?.everIssued ? '새 개정본 저장 (재승인 필요)' : '초안 저장'}</button> : <p className="text-sm text-slate-500">내용 수정은 작성자와 지정 결재자에게 허용하며, 발행 후에는 회사 관리자만 가능합니다.</p>}
        </form>
        {selected && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {['DRAFT', 'REJECTED'].includes(selected.status) && <button className="ol-primary" disabled={busy || dirty} onClick={() => { void run(async () => {
            await officialLetters.submit(selected); const refreshed = await reloadSelected();
            setNotice(refreshed?.status === 'ISSUED' ? refreshed.pdfReady === false ? '제출 즉시 승인·발급되었습니다. PDF 다운로드를 눌러 파일 생성을 다시 시도해 주세요.' : '제출 즉시 승인·발급되었습니다. PDF를 다운로드하거나 열어 인쇄할 수 있습니다.' : '결재를 요청했습니다.');
          }); }}><Send size={16} />{autoIssueOnSubmit ? '제출 즉시 승인·발급' : '결재 요청'}</button>}
          {canReview && <>
            <button className="ol-primary" disabled={busy || dirty || (!canFinalApprove && !canApproveCurrentStep)} onClick={() => {
              if (canFinalApprove) { setOverrideNumber(false); setFront((savedSettings?.lastFront || 0) + 1); setReassignmentOpen(false); setApprovalOpen(true); }
              else { void run(async () => { await officialLetters.review(selected, 'approve'); await reloadSelected(); setNotice('중간 결재를 승인했습니다. 다음 결재 단계에 알림을 보냈습니다.'); }); }
            }}><CheckCircle size={16} />{canFinalApprove ? '최종 승인·발급' : '중간 결재 승인'}</button>
            <button className="ol-button" disabled={busy || dirty} onClick={() => { const reason = window.prompt('반려 사유를 입력해 주세요.'); if (reason?.trim()) { void run(async () => { await officialLetters.review(selected, 'reject', { reason }); await reloadSelected(); }); } }}>반려</button>
          </>}
          {selected.status === 'ISSUED' && <><button className="ol-primary" disabled={busy || dirty} onClick={() => { void download(false); }}><Download size={16} />PDF 다운로드</button><button className="ol-button" disabled={busy || dirty} onClick={() => { void download(true); }}>PDF 열기·인쇄</button></>}
          {selected.status === 'ISSUED' && selected.pdfReady === false && <p className="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-900">발급 승인은 완료되었으나 PDF 파일 저장을 다시 시도해야 합니다. PDF 다운로드 또는 열기·인쇄를 누르면 다시 생성합니다.</p>}
          {isAdmin && <><button className="ol-button" disabled={busy || dirty} onClick={() => { void beginReassignment(); }}><Users size={16} />결재자 재배정</button><button className="ol-button" disabled={busy || dirty} onClick={() => { void run(async () => { setHistory((await officialLetters.history(selected)).history); }); }}><History size={16} />수정 전 보관 이력</button></>}
          {dirty && <p className="w-full text-sm text-amber-700">변경 내용을 먼저 저장해 주세요. 저장하면 결재를 다시 요청해야 합니다.</p>}
        </div>}
        {reassignmentOpen && selected && isAdmin && <form className="rounded-xl border-2 border-indigo-200 p-5 space-y-4" onSubmit={event => {
          event.preventDefault();
          if (!reassignmentReason.trim() || hasUnavailableApprover || dirty) return;
          if (!approverIds.length && !window.confirm('중간 결재자 없이 최종 승인권자가 직접 승인하는 결재라인으로 변경할까요? 이전 승인은 모두 초기화됩니다.')) return;
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
            {!approverIds.length && <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">중간 결재자가 없습니다. 결재 요청 후 회사 관리자 또는 같은 본부의 위임받은 부서관리자가 최종 승인합니다. 저장 시 한 번 더 확인합니다.</p>}
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
        {approvalOpen && selected && canFinalApprove && <form className="rounded-xl border-2 border-indigo-200 p-5 space-y-4" onSubmit={event => {
          event.preventDefault(); void run(async () => {
            await officialLetters.review(selected, 'approve', isAdmin && overrideNumber ? { front } : {}); setApprovalOpen(false);
            const refreshed = await reloadSelected(); setNotice(refreshed?.pdfReady === false ? '최종 승인하고 발급번호를 부여했습니다. PDF 다운로드를 눌러 파일 저장을 다시 시도해 주세요.' : '현재 개정본을 최종 승인하고 발급번호를 부여했습니다. PDF를 다운로드하거나 열어 인쇄할 수 있습니다.');
          });
        }}><h3 className="font-bold">서류 최종 승인</h3>
          <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
            <p>{branding.companyName} · 대표 {branding.representative}</p><p>{branding.address}</p>
            {isAdmin && selected.branding?.sealData && <img src={selected.branding.sealData} alt="결재 요청 당시 인감 (관리자 전용)" className="h-20 w-20 object-contain" />}
          </div>
          <p className="text-sm text-slate-600">아래 내용과 결재 요청 당시의 회사정보를 확인한 후 승인합니다. 번호는 발행 시 서버에서 확정하며, 동시 발행 시 예상 번호가 달라질 수 있습니다.</p>
          <p className="text-sm">발행일: <strong>{koreanDate(issueDate)}</strong> (한국 시간 기준 실제 최종 승인일로 자동 기록)</p>
          {isAdmin && <><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={overrideNumber} onChange={e => setOverrideNumber(e.target.checked)} />관리자 문서번호 직접 지정</label>
            {overrideNumber && <label className="ol-label max-w-xs">앞 세 자리<input type="number" required min={1} max={999} className="ol-input" value={front} onChange={e => setFront(Number(e.target.value))} /></label>}
            <p className="font-bold">{previewNumber(front, issueDate)} · {koreanDate(issueDate)}</p>
            <p className="text-xs text-slate-500">이미 사용한 번호는 재사용할 수 없습니다. 직접 지정한 번호가 기존 최대값보다 크면 이후 자동 번호도 그 다음부터 부여됩니다.</p></>}
          {!isAdmin && <p className="text-sm text-slate-600">문서번호는 승인 시 회사의 다음 번호와 한국 시간 기준 발행일로 자동 부여됩니다.</p>}
          <div className="flex gap-2"><button className="ol-primary" disabled={busy}>승인하고 발행번호 확정</button><button type="button" className="ol-button" onClick={() => setApprovalOpen(false)}>취소</button></div>
        </form>}
        <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">{documentLabels[documentType]} 배치 미리보기 (인감 없는 작성본)</summary>
          {documentType === 'OFFICIAL' ? <article className="ol-preview mt-4">
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
          </article> : <article className="ol-preview ol-certificate mt-4">
            <div className="ol-draft">미리보기 · 승인된 PDF와 구분됩니다</div>
            {branding.logoData && <img src={branding.logoData} alt="회사 로고" className="ol-certificate-logo" />}
            <h3>{documentLabels[documentType]}</h3><p className="ol-certificate-title-en">{documentType === 'EMPLOYMENT' ? 'CERTIFICATE OF EMPLOYMENT' : 'CERTIFICATE OF CAREER'}</p>
            <p className="ol-certificate-number">문서번호 / Document No. {selected?.status === 'ISSUED' ? selected.number : '최종 승인 시 자동 부여'}</p>
            <table className="ol-certificate-table"><tbody>
              <tr><th>성명<span>Korean Name</span></th><td>{certificate.nameKo || '—'}</td><th>영문 성명<span>English Name</span></th><td>{certificate.nameEn || '—'}</td></tr>
              <tr><th>생년월일<span>Date of Birth</span></th><td colSpan={3}>{certificate.birthDate || '—'}</td></tr>
              <tr><th>주소<span>Address</span></th><td colSpan={3}>{certificate.address || '—'}</td></tr>
              <tr><th>소속<span>Division</span></th><td>{certificate.division || '—'}</td><th>직위<span>Position</span></th><td>{certificate.position || '—'}</td></tr>
              <tr><th>{documentType === 'EMPLOYMENT' ? '재직기간' : '근무기간'}<span>Period of Employment</span></th><td colSpan={3}>{certificate.startDate || '—'} ~ {documentType === 'EMPLOYMENT' ? '현재 / Present' : certificate.endDate || '—'}</td></tr>
              <tr><th>제출 용도<span>Purpose</span></th><td colSpan={3}>{certificate.purpose || '—'}</td></tr>
            </tbody></table>
            <div className="ol-certificate-statement"><p>위 사람의 {documentType === 'EMPLOYMENT' ? '재직' : '경력'} 사실을 위와 같이 증명합니다.</p><p>This is to certify that the above-named person {documentType === 'EMPLOYMENT' ? 'is employed by this company.' : 'was employed by this company during the period stated above.'}</p></div>
            <p className="ol-certificate-date">{koreanDate(selected?.issueDate || issueDate)}<span>{selected?.issueDate || issueDate}</span></p>
            <div className="ol-certificate-signature"><p>{branding.companyName || '회사명을 등록해 주세요.'}</p>{branding.companyNameEn && <p className="ol-certificate-company-en">{branding.companyNameEn}</p>}<p>대표이사 {branding.representative || '—'}</p><span>Representative Director · 승인 후 PDF에 인감 적용</span></div>
            <div className="ol-certificate-footer"><p>{branding.address}</p><p>담당부서 / Department: {certificate.department || '—'}</p><p>담당자 / Contact: {certificate.contactName || '—'} · 연락처 / Telephone: {certificate.contactPhone || branding.phone || '—'}</p></div>
          </article>}
        </details>
        {history && <div className="space-y-3 border-t pt-5"><h3 className="font-bold">수정 전 내용 보관함 · 관리자 전용</h3>{!history.length && <p className="text-sm text-slate-500">보관된 이전 개정본이 없습니다.</p>}
          {history.map(version => <details key={version.historyId} className="border rounded-xl p-4"><summary className="cursor-pointer">개정 {version.revision} · {version.number || '미발행'} · {statuses[version.status]} · {version.content.title}</summary>
            <div className="text-sm space-y-3 mt-4"><p>보관: {new Date(version.archivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p><p>수신 / 대상자: {version.content.recipient} / 참조: {version.content.reference}</p><p className="whitespace-pre-wrap leading-7">{version.content.body}</p><p className="whitespace-pre-wrap">붙임: {version.content.attachments}</p>
              {version.content.certificate && <dl className="grid md:grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">{(Object.keys(certificateFieldLabels) as (keyof CertificateContent)[]).map(key => <div key={key}><dt className="font-semibold">{certificateFieldLabels[key]}</dt><dd className="whitespace-pre-wrap break-words">{version.content.certificate?.[key] || '—'}</dd></div>)}</dl>}
              <button className="ol-button text-red-700" disabled={busy} onClick={() => {
                if (!selected || !window.confirm(`개정 ${version.revision}의 보관 내용을 영구 삭제할까요? 문서번호는 재사용되지 않습니다.`)) return;
                void run(async () => { await officialLetters.deleteHistory(selected, version.historyId); setHistory((await officialLetters.history(selected)).history); setNotice('선택한 보관 내용을 삭제했습니다.'); });
              }}>이 보관본 영구 삭제</button></div>
          </details>)}</div>}
      </section>}
    </>}
  </div>;
}
