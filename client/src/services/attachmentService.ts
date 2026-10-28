import { auth, functions } from '../firebase';
import { useAuthStore } from '../store/authStore';
import type { DraftingAttachment } from './officialLetterService';

export type AttachmentCategory = 'expenses' | 'leaves' | 'notices';
export interface PrivateAttachment { path: string; name: string }
export interface AttachmentDownload { blob: Blob; name: string }
const maxBytes = 10 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateDraftingFile(file: File): void {
  if (!file.size || file.size > maxBytes || !allowedTypes.includes(file.type)) throw new Error('10MB 이하 PNG, JPEG, WebP, GIF 또는 PDF 파일을 선택해 주세요.');
  const extensions: Record<string, string[]> = { 'application/pdf': ['pdf'], 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/gif': ['gif'] };
  if (!extensions[file.type]?.includes(file.name.toLowerCase().split('.').at(-1) || '')) throw new Error('파일 확장자와 형식이 일치하는 PDF 또는 이미지 파일을 선택해 주세요.');
}

export function attachmentSessionKey(): string {
  const profile = useAuthStore.getState().userData;
  return JSON.stringify([auth.currentUser?.uid, profile?.uid, profile?.companyId, profile?.role,
    profile?.divisionId, profile?.status, profile?.mustChangePassword]);
}
function filename(value: string): string {
  const characters = Array.from(value.replace(/[\\/]/g, '_')).map(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character);
  if (!characters.length) return '첨부파일';
  if (characters.length <= 240) return characters.join('');
  const suffix = /\.(?:pdf|png|jpe?g|webp|gif)$/i.exec(characters.join(''))?.[0] || '';
  return characters.slice(0, 240 - Array.from(suffix).length).join('') + suffix;
}
async function request<T>(endpoint: string, query: URLSearchParams, init: RequestInit, read: (response: Response) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const user = auth.currentUser;
  const profile = useAuthStore.getState().userData;
  if (!user || profile?.uid !== user.uid) throw new Error('로그인 상태를 확인해 주세요.');
  const scope = attachmentSessionKey();
  const projectId = functions.app.options.projectId;
  if (!projectId || !/^[a-z0-9-]+$/.test(projectId)) throw new Error('첨부파일 서비스 설정을 확인해 주세요.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(cancel, 60000);
  try {
    const token = await user.getIdToken();
    if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
    const response = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/${endpoint}?${query}`, {
      ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('첨부파일 접근 권한 또는 계정 상태가 변경되었습니다. 다시 로그인한 후 확인해 주세요.');
      if (response.status === 413) throw new Error('첨부파일은 10MB 이하여야 합니다.');
      if (response.status === 404) throw new Error('첨부파일이나 신청 기록을 찾을 수 없습니다.');
      throw new Error('첨부파일을 처리하지 못했습니다. 파일 형식과 네트워크 상태를 확인하고 다시 시도해 주세요.');
    }
    const result = await read(response);
    if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
    return result;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('첨부파일 처리 시간이 초과되었습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
    throw error;
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

export async function uploadCompanyAttachment(category: AttachmentCategory, file: File, signal?: AbortSignal): Promise<PrivateAttachment> {
  if (!file.size || file.size > maxBytes || !allowedTypes.includes(file.type)) throw new Error('10MB 이하 PNG, JPEG, WebP, GIF 또는 PDF 파일을 선택해 주세요.');
  const scope = attachmentSessionKey();
  const companyId = useAuthStore.getState().userData?.companyId;
  const data = await request('uploadCompanyAttachment', new URLSearchParams({ category }), {
    method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file,
  }, response => response.json() as Promise<PrivateAttachment>, signal);
  if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
  if (typeof data.path !== 'string' || !data.path.startsWith(`companies/${companyId}/${category}/`) || data.path.includes('..') || typeof data.name !== 'string') {
    throw new Error('첨부파일 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
  }
  return { path: data.path, name: filename(data.name) };
}

export async function downloadCompanyAttachment(category: AttachmentCategory, documentId: string, signal?: AbortSignal): Promise<AttachmentDownload> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(documentId)) throw new Error('신청 기록을 다시 선택해 주세요.');
  const scope = attachmentSessionKey();
  const { blob, disposition } = await request('downloadCompanyAttachment', new URLSearchParams({ category, documentId }), { method: 'GET' }, async response => {
    if (Number(response.headers.get('Content-Length') || 0) > maxBytes) throw new Error('첨부파일은 10MB 이하여야 합니다.');
    return { blob: await response.blob(), disposition: response.headers.get('Content-Disposition') || '' };
  }, signal);
  if (scope !== attachmentSessionKey()) throw new Error('로그인 또는 소속 정보가 변경되었습니다. 다시 시도해 주세요.');
  if (!blob.size || blob.size > maxBytes || !allowedTypes.includes(blob.type.split(';')[0])) throw new Error('첨부파일의 형식 또는 크기를 확인하지 못했습니다.');
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  let name = plain || '첨부파일';
  if (encoded) { try { name = decodeURIComponent(encoded); } catch { /* Keep the safe fallback. */ } }
  return { blob, name: filename(name) };
}

export async function uploadDraftingAttachment(file: File, context: { requestId?: string; documentId?: string; revision?: number }, signal?: AbortSignal): Promise<DraftingAttachment> {
  validateDraftingFile(file);
  const query = new URLSearchParams({ category: 'drafting' });
  if (context.documentId) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(context.documentId) || !Number.isInteger(context.revision) || Number(context.revision) < 1) throw new Error('첨부할 기안서의 최신 개정을 확인해 주세요.');
    query.set('documentId', context.documentId); query.set('revision', String(context.revision));
  } else {
    if (!uuid.test(context.requestId || '')) throw new Error('새 기안서의 생성 요청을 확인해 주세요.');
    query.set('requestId', context.requestId!);
  }
  const data = await request('uploadCompanyAttachment', query, {
    method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file,
  }, response => response.json() as Promise<DraftingAttachment>, signal);
  if (!uuid.test(data.id) || typeof data.name !== 'string' || !allowedTypes.includes(data.contentType) || data.contentType !== file.type || data.size !== file.size) throw new Error('첨부자료 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
  return { id: data.id, name: filename(data.name), contentType: data.contentType, size: data.size };
}

export async function downloadDraftingAttachment(input: { documentId: string; revision: number; attachmentId: string; historyId?: string }, signal?: AbortSignal): Promise<AttachmentDownload> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.documentId) || !Number.isInteger(input.revision) || input.revision < 1 || !uuid.test(input.attachmentId) || input.historyId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.historyId)) throw new Error('기안서와 첨부자료를 다시 선택해 주세요.');
  const query = new URLSearchParams({ category: 'drafting', documentId: input.documentId, revision: String(input.revision), attachmentId: input.attachmentId });
  if (input.historyId) query.set('historyId', input.historyId);
  const { blob, disposition } = await request('downloadCompanyAttachment', query, { method: 'GET' }, async response => {
    if (Number(response.headers.get('Content-Length') || 0) > maxBytes) throw new Error('첨부자료는 10MB 이하여야 합니다.');
    return { blob: await response.blob(), disposition: response.headers.get('Content-Disposition') || '' };
  }, signal);
  if (!blob.size || blob.size > maxBytes || !allowedTypes.includes(blob.type.split(';')[0])) throw new Error('첨부자료의 형식 또는 크기를 확인하지 못했습니다.');
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let name = /filename="([^"]+)"/i.exec(disposition)?.[1] || '첨부자료';
  if (encoded) { try { name = decodeURIComponent(encoded); } catch { /* Keep a safe fallback. */ } }
  return { blob, name: filename(name) };
}
