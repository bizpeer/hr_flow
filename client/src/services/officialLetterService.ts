import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface LetterContent {
  recipient: string;
  reference: string;
  title: string;
  body: string;
  attachments: string;
}
export interface ApprovalStep { uid: string; name: string; approvedAt: string | null }
export interface LetterSettings {
  companyName: string;
  address: string;
  representative: string;
  phone: string;
  email: string;
  logoData: string;
  sealData: string;
  logoPath?: string;
  sealPath?: string;
  lastFront: number;
  lastSerial: number;
  version: number;
}
export interface OfficialLetter {
  id: string;
  companyId: string;
  creatorId: string;
  creatorName: string;
  content: LetterContent;
  approvalLine: ApprovalStep[];
  participantIds: string[];
  revision: number;
  status: 'DRAFT' | 'PENDING' | 'REJECTED' | 'ISSUED';
  everIssued: boolean;
  number?: string;
  issueDate?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  updatedAt: string;
  branding?: Pick<LetterSettings, 'companyName' | 'address' | 'representative' | 'phone' | 'email'> & { logoData?: string; sealData?: string };
}
export interface LetterSummary {
  id: string;
  title: string;
  recipient: string;
  creatorName: string;
  status: OfficialLetter['status'];
  revision: number;
  number: string;
  updatedAt: string;
}
export interface LetterHistory extends OfficialLetter { historyId: string; archivedAt: string; archivedBy: string }

const callable = httpsCallable<Record<string, unknown>, unknown>(functions, 'manageOfficialLetters');
async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await callable({ action, ...payload });
  return response.data as T;
}
export const officialLetters = {
  bootstrap: () => call<{ settings: LetterSettings | null; companyName: string; approvalLine: ApprovalStep[] }>('bootstrap'),
  list: () => call<{ letters: LetterSummary[] }>('list'),
  get: (id: string) => call<{ letter: OfficialLetter }>('get', { id }),
  saveSettings: (settings: LetterSettings) => call('saveSettings', { settings, expectedVersion: settings.version }),
  save: (content: LetterContent, letter: OfficialLetter | null) => call<{ id: string }>('save', {
    content, ...(letter ? { id: letter.id, revision: letter.revision } : {}),
  }),
  submit: (letter: OfficialLetter) => call('submit', { id: letter.id, revision: letter.revision }),
  review: (letter: OfficialLetter, decision: 'approve' | 'reject', options: { reason?: string; front?: number; serial?: number; issueDate?: string } = {}) =>
    call('review', { id: letter.id, revision: letter.revision, decision, ...options }),
  pdf: (letter: OfficialLetter) => call<{ base64: string; filename: string }>('pdf', { id: letter.id, revision: letter.revision }),
  history: (letter: OfficialLetter) => call<{ history: LetterHistory[] }>('history', { id: letter.id }),
  deleteHistory: (letter: OfficialLetter, historyId: string) => call('deleteHistory', { id: letter.id, revision: letter.revision, historyId }),
};

export function seoulDate(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}
export function koreanDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
export function previewNumber(front: number, date: string, serial: number): string {
  return `${String(front).padStart(3, '0')}-${date.replaceAll('-', '').slice(2)}-${String(serial).padStart(3, '0')}`;
}
export async function readLetterImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 300 * 1024) {
    throw new Error('300KB 이하 PNG 또는 JPEG 이미지를 선택해 주세요.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}
