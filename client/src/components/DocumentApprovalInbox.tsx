import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, FileCheck2, Loader2, RefreshCw } from 'lucide-react';
import type { DocumentApprovalInboxState } from '../hooks/useDocumentApprovalInbox';
import { draftingKindLabel } from '../services/officialLetterService';

type ApprovalFilter = 'PENDING' | 'ISSUED' | 'REJECTED' | 'ALL';

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric',
  }).format(date);
}

export function DocumentApprovalInbox({ inbox }: { inbox: DocumentApprovalInboxState }) {
  const [filter, setFilter] = useState<ApprovalFilter>('PENDING');
  const { role, refresh, ...state } = inbox;
  if (!inbox.canAccess) return <p role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-500">서류 결재 권한이 있는 회사 계정으로 로그인해 주세요.</p>;

  const filtered = state.letters.filter(letter => filter === 'ALL' || letter.status === filter);
  const statusLabels = { DRAFT: '작성 중', PENDING: '결재 대기', REJECTED: '반려', ISSUED: '발행 완료', DELETING: '삭제 처리 중' };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7" aria-label="서류 결재함">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileCheck2 className="h-5 w-5 text-indigo-600" />서류 결재함</h2>
          <p className="mt-1 text-sm text-slate-500">{role === 'SUB_ADMIN' ? '내 차례인 기안서·업무보고와 관리자가 위임한 서류를 검토할 수 있습니다.' : '회사에서 신청한 기안서·업무보고·공문·증명서의 결재와 확인을 관리합니다.'}</p>
        </div>
        <button type="button" disabled={state.loading} onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} />새로고침</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="서류 상태 필터">
        {(['PENDING', 'ISSUED', 'REJECTED', 'ALL'] as const).map(value => (
          <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{value === 'ALL' ? '전체' : statusLabels[value]}</button>
        ))}
      </div>
      {state.loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />서류 결재함을 불러오는 중입니다.</p> : state.error ? (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div>{state.error}<button type="button" onClick={refresh} className="mt-2 block font-bold underline">다시 시도</button></div></div>
      ) : filtered.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">선택한 상태의 서류가 없습니다.</p> : (
        <div className="mt-5 divide-y divide-slate-100">
          {filtered.map(letter => (
            <div key={letter.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-indigo-600">{letter.documentType === 'DRAFTING' ? draftingKindLabel(letter.draftingKind) : letter.documentType === 'EMPLOYMENT' ? '재직증명서' : letter.documentType === 'CAREER' ? '경력증명서' : '공문'}</span><span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{letter.draftingKind && letter.draftingKind !== 'DRAFT' && letter.status === 'PENDING' ? '확인 대기' : letter.draftingKind && letter.draftingKind !== 'DRAFT' && letter.status === 'ISSUED' ? '확인 완료' : statusLabels[letter.status]}</span></div>
                <p className="break-words font-bold text-slate-800">{letter.title}</p>
                <p className="mt-1 text-xs text-slate-500">신청자 {letter.creatorName || '-'} · {displayDate(letter.createdAt || letter.updatedAt)}{letter.draftingKind && letter.draftingKind !== 'DRAFT' ? '' : ` · ${letter.number || '발행 전'}`}</p>
              </div>
              <Link to={`/${letter.documentType === 'DRAFTING' ? 'drafting' : 'documents'}?letter=${encodeURIComponent(letter.id)}`} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 sm:self-auto">{letter.canReview ? letter.draftingKind && letter.draftingKind !== 'DRAFT' ? '업무보고 확인' : '검토·결재' : '서류 확인'}<ArrowRight className="h-4 w-4" /></Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
