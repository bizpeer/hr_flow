import type { MouseEvent } from 'react';
import { ArrowUp, BookOpen, ExternalLink, ListChecks, ShieldCheck, Users } from 'lucide-react';
import {
  featureSummaries, guideImportantNotes, guidePermissions, guideQuickStart, guideRoles,
  guideSections, guideSourceLinks, guideUpdatedAt, roleMappingNotes,
} from '../content/productGuide';

function moveToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  section.focus({ preventScroll: true });
}

const sectionStyle = 'scroll-mt-24 min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:p-7';

export function ProductOverview() {
  return <section aria-labelledby="product-overview-title" className="space-y-8 break-keep text-left">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold tracking-wider text-indigo-600">현재 운영 기능</p><h2 id="product-overview-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">HR 업무를 한곳에서 확인하세요</h2></div>
      <p className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">안내 기준 · {guideUpdatedAt}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {featureSummaries.map((feature, index) => <article key={feature.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
        <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-black text-indigo-600 shadow-sm">{String(index + 1).padStart(2, '0')}</span>
        <h3 className="text-lg font-bold tracking-tight text-slate-900">{feature.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">{feature.summary}</p>
        <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-600">
          {feature.highlights.map(highlight => <li key={highlight} className="flex items-start gap-2"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden="true" /><span>{highlight}</span></li>)}
        </ul>
      </article>)}
    </div>
    <section aria-labelledby="product-quickstart-title" className="rounded-2xl bg-indigo-50 p-5 sm:p-7">
      <h3 id="product-quickstart-title" className="flex items-center gap-2 text-lg font-bold text-indigo-950"><ListChecks className="h-5 w-5 shrink-0 text-indigo-600" />처음 시작하는 순서</h3>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2">
        {guideQuickStart.map((step, index) => <li key={step} className="flex items-start gap-3 text-sm leading-7 text-indigo-950"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index + 1}</span><span>{step}</span></li>)}
      </ol>
    </section>
  </section>;
}

export function ProductManual() {
  const contents = [
    { id: 'guide-roles', title: '역할과 메뉴 권한' },
    ...guideSections.map(section => ({ id: `guide-section-${section.id}`, title: section.title })),
    { id: 'guide-notes', title: '이용 전 확인사항' },
    { id: 'guide-sources', title: '참고 자료' },
  ];
  return <section aria-labelledby="product-manual-title" className="space-y-6 break-keep text-left">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
      <div><p className="flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-600"><BookOpen className="h-4 w-4" />현재 운영 기준</p><h2 id="product-manual-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">기능요약 설명서</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">처음 가입하는 순서부터 역할별 권한과 업무 처리 절차까지 확인하세요. 목차를 선택하면 해당 설명으로 이동합니다.</p></div>
      <p className="text-xs font-semibold text-slate-500">업데이트 기준 · {guideUpdatedAt}</p>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav id="guide-contents" aria-label="기능 설명서 목차" tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:sticky lg:top-24">
        <h3 className="text-sm font-bold text-slate-900">목차</h3>
        <ol className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
          {contents.map((item, index) => <li key={item.id}><a href={`#${item.id}`} onClick={event => moveToSection(event, item.id)} className="block rounded-lg px-2 py-2 text-sm leading-6 text-slate-600 hover:bg-white hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"><span className="mr-2 text-xs text-slate-400">{String(index + 1).padStart(2, '0')}</span>{item.title}</a></li>)}
        </ol>
      </nav>
      <div className="min-w-0 space-y-6">
        <section id="guide-roles" aria-labelledby="guide-roles-title" tabIndex={-1} className={sectionStyle}>
          <h3 id="guide-roles-title" className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"><Users className="h-5 w-5 shrink-0 text-indigo-600" />역할과 메뉴 권한</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {guideRoles.map(role => <article key={role.key} className="rounded-xl bg-slate-50 p-4"><h4 className="font-bold text-slate-900">{role.label}</h4><p className="mt-2 text-xs font-semibold text-indigo-600"><span className="mr-2 text-slate-500">앱 표시명</span>{role.appRole}</p><p className="mt-2 text-xs leading-6 text-slate-500">{role.currentPermission}</p><p className="mt-2 text-sm leading-7 text-slate-600">{role.description}</p></article>)}
          </div>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">{roleMappingNotes.map(note => <li key={note}>{note}</li>)}</ul>
          <p className="mt-6 text-xs leading-6 text-slate-500">권한표가 화면보다 넓으면 좌우로 스크롤해 각 역할의 범위를 확인하세요.</p>
          <div role="region" aria-label="역할별 메뉴 권한표" tabIndex={0} className="mt-2 overflow-x-auto rounded-xl border border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <caption className="sr-only">역할별 메뉴 접근과 처리 권한</caption>
              <thead className="bg-indigo-50 text-indigo-950"><tr><th scope="col" className="w-40 p-4 font-bold">메뉴·업무</th>{guideRoles.map(role => <th key={role.key} scope="col" className="min-w-36 p-4 font-bold">{role.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-200">{guidePermissions.map(permission => <tr key={permission.menu}><th scope="row" className="p-4 align-top font-semibold leading-7 text-slate-900">{permission.menu}</th>{guideRoles.map(role => <td key={role.key} className="whitespace-pre-line p-4 align-top leading-7 text-slate-600">{permission.access[role.key]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
        {guideSections.map(section => <section key={section.id} id={`guide-section-${section.id}`} aria-labelledby={`guide-section-${section.id}-title`} tabIndex={-1} className={sectionStyle}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h3 id={`guide-section-${section.id}-title`} className="text-xl font-bold tracking-tight text-slate-900">{section.title}</h3><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold leading-6 text-indigo-700">{section.audience}</span></div>
          <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">{section.summary}</p>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 sm:p-5"><h4 className="text-sm font-bold text-slate-900">처리 순서</h4><ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-700">{section.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol></div>
          <h4 className="mt-6 text-sm font-bold text-slate-900">기능과 권한</h4>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">{section.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
          {Boolean(section.notes?.length) && <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4"><h4 className="text-sm font-bold text-amber-950">확인할 사항</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-7 text-amber-950">{section.notes?.map(note => <li key={note}>{note}</li>)}</ul></div>}
          <a href="#guide-contents" onClick={event => moveToSection(event, 'guide-contents')} className="mt-6 inline-flex items-center gap-2 rounded-lg py-1 text-sm font-semibold text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"><ArrowUp className="h-4 w-4" />목차로 돌아가기</a>
        </section>)}
        <section id="guide-notes" aria-labelledby="guide-notes-title" tabIndex={-1} className={sectionStyle}>
          <h3 id="guide-notes-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><ShieldCheck className="h-5 w-5 shrink-0 text-indigo-600" />이용 전 확인사항</h3>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-600">{guideImportantNotes.map(note => <li key={note}>{note}</li>)}</ul>
        </section>
        <section id="guide-sources" aria-labelledby="guide-sources-title" tabIndex={-1} className={sectionStyle}>
          <h3 id="guide-sources-title" className="text-xl font-bold text-slate-900">참고 자료</h3>
          <ul className="mt-4 space-y-3">{guideSourceLinks.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex items-start gap-2 rounded-lg text-sm font-semibold leading-7 text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"><span>{source.title}<span className="sr-only"> (새 탭)</span></span><ExternalLink className="mt-1.5 h-4 w-4 shrink-0" /></a></li>)}</ul>
        </section>
      </div>
    </div>
  </section>;
}
