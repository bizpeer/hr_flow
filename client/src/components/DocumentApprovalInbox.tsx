import { Button, Input, Panel, Select, StatusBadge, Textarea } from './ui';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Clock, FileCheck2, Loader2, RefreshCw, Search } from 'lucide-react';
import type { DocumentApprovalInboxState } from '../hooks/useDocumentApprovalInbox';
import { draftingKindLabel, officialLetters } from '../services/officialLetterService';
import type { LetterSummary, OfficialLetter } from '../services/officialLetterService';
import { useAuthStore } from '../store/authStore';
import { auth } from '../firebase';
import { getErrorMessage } from '../utils/errors';
import { DraftingAttachments } from './DraftingAttachments';

type ApprovalFilter = 'PENDING' | 'ISSUED' | 'REJECTED' | 'ALL';
const documentLabel = (letter: Pick<LetterSummary, 'documentType' | 'draftingKind'>) => letter.documentType === 'DRAFTING' ? draftingKindLabel(letter.draftingKind) : letter.documentType === 'EMPLOYMENT' ? '재직증명서' : letter.documentType === 'CAREER' ? '경력증명서' : '공문';
const isReport = (letter: Pick<LetterSummary, 'draftingKind'>) => letter.draftingKind === 'DAILY' || letter.draftingKind === 'WEEKLY';
const statusLabels = { DRAFT: '작성 중', PENDING: '결재 대기', REJECTED: '반려', ISSUED: '발행 완료', DELETING: '삭제 처리 중' };
const statusLabel = (letter: LetterSummary) => isReport(letter) && letter.status === 'PENDING' ? '확인 대기' : isReport(letter) && letter.status === 'ISSUED' ? '확인 완료' : statusLabels[letter.status];
const statusClass = (status: string) => status === 'ISSUED' ? 'wf-status-success' : status === 'REJECTED' ? 'wf-status-error' : 'wf-status-warning';
function displayDate(value: string, withTime = false): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
}
function currentScope(): string {
  const state = useAuthStore.getState();
  return JSON.stringify([state.user?.uid, auth.currentUser?.uid, state.userData?.uid, state.userData?.companyId, state.userData?.role,
    state.userData?.divisionId || '', state.userData?.teamId || '', state.userData?.status || 'ACTIVE', !!state.userData?.mustChangePassword,
    state.sessionReady, state.companyData?.id, state.companyData?.status]);
}
interface DetailState { scope: string; id: string; revision: number; updatedAt: string; letter: OfficialLetter | null; loading: boolean; error: string }

export function DocumentApprovalInbox({ inbox }: { inbox: DocumentApprovalInboxState }) {
  const { userData } = useAuthStore();
  const [filter, setFilter] = useState<ApprovalFilter>('PENDING');
  const [month, setMonth] = useState('');
  const [kind, setKind] = useState('ALL');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<DetailState>({ scope: '', id: '', revision: 0, updatedAt: '', letter: null, loading: false, error: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const alive = useRef(true); const sequence = useRef(0); const selectedId = useRef(''); const busyRef = useRef(false);
  const scope = currentScope();
  useEffect(() => {
    alive.current = true;
    const requests = sequence;
    return () => { alive.current = false; requests.current += 1; };
  }, []);
  const stillCurrent = (id: string) => alive.current && scope === currentScope() && selectedId.current === id;
  const base = inbox.letters.filter(letter => {
    const date = new Date(letter.createdAt || letter.updatedAt);
    const yearMonth = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(date);
    return (!month || yearMonth === month) && (kind === 'ALL' || (kind === 'OFFICIAL' ? !letter.documentType || letter.documentType === 'OFFICIAL' : letter.documentType === kind)) &&
      `${letter.title} ${letter.creatorName} ${letter.number}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const filtered = base.filter(letter => filter === 'ALL' || letter.status === filter);
  const summary = filtered.find(letter => letter.id === detail.id);
  const matched = detail.scope === scope && summary && summary.revision === detail.revision && summary.updatedAt === detail.updatedAt;
  const letter = matched && detail.letter?.companyId === userData?.companyId ? detail.letter : null;
  const report = letter?.drafting?.kind === 'DAILY' || letter?.drafting?.kind === 'WEEKLY';
  const canReview = Boolean(letter?.status === 'PENDING' && letter.permissions?.canReview);
  const currentLine = letter?.approvalLine.findIndex(step => !step.approvedAt) ?? -1;

  async function open(target: LetterSummary) {
    if (busyRef.current || !inbox.canAccess || scope !== currentScope()) return;
    const request = ++sequence.current; selectedId.current = target.id;
    setRejecting(false); setReason(''); setNotice('');
    setDetail({ scope, id: target.id, revision: target.revision, updatedAt: target.updatedAt, letter: null, loading: true, error: '' });
    try {
      const result = await officialLetters.get(target.id);
      if (!stillCurrent(target.id) || request !== sequence.current) return;
      if (result.letter.id !== target.id || result.letter.companyId !== userData?.companyId || result.letter.revision !== target.revision || result.letter.updatedAt !== target.updatedAt) {
        throw new Error('문서가 변경되었습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.');
      }
      setDetail({ scope, id: target.id, revision: target.revision, updatedAt: target.updatedAt, letter: result.letter, loading: false, error: '' });
    } catch (failure) { if (stillCurrent(target.id) && request === sequence.current) setDetail(previous => ({ ...previous, letter: null, loading: false, error: getErrorMessage(failure) })); }
  }
  async function review(decision: 'approve' | 'reject') {
    const target = letter;
    if (busyRef.current || !target || !canReview || !stillCurrent(target.id) || decision === 'reject' && !reason.trim()) return;
    if (decision === 'approve' && (!window.confirm(report ? target.permissions?.canFinalApprove ? '업무보고 확인을 완료하고 PDF를 생성할까요?' : '현재 업무보고 단계를 확인할까요?' : target.permissions?.canFinalApprove ? '마지막 결재를 승인하고 PDF를 발행할까요?' : '현재 결재 단계를 승인할까요?') || !stillCurrent(target.id))) return;
    busyRef.current = true; setBusy(true); setNotice('');
    let completed = false;
    try {
      if (!stillCurrent(target.id)) return;
      await officialLetters.review(target, decision, decision === 'reject' ? { reason: reason.trim() } : {});
      completed = true;
      if (!stillCurrent(target.id)) return;
      const result = await officialLetters.get(target.id);
      if (!stillCurrent(target.id)) return;
      if (result.letter.id !== target.id || result.letter.companyId !== userData?.companyId) throw new Error('소속 또는 문서 정보가 변경되었습니다.');
      setDetail({ scope, id: target.id, revision: result.letter.revision, updatedAt: result.letter.updatedAt, letter: result.letter, loading: false, error: '' });
      setRejecting(false); setReason('');
      setNotice(decision === 'reject' ? '사유를 기록하고 반려했습니다.' : report ? '업무보고를 확인했습니다.' : result.letter.status === 'ISSUED' ? '최종 승인·발행이 완료되었습니다.' : '현재 단계의 결재를 승인했습니다.');
      if (stillCurrent(target.id)) inbox.refresh();
    } catch (failure) {
      if (stillCurrent(target.id)) {
        setDetail(previous => ({ ...previous, letter: null, loading: false, error: completed ? '처리는 완료되었지만 최신 내용을 불러오지 못했습니다. 목록을 새로고침해 주세요.' : getErrorMessage(failure) }));
        if (completed) inbox.refresh();
      }
    } finally { busyRef.current = false; if (stillCurrent(target.id)) setBusy(false); }
  }
  if (!inbox.canAccess) return <p role="status" className="wf-approval-empty">서류 결재 권한이 있는 회사 계정으로 로그인해 주세요.</p>;
  const activeLink = letter ? `/${letter.documentType === 'DRAFTING' ? 'drafting' : 'documents'}?letter=${encodeURIComponent(letter.id)}` : '';
  return <section className="wf-document-inbox" aria-label="서류 결재함">
    <div className="wf-document-intro"><p>{inbox.role === 'SUB_ADMIN' ? '내 차례인 기안·업무보고와 관리자가 위임한 서류를 검토합니다.' : '회사에서 신청한 기안·업무보고·공문·증명서를 검토합니다.'}</p><Button type="button" className="wf-btn" disabled={busy || inbox.loading} onClick={inbox.refresh}><RefreshCw size={16} className={inbox.loading ? 'animate-spin' : ''} />새로고침</Button></div>
    {notice && <p role="status" className="wf-approval-notice">{notice}</p>}
    <Panel className="wf-panel wf-document-filters"><label className="wf-field">조회 월<Input type="month" className="wf-input" value={month} disabled={busy} onChange={event => setMonth(event.target.value)} /><small>미지정 시 전체 기간</small></label><label className="wf-field">서류 종류<Select className="wf-input" value={kind} disabled={busy} onChange={event => setKind(event.target.value)}><option value="ALL">모든 서류</option><option value="DRAFTING">기안·업무보고</option><option value="OFFICIAL">공문</option><option value="EMPLOYMENT">재직증명서</option><option value="CAREER">경력증명서</option></Select></label><label className="wf-field">검색<span className="wf-approval-search"><Search size={17} /><Input className="wf-input" placeholder="제목, 문서번호 또는 작성자 검색" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} /></span></label>{month && <Button type="button" className="wf-btn" disabled={busy} onClick={() => setMonth('')}>전체 기간</Button>}</Panel>
    <div className="wf-approval-grid">
      <Panel as="section" className="wf-panel wf-approval-list" aria-label="결재 문서 목록"><div className="wf-approval-statuses" aria-label="서류 상태 필터">{(['PENDING', 'ISSUED', 'REJECTED', 'ALL'] as const).map(value => <button type="button" key={value} disabled={busy} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'ALL' ? '전체' : value === 'PENDING' ? `결재 대기 ${base.filter(item => item.status === 'PENDING').length}` : value === 'ISSUED' ? '완료' : '반려'}</button>)}</div>
        {inbox.loading ? <p role="status" className="wf-approval-empty"><Loader2 size={20} className="animate-spin" />서류 결재함을 불러오는 중입니다.</p> : inbox.error ? <div role="alert" className="wf-approval-empty"><AlertCircle size={20} /><p>{inbox.error}</p><Button type="button" className="wf-btn" disabled={busy} onClick={inbox.refresh}>다시 시도</Button></div> : !filtered.length ? <p className="wf-approval-empty">선택한 조건의 서류가 없습니다.</p> : filtered.map(item => <button type="button" key={item.id} className="wf-approval-row" aria-pressed={detail.id === item.id} disabled={busy} onClick={() => void open(item)}><span className="wf-approval-row-top"><span>{documentLabel(item)}</span><StatusBadge className={`wf-status ${statusClass(item.status)}`}>{statusLabel(item)}</StatusBadge></span><strong>{item.title}</strong><span>{item.creatorName || '-'} · {displayDate(item.createdAt || item.updatedAt, true)}</span>{item.number && <span>{item.number} · 개정 {item.revision}</span>}{item.reportPeriod && <span>보고 기간 {item.reportPeriod.startDate} ~ {item.reportPeriod.endDate}</span>}</button>)}
      </Panel>
      <Panel as="section" className="wf-panel wf-approval-detail" aria-label="선택한 서류 상세">
        {detail.scope === scope && detail.loading ? <p role="status" className="wf-approval-empty"><Loader2 size={22} className="animate-spin" />문서를 불러오는 중입니다.</p> : detail.scope === scope && detail.error ? <div role="alert" className="wf-approval-empty"><AlertCircle size={22} /><p>{detail.error}</p><Button type="button" className="wf-btn" disabled={busy} onClick={inbox.refresh}>목록 새로고침</Button></div> : !letter ? <div className="wf-approval-empty"><FileCheck2 size={28} /><h2>검토할 서류를 선택하세요</h2><p>현재 내용과 결재 이력을 확인한 뒤 처리합니다.</p>{summary && detail.letter && <Button type="button" className="wf-btn" disabled={busy} onClick={() => void open(summary)}>최신 내용 불러오기</Button>}</div> : <>
          <div className="wf-approval-detail-head"><div className="wf-approval-row-top"><span>{documentLabel({ documentType: letter.documentType, draftingKind: letter.drafting?.kind })}{letter.number ? ` · ${letter.number}` : ''} · 개정 {letter.revision}</span><Link className="wf-btn" to={activeLink} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>상세 관리<ArrowRight size={15} /></Link></div><h2>{letter.content.title}</h2><p>{letter.creatorName}{letter.drafting?.divisionName ? ` · ${letter.drafting.divisionName}` : ''}{letter.drafting?.teamName ? ` / ${letter.drafting.teamName}` : ''}</p><time>{displayDate(letter.updatedAt, true)}</time></div>
          <div className="wf-approval-detail-body"><section className="wf-approval-section"><div className="wf-panel-head"><h3>{report ? '확인선' : '결재선'}</h3><StatusBadge className={`wf-status ${statusClass(letter.status)}`}>{statusLabel({ ...summary!, status: letter.status })}</StatusBadge></div><ol className="wf-document-steps"><li className="is-complete"><span>담당</span><strong>{letter.creatorName}</strong><small><Check size={14} />신청</small></li>{letter.approvalLine.map((step, index) => <li key={step.uid} className={step.approvedAt ? 'is-complete' : index === currentLine && letter.status === 'PENDING' ? 'is-current' : ''}><span>{step.roleLabel || '중간 결재'}</span><strong>{step.name}</strong><small>{step.approvedAt ? <><Check size={14} />{displayDate(step.approvedAt, true)}</> : <><Clock size={14} />{index === currentLine ? report ? '확인 차례' : '결재 차례' : '대기'}</>}</small></li>)}</ol>{!letter.approvalLine.length && <p className="wf-muted">지정된 중간 결재 단계가 없습니다.</p>}</section>
            <dl className="wf-approval-metadata"><div><dt>작성일</dt><dd>{letter.drafting?.draftDate || displayDate(summary!.createdAt || letter.updatedAt)}</dd></div><div><dt>{report ? '보고 기간' : '수신'}</dt><dd>{report ? `${letter.drafting?.reportPeriod?.startDate} ~ ${letter.drafting?.reportPeriod?.endDate}` : letter.content.recipient || '-'}</dd></div>{!report && <div><dt>참조</dt><dd>{letter.content.reference || '해당 없음'}</dd></div>}<div><dt>작성자</dt><dd>{letter.creatorName}</dd></div></dl>
            {letter.content.certificate && <dl className="wf-approval-metadata">{Object.entries({ 성명: letter.content.certificate.nameKo, 생년월일: letter.content.certificate.birthDate, 소속: letter.content.certificate.division, 직위: letter.content.certificate.position, 입사일: letter.content.certificate.startDate, 퇴사일: letter.content.certificate.endDate, 주소: letter.content.certificate.address, '제출 용도': letter.content.certificate.purpose }).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
            <section className="wf-approval-section"><h3>문서 내용</h3><p className="wf-approval-content">{letter.content.body}</p></section>
            {letter.content.cooperationNote && <section className="wf-approval-section"><h3>참조 요청사항</h3><p className="wf-approval-content">{letter.content.cooperationNote}</p></section>}
            {letter.content.attachments && <section className="wf-approval-section"><h3>첨부 설명</h3><p className="wf-approval-content">{letter.content.attachments}</p></section>}
            {!!letter.content.attachmentFiles?.length && <section className="wf-approval-section"><h3>첨부자료 · {letter.content.attachmentFiles.length}개</h3><DraftingAttachments key={`${scope}:${letter.id}:${letter.revision}`} documentId={letter.id} revision={letter.revision} files={letter.content.attachmentFiles} disabled={busy} isCurrent={() => stillCurrent(letter.id)} /></section>}
            {letter.rejectionReason && <section className="wf-approval-section"><h3>반려 사유</h3><p className="wf-approval-content">{letter.rejectionReason}</p></section>}
          </div>
          {rejecting && canReview && <form className="wf-document-reject-form" onSubmit={event => { event.preventDefault(); void review('reject'); }}><label className="wf-field">반려 사유<Textarea className="wf-input" required maxLength={1000} rows={3} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label><div><Button type="button" className="wf-btn" disabled={busy} onClick={() => { setRejecting(false); setReason(''); }}>취소</Button><Button className="wf-btn wf-approval-reject" disabled={busy || !reason.trim()}>사유 기록·반려</Button></div></form>}
          <footer className="wf-approval-detail-footer"><p><Clock size={16} />{canReview ? report ? '현재 업무보고 확인 차례입니다.' : '현재 결재 차례입니다.' : letter.status === 'ISSUED' ? report ? '확인이 완료된 업무보고입니다.' : '발행이 완료된 서류입니다.' : '지정된 차례의 담당자가 처리합니다.'}</p><div>{canReview && !rejecting && <><Button type="button" className="wf-btn wf-approval-reject" disabled={busy} onClick={() => setRejecting(true)}>반려</Button><Button type="button" className="wf-btn wf-btn-primary" disabled={busy} onClick={() => void review('approve')}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{report ? letter.permissions?.canFinalApprove ? '확인 완료·PDF 생성' : '업무보고 확인' : letter.permissions?.canFinalApprove ? '최종 승인·발행' : '결재 승인'}</Button></>}</div></footer>
        </>}
      </Panel>
    </div>
  </section>;
}
