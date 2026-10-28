import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { downloadDraftingAttachment } from '../services/attachmentService';
import type { DraftingAttachment } from '../services/officialLetterService';

const draftingFileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)}KB` : `${(size / (1024 * 1024)).toFixed(1)}MB`;

interface Props {
  documentId: string; revision: number; files: DraftingAttachment[]; historyId?: string;
  disabled?: boolean; isCurrent: () => boolean;
}
export function DraftingAttachments({ documentId, revision, files, historyId, disabled, isCurrent }: Props) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const active = useRef(true); const requests = useRef(new Set<AbortController>()); const urls = useRef(new Set<string>());
  useEffect(() => {
    active.current = true; const pending = requests.current; const objects = urls.current;
    return () => { active.current = false; for (const request of pending) request.abort(); for (const url of objects) URL.revokeObjectURL(url); };
  }, []);
  async function open(file: DraftingAttachment, download: boolean) {
    if (disabled || busy || !isCurrent()) return;
    const viewer = download ? null : window.open('about:blank', '_blank');
    if (viewer) viewer.opener = null;
    const controller = new AbortController(); requests.current.add(controller); setBusy(file.id); setError('');
    try {
      const result = await downloadDraftingAttachment({ documentId, revision, attachmentId: file.id, historyId }, controller.signal);
      if (!active.current || !isCurrent()) { viewer?.close(); return; }
      const url = URL.createObjectURL(result.blob); urls.current.add(url);
      if (viewer) viewer.location.replace(url);
      else { const link = document.createElement('a'); link.href = url; link.download = result.name || file.name; document.body.appendChild(link); link.click(); link.remove(); }
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60000);
    } catch (failure) { viewer?.close(); if (active.current && isCurrent()) setError(failure instanceof Error ? failure.message : '첨부자료를 열지 못했습니다.'); }
    finally { requests.current.delete(controller); if (active.current) setBusy(''); }
  }
  return <div className="space-y-2" aria-label={historyId ? '이전 개정 첨부자료' : '저장된 첨부자료'}>
    {files.map(file => <div key={file.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <FileText size={18} className="shrink-0 text-indigo-600" /><span className="min-w-0 flex-1 break-all"><strong>{file.name}</strong><span className="ml-2 text-xs text-slate-500">{draftingFileSize(file.size)}</span></span>
      <button type="button" disabled={disabled || !!busy} className="ol-button" onClick={() => void open(file, false)}>{busy === file.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}보기</button>
      <button type="button" disabled={disabled || !!busy} className="ol-button" onClick={() => void open(file, true)}><Download size={14} />다운로드</button>
    </div>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
