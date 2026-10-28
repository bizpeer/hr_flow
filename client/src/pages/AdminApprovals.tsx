import { Button, Input, PageHeading, Panel, Select, StatusBadge } from '../components/ui';
import { useEffect, useRef, useState } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, where } from 'firebase/firestore';
import { Calendar, Check, CheckCircle2, Clock, FileText, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { DocumentApprovalInbox } from '../components/DocumentApprovalInbox';
import { SecureAttachment } from '../components/SecureAttachment';
import { accountSecurity } from '../services/accountSecurityService';
import type { DirectoryUser } from '../services/accountSecurityService';
import { useDocumentApprovalInbox } from '../hooks/useDocumentApprovalInbox';
import './AdminApprovals.css';

interface LeaveRequest {
  id: string; userId: string; userName: string; type: string; startDate: string; endDate: string; reason: string;
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED'; createdAt: string; requestDays: number;
  teamId?: string; divisionId?: string; attachmentName?: string; attachmentUrl?: string; attachmentPath?: string;
}
interface ExpenseRequest {
  id: string; userId: string; userName: string; title: string; amount: number; date: string; category: string; description: string;
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED'; createdAt: string;
  teamId?: string; divisionId?: string; attachmentName?: string; attachmentUrl?: string; attachmentPath?: string;
}
type ApprovalRequest = Pick<LeaveRequest, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'> & Partial<LeaveRequest & ExpenseRequest>;
interface OrganizationUnit { id: string; name: string; divisionId?: string }
type ApprovalTab = 'LEAVE' | 'EXPENSE' | 'DOCUMENT';
const statusLabels = { PENDING: '결재 대기', SUB_APPROVED: '최종 승인 대기', APPROVED: '최종 승인', REJECTED: '반려' };
const statusClass = (status: string) => status === 'APPROVED' ? 'wf-status-success' : status === 'REJECTED' ? 'wf-status-error' : status === 'SUB_APPROVED' ? 'wf-status-info' : 'wf-status-warning';
function displayDate(value: string, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
}

export function AdminApprovals() {
  const { userData, loading: authLoading, sessionReady } = useAuthStore();
  const documentInbox = useDocumentApprovalInbox();
  const documentCount = documentInbox.loading ? '…' : documentInbox.pendingCount ?? '—';
  const [activeTab, setActiveTab] = useState<ApprovalTab>('LEAVE');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [search, setSearch] = useState('');
  const [divisions, setDivisions] = useState<OrganizationUnit[]>([]);
  const [teams, setTeams] = useState<OrganizationUnit[]>([]);
  const [employees, setEmployees] = useState<DirectoryUser[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);

  useEffect(() => {
    if (authLoading || !sessionReady || !userData?.companyId) return;
    const companyId = userData.companyId;
    const divisionFilter = userData.role === 'SUB_ADMIN' ? [where('divisionId', '==', userData.divisionId || '__unassigned__')] : [];
    const unsubLeave = onSnapshot(query(collection(db, 'leaves'), where('companyId', '==', companyId), ...divisionFilter), snap => {
      setLeaveRequests(snap.docs.map(item => ({ id: item.id, ...item.data() } as LeaveRequest)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
    const unsubExpense = onSnapshot(query(collection(db, 'expenses'), where('companyId', '==', companyId), ...divisionFilter), snap => {
      setExpenseRequests(snap.docs.map(item => ({ id: item.id, ...item.data() } as ExpenseRequest)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
    const unsubDivs = onSnapshot(query(collection(db, 'divisions'), where('companyId', '==', companyId)), snap => setDivisions(snap.docs.map(item => ({ ...item.data(), id: item.id } as OrganizationUnit))));
    const unsubTeams = onSnapshot(query(collection(db, 'teams'), where('companyId', '==', companyId)), snap => setTeams(snap.docs.map(item => ({ ...item.data(), id: item.id } as OrganizationUnit))));
    return () => { unsubLeave(); unsubExpense(); unsubDivs(); unsubTeams(); };
  }, [authLoading, sessionReady, userData]);
  useEffect(() => {
    if (authLoading || !sessionReady || !userData?.companyId) return;
    let active = true;
    accountSecurity.directory().then(result => { if (active) { setEmployees(result.users); setDirectoryError(''); } }).catch(failure => {
      if (active) { setEmployees([]); setDirectoryError(failure instanceof Error ? failure.message : '직원 목록을 불러오지 못했습니다.'); }
    });
    return () => { active = false; };
  }, [authLoading, sessionReady, userData?.uid, userData?.companyId, userData?.role, userData?.divisionId, directoryRetry]);

  async function handleUpdateStatus(collectionName: string, id: string, newStatus?: LeaveRequest['status']) {
    if (updatingRef.current) return;
    const actor = useAuthStore.getState();
    if (actor.userData?.uid !== userData?.uid || actor.userData?.companyId !== userData?.companyId ||
      actor.userData?.role !== userData?.role || actor.userData?.divisionId !== userData?.divisionId) return;
    const sameActor = () => {
      const current = useAuthStore.getState();
      return current.sessionReady && current.user?.uid === actor.user?.uid && current.userData?.uid === actor.userData?.uid &&
        current.userData?.companyId === actor.userData?.companyId && current.userData?.role === actor.userData?.role &&
        current.userData?.divisionId === actor.userData?.divisionId && current.companyData?.status === 'ACTIVE' &&
        (!current.userData?.status || current.userData.status === 'ACTIVE') && !current.userData?.mustChangePassword;
    };
    if (!sameActor()) return;
    const targetStatus = newStatus || (userData?.role === 'SUB_ADMIN' ? 'SUB_APPROVED' : 'APPROVED');
    const actionText = targetStatus === 'SUB_APPROVED' ? '1차 승인' : targetStatus === 'APPROVED' ? '최종 승인' : targetStatus === 'REJECTED' ? '반려' : '결재대기(취소)';
    if (!window.confirm(`이 요청을 ${actionText} 상태로 변경하시겠습니까?${targetStatus === 'PENDING' ? '\n(연차 승인 건의 경우 소진된 연차가 자동으로 복구됩니다.)' : ''}`) || !sameActor()) return;
    updatingRef.current = true; setUpdating(true);
    try {
      await updateDoc(doc(db, collectionName, id), { status: targetStatus, updatedAt: new Date().toISOString(), updatedBy: userData?.name || '시스템' });
      if (sameActor()) window.alert(`${actionText} 처리가 완료되었습니다.`);
    } catch (failure) { if (sameActor()) window.alert(failure instanceof Error ? failure.message : '상태 업데이트에 실패했습니다.'); }
    finally { updatingRef.current = false; if (sameActor()) setUpdating(false); }
  }
  const applyFilters = <T extends ApprovalRequest,>(requests: T[]) => requests.filter(request => {
    const statusMatch = filter === 'ALL' || (filter === 'PENDING' ? request.status === 'PENDING' || request.status === 'SUB_APPROVED' : request.status === filter);
    const date = request.createdAt ? new Date(request.createdAt) : null;
    const monthMatch = date ? format(date, 'yyyy-MM') === selectedMonth : true;
    const profile = employees.find(employee => employee.uid === request.userId);
    const teamId = request.teamId || profile?.teamId;
    const team = teams.find(unit => unit.id === teamId);
    const divisionId = request.divisionId || profile?.divisionId || team?.divisionId;
    if (userData?.role === 'SUB_ADMIN' && divisionId !== userData.divisionId) return false;
    return statusMatch && monthMatch && (selectedDivision === 'ALL' || divisionId === selectedDivision) && (selectedTeam === 'ALL' || teamId === selectedTeam) &&
      `${request.userName} ${request.title || ''} ${request.reason || ''}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const filteredLeaves = applyFilters(leaveRequests);
  const filteredExpenses = applyFilters(expenseRequests);
  const filteredRequests: ApprovalRequest[] = activeTab === 'LEAVE' ? filteredLeaves : filteredExpenses;
  const selected = activeTab !== 'DOCUMENT' ? filteredRequests.find(request => request.id === selectedRequest?.id) || null : null;
  const canProcess = (request: ApprovalRequest) => userData?.role === 'SUB_ADMIN' && request.status === 'PENDING' || userData?.role === 'ADMIN' && (request.status === 'PENDING' || request.status === 'SUB_APPROVED');
  const canRestore = (request: ApprovalRequest) => userData?.role === 'ADMIN' && ['APPROVED', 'REJECTED', 'SUB_APPROVED'].includes(request.status) && !canProcess(request);
  const organization = (request: ApprovalRequest) => {
    const profile = employees.find(employee => employee.uid === request.userId);
    const team = teams.find(unit => unit.id === (request.teamId || profile?.teamId));
    const division = divisions.find(unit => unit.id === (request.divisionId || team?.divisionId));
    return [division?.name || '소속 미지정', team?.name || '팀 미지정'].join(' · ');
  };
  const switchTab = (tab: ApprovalTab) => { if (updatingRef.current) return; setSelectedRequest(null); setActiveTab(tab); };

  if (authLoading) return <div className="wf-approvals wf-loading" role="status"><Loader2 className="animate-spin" size={22} />결재함을 불러오는 중입니다.</div>;
  return <div className="wf-approvals">
    <PageHeading className="wf-page-heading"><div><h1>결재/승인 관리함</h1><p>요청 문서를 검토하고 승인·확인 이력을 관리하세요.</p></div></PageHeading>
    {directoryError && <div role="alert" className="wf-approval-alert">{directoryError}<Button type="button" className="wf-btn" onClick={() => setDirectoryRetry(value => value + 1)}>직원 목록 다시 불러오기</Button></div>}
    <div className="wf-approval-tabs" role="tablist" aria-label="결재 종류">
      <button type="button" role="tab" aria-selected={activeTab === 'LEAVE'} disabled={updating} onClick={() => switchTab('LEAVE')}><Calendar size={17} />휴가 신청 <span>{filteredLeaves.length}</span></button>
      <button type="button" role="tab" aria-selected={activeTab === 'EXPENSE'} disabled={updating} onClick={() => switchTab('EXPENSE')}><FileText size={17} />지출 결의 <span>{filteredExpenses.length}</span></button>
      <button type="button" role="tab" aria-selected={activeTab === 'DOCUMENT'} disabled={updating} onClick={() => switchTab('DOCUMENT')}><FileText size={17} />서류 결재 <span>{documentCount}</span></button>
    </div>
    {activeTab === 'DOCUMENT' ? <DocumentApprovalInbox key={`${userData?.uid}:${userData?.companyId}:${userData?.role}:${userData?.divisionId || ''}:${userData?.teamId || ''}`} inbox={documentInbox} /> : <>
      <Panel className="wf-panel wf-approval-filters">
        <label className="wf-field">조회 기준 월<Input type="month" className="wf-input" value={selectedMonth} disabled={updating} onChange={event => setSelectedMonth(event.target.value)} /></label>
        <label className="wf-field">본부<Select className="wf-input" value={selectedDivision} disabled={updating} onChange={event => { setSelectedDivision(event.target.value); setSelectedTeam('ALL'); }}><option value="ALL">전체 본부</option>{divisions.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}</Select></label>
        <label className="wf-field">팀<Select className="wf-input" value={selectedTeam} onChange={event => setSelectedTeam(event.target.value)} disabled={updating || selectedDivision === 'ALL'}><option value="ALL">전체 팀</option>{teams.filter(team => team.divisionId === selectedDivision).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></label>
        <label className="wf-field">검색<span className="wf-approval-search"><Search size={17} /><Input className="wf-input" placeholder="제목 또는 신청자 검색" value={search} disabled={updating} onChange={event => setSearch(event.target.value)} /></span></label>
      </Panel>
      <div className="wf-approval-grid">
        <Panel as="section" className="wf-panel wf-approval-list" aria-label={activeTab === 'LEAVE' ? '휴가 신청 목록' : '지출 결의 목록'}>
          <div className="wf-approval-statuses" aria-label="결재 상태 필터">{(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} disabled={updating} onClick={() => setFilter(value)}>{value === 'ALL' ? '전체' : value === 'PENDING' ? '결재 대기' : value === 'APPROVED' ? '최종 승인' : '반려'}</button>)}</div>
          {!filteredRequests.length && <p className="wf-approval-empty">선택한 조건의 안건이 없습니다.</p>}
          {filteredRequests.map(request => <button type="button" key={request.id} className="wf-approval-row" aria-pressed={selected?.id === request.id} disabled={updating} onClick={() => setSelectedRequest(request)}><span className="wf-approval-row-top"><span>{activeTab === 'LEAVE' ? request.type === 'annual' ? '연차' : request.type === 'half' ? '반차' : '휴가' : request.category || '지출결의'}</span><StatusBadge className={`wf-status ${statusClass(request.status)}`}>{statusLabels[request.status]}</StatusBadge></span><strong>{activeTab === 'LEAVE' ? request.reason || '휴가 신청' : request.title}</strong><span>{request.userName} · {organization(request)}</span><span>{activeTab === 'LEAVE' ? `${request.startDate} ~ ${request.endDate} · ${request.requestDays}일` : `${Number(request.amount).toLocaleString()}원 · ${request.date}`}</span><time>{displayDate(request.createdAt, true)}</time></button>)}
        </Panel>
        <Panel as="section" className="wf-panel wf-approval-detail" aria-label="선택한 결재 상세">
          {!selected ? <div className="wf-approval-empty"><FileText size={28} /><h2>검토할 안건을 선택하세요</h2><p>내용과 첨부자료를 확인한 뒤 승인하거나 반려할 수 있습니다.</p></div> : <>
            <div className="wf-approval-detail-head"><div className="wf-approval-row-top"><StatusBadge className={`wf-status ${statusClass(selected.status)}`}>{statusLabels[selected.status]}</StatusBadge><Button type="button" className="wf-btn wf-approval-close" aria-label="상세 닫기" disabled={updating} onClick={() => setSelectedRequest(null)}><X size={17} /></Button></div><h2>{activeTab === 'LEAVE' ? '휴가 신청' : selected.title || '지출결의'}</h2><p>{selected.userName} · {organization(selected)}</p><time>{displayDate(selected.createdAt, true)}</time></div>
            <div className="wf-approval-detail-body"><dl className="wf-approval-metadata"><div><dt>신청 분류</dt><dd>{activeTab === 'LEAVE' ? selected.type === 'annual' ? '연차 휴가' : selected.type === 'half' ? '반차 휴가' : '경조사/병가' : selected.category}</dd></div><div><dt>{activeTab === 'LEAVE' ? '사용 일수' : '지출 금액'}</dt><dd>{activeTab === 'LEAVE' ? `${selected.requestDays}일` : `${Number(selected.amount).toLocaleString()}원`}</dd></div><div><dt>{activeTab === 'LEAVE' ? '휴가 기간' : '지출일'}</dt><dd>{activeTab === 'LEAVE' ? `${selected.startDate} ~ ${selected.endDate}` : selected.date}</dd></div><div><dt>현재 상태</dt><dd>{statusLabels[selected.status]}</dd></div></dl>
              <section className="wf-approval-section"><h3>{activeTab === 'LEAVE' ? '상세 사유' : '지출 상세 내용'}</h3><p className="wf-approval-content">{activeTab === 'LEAVE' ? selected.reason : selected.description || selected.title}</p></section>
              <section className="wf-approval-section"><h3>결재 진행</h3><ol className="wf-approval-steps"><li className="is-complete"><Check size={16} /><span>신청 완료</span></li><li className={selected.status === 'SUB_APPROVED' || selected.status === 'APPROVED' ? 'is-complete' : ''}><Check size={16} /><span>1차 승인</span></li><li className={selected.status === 'APPROVED' ? 'is-complete' : ''}><Check size={16} /><span>{selected.status === 'REJECTED' ? '반려됨' : '최종 승인'}</span></li></ol></section>
              <section className="wf-approval-section"><h3>첨부 증빙 자료</h3>{selected.attachmentPath || selected.attachmentUrl ? <SecureAttachment key={`${activeTab}:${selected.id}:${selected.attachmentPath || ''}`} category={activeTab === 'EXPENSE' ? 'expenses' : 'leaves'} documentId={selected.id} name={selected.attachmentName} version={selected.attachmentPath} preview /> : <p className="wf-muted">{selected.attachmentName ? `${selected.attachmentName} · 파일 데이터가 없는 이전 요청입니다.` : '첨부된 증빙 서류가 없습니다.'}</p>}</section>
            </div>
            <footer className="wf-approval-detail-footer"><p><Clock size={16} />{selected.status === 'PENDING' ? '요청 내용을 확인한 뒤 처리하세요.' : statusLabels[selected.status]}</p><div>{canRestore(selected) && <Button type="button" className="wf-btn" disabled={updating} onClick={() => void handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', selected.id, 'PENDING')}><RotateCcw size={16} />승인 취소·복구</Button>}{canProcess(selected) && <><Button type="button" className="wf-btn wf-approval-reject" disabled={updating} onClick={() => void handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', selected.id, 'REJECTED')}>반려</Button><Button type="button" className="wf-btn wf-btn-primary" disabled={updating} onClick={() => void handleUpdateStatus(activeTab === 'LEAVE' ? 'leaves' : 'expenses', selected.id)}>{updating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{userData?.role === 'SUB_ADMIN' ? '1차 승인' : '최종 승인'}</Button></>}</div></footer>
          </>}
        </Panel>
      </div>
      <section className="wf-approval-statistics" aria-label="선택 조건의 결재 요약"><Panel className="wf-panel"><span>최종 승인</span><strong>{filteredLeaves.filter(request => request.status === 'APPROVED').length + filteredExpenses.filter(request => request.status === 'APPROVED').length}<small>건</small></strong></Panel><Panel className="wf-panel"><span>전체 미처리 안건</span><strong>{leaveRequests.filter(request => request.status === 'PENDING' || request.status === 'SUB_APPROVED').length + expenseRequests.filter(request => request.status === 'PENDING' || request.status === 'SUB_APPROVED').length}<small>건</small></strong></Panel><Panel className="wf-panel"><span>승인 지출 합계</span><strong>{filteredExpenses.filter(request => request.status === 'APPROVED').reduce((sum, request) => sum + request.amount, 0).toLocaleString()}<small>원</small></strong></Panel><Panel className="wf-panel"><span>반려 비율</span><strong>{Math.round((filteredLeaves.filter(request => request.status === 'REJECTED').length + filteredExpenses.filter(request => request.status === 'REJECTED').length) / Math.max(1, filteredLeaves.length + filteredExpenses.length) * 100)}<small>%</small></strong></Panel></section>
    </>}
  </div>;
}
