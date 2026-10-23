import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export interface OfficialNotification {
  companyId: string;
  recipientId: string;
  recipientRole: 'ADMIN' | 'SUB_ADMIN' | 'MEMBER';
  letterId: string;
  revision: number;
  event: string;
  title: string;
  status: 'DRAFT' | 'PENDING' | 'REJECTED' | 'ISSUED';
  requiresAction: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SnapshotResult<T> { value: T; fromCache: boolean }

// The server owns every notification field, including readAt. The browser only
// subscribes to its own company's inbox and acknowledges through the callable.
export function subscribeOfficialNotifications(
  uid: string,
  companyId: string,
  recipientRole: OfficialNotification['recipientRole'],
  onItems: (result: SnapshotResult<OfficialNotification[]>) => void,
  onUnread: (result: SnapshotResult<number>) => void,
  onError: (source: 'items' | 'unread', error: FirestoreError) => void,
): () => void {
  const inbox = collection(db, 'officialLetterNotifications', uid, 'items');
  const scope = [where('companyId', '==', companyId), where('recipientId', '==', uid), where('recipientRole', '==', recipientRole)];
  const stopItems = onSnapshot(
    query(inbox, ...scope, orderBy('updatedAt', 'desc'), limit(20)),
    { includeMetadataChanges: true },
    snapshot => onItems({
      value: snapshot.docs.map(document => ({ ...document.data(), letterId: document.id }) as OfficialNotification),
      fromCache: snapshot.metadata.fromCache,
    }),
    error => onError('items', error),
  );
  const stopUnread = onSnapshot(
    query(inbox, ...scope, where('readAt', '==', null), limit(100)),
    { includeMetadataChanges: true },
    snapshot => onUnread({ value: snapshot.size, fromCache: snapshot.metadata.fromCache }),
    error => onError('unread', error),
  );
  return () => { stopItems(); stopUnread(); };
}

const manage = httpsCallable<Record<string, unknown>, { success: boolean }>(functions, 'manageOfficialLetters');

export async function acknowledgeOfficialNotification(notification: Pick<OfficialNotification, 'letterId' | 'updatedAt'>): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(notification.letterId)) throw new Error('invalid-notification');
  await manage({ action: 'ackNotification', id: notification.letterId, expectedUpdatedAt: notification.updatedAt });
}

export function officialNotificationError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.endsWith('permission-denied') || code.endsWith('not-found')) {
    return '공문 접근 권한이 변경되었거나 알림이 삭제되었습니다. 새로고침 후 다시 확인해 주세요.';
  }
  if (code.endsWith('aborted')) return '공문 알림이 변경되었습니다. 최신 알림을 다시 확인해 주세요.';
  if (code.endsWith('unauthenticated')) return '로그인 상태를 확인한 후 다시 시도해 주세요.';
  if (code.endsWith('unavailable') || code.endsWith('deadline-exceeded')) {
    return '알림 서버에 연결하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.';
  }
  return '공문 알림을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
