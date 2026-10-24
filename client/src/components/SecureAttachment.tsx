import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { attachmentSessionKey, downloadCompanyAttachment } from '../services/attachmentService';
import type { AttachmentCategory } from '../services/attachmentService';

interface Props { category: AttachmentCategory; documentId: string; name?: string; preview?: boolean; version?: string }
function Attachment({ category, documentId, name, preview = false }: Props) {
  const alive = useRef(true);
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urls = useRef(new Set<string>());
  const actions = useRef(new Set<AbortController>());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    alive.current = true;
    const pending = actions.current; const objects = urls.current;
    return () => {
      alive.current = false;
      for (const controller of pending) controller.abort();
      for (const url of objects) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!preview) return;
    let active = true;
    const controller = new AbortController();
    let url = '';
    void downloadCompanyAttachment(category, documentId, controller.signal).then(result => {
      if (!active) return;
      if (result.blob.type.startsWith('image/')) { url = URL.createObjectURL(result.blob); setImage(url); }
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : '첨부파일을 불러오지 못했습니다.'); });
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [category, documentId, preview, attempt]);
  async function open(download: boolean) {
    const viewer = download ? null : window.open('about:blank', '_blank');
    const controller = new AbortController(); actions.current.add(controller);
    setBusy(true); setError('');
    try {
      const result = await downloadCompanyAttachment(category, documentId, controller.signal);
      if (!alive.current) { viewer?.close(); return; }
      const url = URL.createObjectURL(result.blob); urls.current.add(url);
      if (viewer) { viewer.opener = null; viewer.location.replace(url); }
      else {
        const link = document.createElement('a'); link.href = url; link.download = result.name || name || '첨부파일';
        document.body.appendChild(link); link.click(); link.remove();
      }
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60000);
    } catch (failure) { viewer?.close(); if (alive.current) setError(failure instanceof Error ? failure.message : '첨부파일을 열지 못했습니다.'); }
    finally { actions.current.delete(controller); if (alive.current) setBusy(false); }
  }
  return <div className="space-y-3" onClick={event => event.stopPropagation()} aria-label="보안 첨부파일">
    {image && <button type="button" disabled={busy} onClick={() => { void open(false); }} className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50" aria-label="첨부 이미지 크게 보기"><img src={image} alt={name || '첨부 이미지'} className="max-h-64 w-full object-contain" /></button>}
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <FileText size={20} className="shrink-0 text-indigo-500" /><span className="min-w-0 flex-1 break-all text-xs font-bold text-slate-700">{name || '첨부파일'}</span>
      <button type="button" disabled={busy} onClick={() => { void open(false); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}보기</button>
      <button type="button" disabled={busy} onClick={() => { void open(true); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Download size={14} />다운로드</button>
    </div>
    {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}{preview && <button type="button" className="ml-2 underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>미리보기 다시 시도</button>}</div>}
  </div>;
}
export function SecureAttachment(props: Props) {
  const profile = useAuthStore(state => state.userData);
  return <Attachment key={`${attachmentSessionKey()}:${profile?.divisionId || ''}:${props.category}:${props.documentId}:${props.version || ''}`} {...props} />;
}
