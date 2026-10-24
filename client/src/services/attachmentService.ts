import { auth, functions } from '../firebase';
import { useAuthStore } from '../store/authStore';

export type AttachmentCategory = 'expenses' | 'leaves' | 'notices';
export interface PrivateAttachment { path: string; name: string }
export interface AttachmentDownload { blob: Blob; name: string }
const maxBytes = 10 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export function attachmentSessionKey(): string {
  const profile = useAuthStore.getState().userData;
  return JSON.stringify([auth.currentUser?.uid, profile?.uid, profile?.companyId, profile?.role,
    profile?.divisionId, profile?.status, profile?.mustChangePassword]);
}
function filename(value: string): string {
  return Array.from(value.replace(/[\\/]/g, '_')).map(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character).join('').slice(0, 240) || '첨부파일';
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
