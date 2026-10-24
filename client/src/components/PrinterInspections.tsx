import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Printer, RefreshCw } from 'lucide-react';
import { officialLetters, seoulDate } from '../services/officialLetterService';
import type { LetterSettings, PrinterDetails, PrinterInspection, PrinterInspectionRequest, PrinterProfile } from '../services/officialLetterService';

export interface PrinterNavigationGuard {
  hasPending: () => boolean;
  isSaving: () => boolean;
  discard: () => void;
}
interface Props {
  savedSettings: LetterSettings | null;
  templateReady: boolean;
  templatePending: boolean;
  registerGuard: (guard: PrinterNavigationGuard | null) => void;
}
type MeasurementKey = 'measuredSealWidthMm' | 'measuredSealHeightMm' | 'horizontal100Mm' | 'vertical100Mm';
interface InspectionDraft extends Record<MeasurementKey, string> {
  inspectedOn: string;
  toleranceMm: string;
  note: string;
  printSettings: string;
  actualSizeConfirmed: boolean;
}
interface InspectionBasis { settingsVersion: number; sealWidthMm: number | null; sealHeightMm: number | null; printerVersion: number }
const emptyPrinter = (): PrinterDetails => ({ name: '', model: '', location: '', active: true });
const printerDetails = (printer: PrinterProfile): PrinterDetails => ({ name: printer.name, model: printer.model, location: printer.location, active: printer.active });
const emptyInspection = (): InspectionDraft => ({ inspectedOn: seoulDate(), measuredSealWidthMm: '', measuredSealHeightMm: '',
  horizontal100Mm: '', vertical100Mm: '', toleranceMm: '0.5', note: '', printSettings: '', actualSizeConfirmed: false });
const measurements: [MeasurementKey, string][] = [['measuredSealWidthMm', '인감 가로 실측 (mm)'], ['measuredSealHeightMm', '인감 세로 실측 (mm)'],
  ['horizontal100Mm', '100mm 자 가로 실측 (mm)'], ['vertical100Mm', '100mm 자 세로 실측 (mm)']];
const message = (failure: unknown) => failure instanceof Error ? failure.message : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const merge = <T extends { id: string }>(previous: T[], incoming: T[]) => [...new Map([...previous, ...incoming].map(item => [item.id, item])).values()];
const resultLabel = (result: PrinterInspection['result']) => result === 'PASS' ? '적합 (PASS)' : '재점검 필요 (RECHECK)';
const isStep = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max && Math.abs(value * 10 - Math.round(value * 10)) < 0.000001;

export function PrinterInspections({ savedSettings, templateReady, templatePending, registerGuard }: Props) {
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [printerCursor, setPrinterCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<PrinterProfile | null>(null);
  const [draft, setDraft] = useState<PrinterDetails>(emptyPrinter);
  const [printerDirty, setPrinterDirty] = useState(false);
  const [inspection, setInspection] = useState<InspectionDraft>(emptyInspection);
  const [inspectionDirty, setInspectionDirty] = useState(false);
  const [inspectionBasis, setInspectionBasis] = useState<InspectionBasis | null>(null);
  const [inspections, setInspections] = useState<PrinterInspection[]>([]);
  const [inspectionCursor, setInspectionCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const printerDirtyRef = useRef(false);
  const selectedRef = useRef<PrinterProfile | null>(null);
  const inspectionDirtyRef = useRef(false);
  const inspectionBasisRef = useRef<InspectionBasis | null>(null);
  const savingRef = useRef(false);
  const liveRef = useRef(true);
  const historyRequest = useRef(0);
  const listRequest = useRef(0);
  const retryRequest = useRef<{ fingerprint: string; request: PrinterInspectionRequest } | null>(null);

  const discard = useCallback(() => {
    setDraft(selected ? printerDetails(selected) : emptyPrinter());
    setInspection(emptyInspection());
    inspectionBasisRef.current = null; setInspectionBasis(null);
    printerDirtyRef.current = false; inspectionDirtyRef.current = false;
    setPrinterDirty(false); setInspectionDirty(false); retryRequest.current = null;
  }, [selected]);
  useEffect(() => {
    registerGuard({ hasPending: () => printerDirtyRef.current || inspectionDirtyRef.current || savingRef.current,
      isSaving: () => savingRef.current, discard });
    return () => registerGuard(null);
  }, [registerGuard, discard]);
  useEffect(() => {
    let active = true; liveRef.current = true; const request = ++listRequest.current;
    officialLetters.listPrinters().then(result => {
      if (active && request === listRequest.current) { setPrinters(result.printers); setPrinterCursor(result.nextCursor); }
    }).catch(failure => { if (active && request === listRequest.current) setError(message(failure)); }).finally(() => { if (active && request === listRequest.current) setListLoading(false); });
    return () => { active = false; liveRef.current = false; };
  }, []);

  function changePrinter(update: Partial<PrinterDetails>) {
    setDraft(previous => ({ ...previous, ...update })); printerDirtyRef.current = true; setPrinterDirty(true); setNotice('');
  }
  function changeInspection(update: Partial<InspectionDraft>) {
    if (!inspectionBasisRef.current && selected) {
      const basis = { settingsVersion: savedSettings?.version ?? 0,
        sealWidthMm: typeof savedSettings?.sealWidthMm === 'number' ? savedSettings.sealWidthMm : null,
        sealHeightMm: typeof savedSettings?.sealHeightMm === 'number' ? savedSettings.sealHeightMm : null, printerVersion: selected.version };
      inspectionBasisRef.current = basis; setInspectionBasis(basis);
    }
    setInspection(previous => ({ ...previous, ...update })); inspectionDirtyRef.current = true; setInspectionDirty(true);
    retryRequest.current = null; setNotice('');
  }
  function confirmDiscard(includeInspection: boolean) {
    if (savingRef.current) return false;
    if ((printerDirtyRef.current || (includeInspection && inspectionDirtyRef.current)) &&
      !window.confirm(`저장하지 않은 프린터 등록 정보${includeInspection ? ' 또는 점검 입력' : ''}을 버릴까요?`)) return false;
    return true;
  }
  async function loadHistory(printerId: string, after?: string) {
    const request = ++historyRequest.current; setHistoryLoading(true);
    try {
      const result = await officialLetters.listPrinterInspections(printerId, after ? { after } : {});
      if (!liveRef.current || request !== historyRequest.current) return;
      setInspections(previous => after ? merge(previous, result.inspections) : result.inspections); setInspectionCursor(result.nextCursor);
    } catch (failure) { if (liveRef.current && request === historyRequest.current) setError(message(failure)); }
    finally { if (liveRef.current && request === historyRequest.current) setHistoryLoading(false); }
  }
  async function loadPrinters(after?: string) {
    const request = ++listRequest.current; setListLoading(true); setError('');
    try {
      const result = await officialLetters.listPrinters(after ? { after } : {});
      if (!liveRef.current || request !== listRequest.current) return;
      setPrinters(previous => after ? merge(previous, result.printers) : result.printers); setPrinterCursor(result.nextCursor);
      const current = selectedRef.current;
      const updated = current && result.printers.find(printer => printer.id === current.id);
      if (updated && updated.version >= current.version && !printerDirtyRef.current && !savingRef.current) {
        selectedRef.current = updated; setSelected(updated); setDraft(printerDetails(updated));
      }
    } catch (failure) { if (liveRef.current && request === listRequest.current) setError(message(failure)); }
    finally { if (liveRef.current && request === listRequest.current) setListLoading(false); }
  }
  function choosePrinter(printer: PrinterProfile | null) {
    const changed = selected?.id !== printer?.id;
    if (!confirmDiscard(changed)) return;
    selectedRef.current = printer; setSelected(printer); setDraft(printer ? printerDetails(printer) : emptyPrinter());
    printerDirtyRef.current = false; setPrinterDirty(false); setError(''); setNotice('');
    if (changed) {
      setInspection(emptyInspection()); inspectionDirtyRef.current = false; setInspectionDirty(false); retryRequest.current = null;
      inspectionBasisRef.current = null; setInspectionBasis(null);
      setInspections([]); setInspectionCursor(null); historyRequest.current++; setHistoryLoading(false);
    } else if (printer && inspectionBasisRef.current) {
      if (inspectionBasisRef.current.printerVersion !== printer.version) retryRequest.current = null;
      const basis = { ...inspectionBasisRef.current, printerVersion: printer.version };
      inspectionBasisRef.current = basis; setInspectionBasis(basis);
    }
    if (printer) void loadHistory(printer.id);
  }
  async function savePrinter(event: FormEvent) {
    event.preventDefault(); if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const { printer } = await officialLetters.savePrinter({ name: draft.name.trim(), model: draft.model.trim(), location: draft.location.trim(), active: selected ? draft.active : true }, selected || undefined);
      if (!liveRef.current) return;
      listRequest.current++; setListLoading(false);
      setPrinters(previous => selected ? merge(previous, [printer]) : [printer, ...previous.filter(item => item.id !== printer.id)]);
      selectedRef.current = printer; setSelected(printer); setDraft(printerDetails(printer)); printerDirtyRef.current = false; setPrinterDirty(false);
      setNotice('프린터 등록 정보를 저장했습니다. 점검 입력은 별도로 저장해 주세요.');
      if (!selected) { setInspections([]); setInspectionCursor(null); }
    } catch (failure) { if (liveRef.current) setError(`${message(failure)} 입력은 유지됩니다. 충돌한 경우 목록을 새로고침하고 해당 프린터를 다시 선택하여 최신 정보를 확인해 주세요.`); }
    finally { savingRef.current = false; if (liveRef.current) setSaving(false); }
  }
  async function toggleActive() {
    if (!selected || savingRef.current || printerDirtyRef.current || !window.confirm(selected.active ? '이 프린터를 보관할까요? 새 점검은 추가할 수 없으며 기존 이력은 유지됩니다.' : '이 프린터를 다시 사용 중으로 변경할까요?')) return;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const { printer } = await officialLetters.savePrinter({ ...printerDetails(selected), active: !selected.active }, selected);
      if (!liveRef.current) return;
      listRequest.current++; setListLoading(false);
      setPrinters(previous => merge(previous, [printer])); selectedRef.current = printer; setSelected(printer); setDraft(printerDetails(printer));
      setNotice(printer.active ? '프린터를 사용 중으로 변경했습니다.' : '프린터를 보관했습니다. 기존 점검 이력과 작성 중인 점검 입력은 유지됩니다.');
    } catch (failure) { if (liveRef.current) setError(message(failure)); }
    finally { savingRef.current = false; if (liveRef.current) setSaving(false); }
  }
  async function recordInspection(event: FormEvent) {
    event.preventDefault(); if (savingRef.current) return;
    const basis = inspectionBasisRef.current;
    if (!selected?.active || !templateReady || templatePending || !savedSettings || printerDirtyRef.current || !basis) {
      setError('사용 중인 프린터의 등록 정보와 회사 템플릿·인감 mm를 먼저 저장해 주세요. 점검 입력은 유지됩니다.'); return;
    }
    if (basis.settingsVersion !== savedSettings.version) {
      setError('측정 이후 회사 템플릿이 변경되었습니다. 최신 시험인쇄 PDF로 다시 측정하고 ‘새 점검 입력’에서 기록해 주세요. 이전 입력은 유지됩니다.'); return;
    }
    if (basis.printerVersion !== selected.version) {
      setError('프린터 등록 정보가 변경되었습니다. 목록에서 같은 프린터를 다시 선택하여 최신 정보를 확인해 주세요. 측정값은 유지됩니다.'); return;
    }
    const measured = Object.fromEntries(measurements.map(([key]) => [key, Number(inspection[key])])) as Record<MeasurementKey, number>;
    const toleranceMm = Number(inspection.toleranceMm);
    if (measurements.some(([key]) => !inspection[key] || !isStep(measured[key], 0.1, 200)) || !isStep(toleranceMm, 0.1, 5) ||
      !inspection.actualSizeConfirmed || !inspection.inspectedOn || inspection.inspectedOn > seoulDate()) {
      setError('점검일, 0.1~200mm 실측값, 0.1~5mm 허용 오차와 A4 실제 크기 확인을 입력해 주세요.'); return;
    }
    const payload = { printerId: selected.id, expectedPrinterVersion: basis.printerVersion, expectedSettingsVersion: basis.settingsVersion,
      inspection: { inspectedOn: inspection.inspectedOn, ...measured, toleranceMm, note: inspection.note.trim(),
        printSettings: inspection.printSettings.trim(), actualSizeConfirmed: true as const } };
    const fingerprint = JSON.stringify(payload);
    if (retryRequest.current?.fingerprint !== fingerprint) retryRequest.current = { fingerprint, request: { ...payload, requestId: crypto.randomUUID() } };
    const request = retryRequest.current.request;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const result = await officialLetters.recordPrinterInspection(request);
      if (!liveRef.current) return;
      historyRequest.current++; setHistoryLoading(false);
      setInspections(previous => [result.inspection, ...previous.filter(item => item.id !== result.inspection.id)]);
      inspectionDirtyRef.current = false; setInspectionDirty(false);
      setNotice(`점검을 기록했습니다. 서버 판정: ${resultLabel(result.inspection.result)}. 저장된 점검은 수정하거나 삭제할 수 없습니다.`);
    } catch (failure) { if (liveRef.current) setError(`${message(failure)} 점검 입력은 유지됩니다. 같은 입력으로 재시도하면 중복 기록을 방지합니다. 충돌 시 최신 프린터와 템플릿을 확인해 주세요.`); }
    finally { savingRef.current = false; if (liveRef.current) setSaving(false); }
  }
  const templateChanged = !!inspectionBasis && inspectionBasis.settingsVersion !== (savedSettings?.version ?? 0);
  const printerChanged = !!inspectionBasis && inspectionBasis.printerVersion !== selected?.version;
  const canRecord = Boolean(selected?.active && templateReady && !templatePending && !templateChanged && !printerChanged && inspectionBasis && !printerDirty && !saving && inspectionDirty);

  return <section aria-label="프린터·점검 관리" className="ol-card space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold flex items-center gap-2"><Printer size={22} />프린터·점검 관리</h2>
      <button type="button" className="ol-button" disabled={saving || listLoading} onClick={() => { void loadPrinters(); }}><RefreshCw size={16} />프린터 목록 새로고침</button></div>
    <p className="text-sm text-slate-600">프린터를 등록한 뒤 위의 시험인쇄 PDF를 A4 · 실제 크기(100%)로 출력하고 자로 측정한 값을 기록하세요. 등록 정보와 점검은 회사 템플릿과 각각 따로 저장합니다. 저장한 점검 이력은 수정·삭제할 수 없습니다.</p>
    {(printerDirty || inspectionDirty) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">저장하지 않은 {printerDirty ? '프린터 등록 정보' : ''}{printerDirty && inspectionDirty ? '와 ' : ''}{inspectionDirty ? '점검 입력' : ''}이 있습니다. 이동하기 전에 각각 저장해 주세요.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid xl:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)] gap-5">
      <div className="space-y-3"><button type="button" className="ol-button" disabled={saving} onClick={() => choosePrinter(null)}><Plus size={16} />새 프린터 등록</button>
        <ul aria-label="회사 프린터 목록" className="space-y-2">{printers.map(printer => <li key={printer.id} aria-label={`프린터 ${printer.name}`} className={`border rounded-lg p-3 ${selected?.id === printer.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
          <button type="button" className="text-left w-full space-y-1" disabled={saving} onClick={() => choosePrinter(printer)} aria-label={`${printer.name} 선택`}>
            <span className="font-bold block break-words">{printer.name}</span><span className="text-xs block text-slate-600 break-words">{printer.model || '모델 미입력'} · {printer.location || '위치 미입력'}</span>
            <span className={`text-xs font-semibold ${printer.active ? 'text-emerald-700' : 'text-slate-500'}`}>{printer.active ? '사용 중' : '보관'} · 버전 {printer.version}</span></button></li>)}</ul>
        {!printers.length && <p className="text-sm text-slate-500">{listLoading ? '프린터를 불러오는 중입니다.' : '등록된 프린터가 없습니다.'}</p>}
        {printerCursor && <button type="button" className="ol-button" disabled={saving || listLoading} onClick={() => { void loadPrinters(printerCursor); }}>프린터 더 보기</button>}
      </div>
      <div className="space-y-5">
        <form aria-label="프린터 등록 정보" onSubmit={event => { void savePrinter(event); }} className="rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex flex-wrap justify-between gap-2 items-center"><h3 className="font-bold">{selected ? '선택 프린터 등록 정보' : '새 프린터 등록 정보'}</h3>
            {selected && <button type="button" className="ol-button" disabled={saving || printerDirty} onClick={() => { void toggleActive(); }}>{selected.active ? '프린터 보관' : '프린터 사용 재개'}</button>}</div>
          <fieldset disabled={saving} className="space-y-3">
            <label className="ol-label">프린터 이름<input className="ol-input" required maxLength={100} value={draft.name} onChange={event => changePrinter({ name: event.target.value })} /></label>
            <div className="grid md:grid-cols-2 gap-3"><label className="ol-label">모델<input className="ol-input" maxLength={100} value={draft.model} onChange={event => changePrinter({ model: event.target.value })} /></label>
              <label className="ol-label">설치 위치<input className="ol-input" maxLength={200} value={draft.location} onChange={event => changePrinter({ location: event.target.value })} /></label></div>
            <p className="text-sm text-slate-500">상태: {selected ? selected.active ? '사용 중' : '보관' : '새 프린터는 사용 중으로 등록됩니다.'}{selected && ` · 등록 정보 버전 ${selected.version}`}</p>
            <div className="flex flex-wrap gap-2"><button className="ol-primary" disabled={!printerDirty}>프린터 저장</button>
              <button type="button" className="ol-button" disabled={!printerDirty} onClick={() => { if (confirmDiscard(false)) { setDraft(selected ? printerDetails(selected) : emptyPrinter()); printerDirtyRef.current = false; setPrinterDirty(false); } }}>등록 변경 취소</button></div>
          </fieldset>
        </form>
        {selected && <form aria-label="프린터 인쇄 점검" onSubmit={event => { void recordInspection(event); }} className="rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex flex-wrap justify-between gap-2 items-center"><h3 className="font-bold">{selected.name} · 새 점검 입력</h3>
            <button type="button" className="ol-button" disabled={saving} onClick={() => {
              if (!inspectionDirtyRef.current || window.confirm('저장하지 않은 점검 입력을 버리고 새로 입력할까요?')) { setInspection(emptyInspection()); inspectionDirtyRef.current = false; setInspectionDirty(false); retryRequest.current = null; inspectionBasisRef.current = null; setInspectionBasis(null); }
            }}>새 점검 입력</button></div>
          {!selected.active && <p className="text-sm font-semibold text-amber-800">보관한 프린터는 새 점검을 저장할 수 없습니다. 기존 이력은 계속 확인할 수 있습니다.</p>}
          {(!templateReady || templatePending) && <p className="text-sm font-semibold text-amber-800">점검을 저장하려면 회사 템플릿·로고·인감과 가로·세로 mm를 먼저 저장해 주세요. 이미지 처리·저장 중이거나 미저장 템플릿 변경이 있으면 저장할 수 없습니다. 점검 입력은 유지됩니다.</p>}
          {printerDirty && <p className="text-sm text-amber-800">프린터 등록 정보 변경을 먼저 저장하거나 취소해 주세요.</p>}
          {templateChanged && <p className="text-sm font-semibold text-amber-800">측정 기준 템플릿이 변경되었습니다. 최신 시험인쇄 PDF를 출력한 뒤 ‘새 점검 입력’을 선택하여 다시 측정해 주세요. 이전 입력은 저장하지 않습니다.</p>}
          {printerChanged && <p className="text-sm font-semibold text-amber-800">프린터 등록 정보가 변경되었습니다. 목록에서 같은 프린터를 다시 선택하면 측정값을 유지하며 최신 등록 정보를 적용합니다.</p>}
          {inspectionBasis ? <p className="text-sm text-slate-600">이번 측정 기준 인감: {inspectionBasis.sealWidthMm ?? '미등록'} × {inspectionBasis.sealHeightMm ?? '미등록'} mm · 템플릿 버전 {inspectionBasis.settingsVersion} · 프린터 버전 {inspectionBasis.printerVersion}. 네 오차가 모두 허용 범위이면 서버가 적합으로 판정합니다.</p>
            : templateReady && savedSettings && <p className="text-sm text-slate-600">저장된 인감: {savedSettings.sealWidthMm} × {savedSettings.sealHeightMm} mm · 템플릿 버전 {savedSettings.version}. 입력을 시작하면 이번 측정 기준을 고정합니다.</p>}
          <fieldset disabled={saving} className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3"><label className="ol-label">점검일<input type="date" className="ol-input" required min="1900-01-01" max={seoulDate()} value={inspection.inspectedOn} onChange={event => changeInspection({ inspectedOn: event.target.value })} /></label>
              <label className="ol-label">허용 오차 (mm)<input type="number" className="ol-input" required min={0.1} max={5} step={0.1} value={inspection.toleranceMm} onChange={event => changeInspection({ toleranceMm: event.target.value })} /></label></div>
            <div className="grid md:grid-cols-2 gap-3">{measurements.map(([key, label]) => <label key={key} className="ol-label">{label}<input className="ol-input" type="number" required min={0.1} max={200} step={0.1} value={inspection[key]} onChange={event => changeInspection({ [key]: event.target.value })} /></label>)}</div>
            <label className="ol-label">인쇄 환경<input className="ol-input" maxLength={200} value={inspection.printSettings} onChange={event => changeInspection({ printSettings: event.target.value })} placeholder="예: 드라이버, PDF 뷰어, 용지 및 인쇄 설정" /></label>
            <label className="ol-label">점검 메모<textarea className="ol-input" rows={3} maxLength={1000} value={inspection.note} onChange={event => changeInspection({ note: event.target.value })} /></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={inspection.actualSizeConfirmed} onChange={event => changeInspection({ actualSizeConfirmed: event.target.checked })} className="mt-1" /><span>A4 용지에서 실제 크기(100%)로 출력했습니다</span></label>
            <button className="ol-primary" disabled={!canRecord}>점검 기록 저장</button>
          </fieldset>
        </form>}
      </div>
    </div>
    {selected && <section aria-label="프린터 점검 이력" className="space-y-3 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{selected.name} · 점검 이력</h3>
        <button type="button" className="ol-button" disabled={historyLoading || saving} onClick={() => { setError(''); void loadHistory(selected.id); }}><RefreshCw size={16} />점검 이력 새로고침</button></div>
      <p className="text-xs text-slate-500">기록 당시 프린터와 템플릿 규격을 보관합니다. 현재 등록 정보나 인감 규격이 달라져도 과거 점검 기록은 바뀌지 않습니다.</p>
      <ol className="space-y-3">{inspections.map(record => <li key={record.id} aria-label={`점검 ${record.inspectedOn} ${resultLabel(record.result)}`} className="border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{record.inspectedOn} · {record.printerSnapshot.name}</span><strong className={record.result === 'PASS' ? 'text-emerald-700' : 'text-amber-800'}>{resultLabel(record.result)}</strong></div>
        <p className="text-xs text-slate-500 break-words">{record.printerSnapshot.model || '모델 미입력'} · {record.printerSnapshot.location || '위치 미입력'} · 프린터 버전 {record.printerSnapshot.version} · 템플릿 버전 {record.templateSnapshot.version}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['항목', '기준 (mm)', '실측 (mm)', '오차 (mm)'].map(label => <th key={label} className="p-2 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>
          {([['인감 가로', record.templateSnapshot.sealWidthMm, record.measuredSealWidthMm, record.deviations.sealWidthMm], ['인감 세로', record.templateSnapshot.sealHeightMm, record.measuredSealHeightMm, record.deviations.sealHeightMm], ['100mm 자 가로', 100, record.horizontal100Mm, record.deviations.horizontal100Mm], ['100mm 자 세로', 100, record.vertical100Mm, record.deviations.vertical100Mm]] as const).map(([label, expected, measured, deviation]) => <tr key={label} className="border-t border-slate-100"><td className="p-2 whitespace-nowrap">{label}</td><td className="p-2">{expected.toFixed(1)}</td><td className="p-2">{measured.toFixed(1)}</td><td className="p-2">{deviation.toFixed(1)}</td></tr>)}
        </tbody></table></div>
        <p className="text-sm">허용 오차 ±{record.toleranceMm.toFixed(1)} mm · {record.paperSize} · 실제 크기 {record.scalePercent}% 확인</p>
        {record.printSettings && <p className="text-sm whitespace-pre-wrap break-words">인쇄 환경: {record.printSettings}</p>}
        {record.note && <p className="text-sm whitespace-pre-wrap break-words">메모: {record.note}</p>}
        <p className="text-xs text-slate-500">기록: {record.recordedByName} · {new Date(record.recordedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
      </li>)}</ol>
      {!inspections.length && <p className="text-sm text-slate-500">{historyLoading ? '점검 이력을 불러오는 중입니다.' : '저장된 점검 이력이 없습니다.'}</p>}
      {inspectionCursor && <button type="button" className="ol-button" disabled={historyLoading || saving} onClick={() => { setError(''); void loadHistory(selected.id, inspectionCursor); }}>점검 이력 더 보기</button>}
    </section>}
  </section>;
}
