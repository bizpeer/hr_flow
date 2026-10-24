const { HttpsError } = require('firebase-functions/v2/https');

const fail = (code, message) => { throw new HttpsError(code, message); };
const read = (db, reader, ref) => reader === db ? ref.get() : reader.get(ref);
function milliseconds(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === 'string' ? Date.parse(value) : NaN;
}
// Used only by the one-time migration, never as an authorization fallback.
function legacyAccessUntil(company) {
  const trial = milliseconds(company.createdAt) + 90 * 86400000;
  const paid = milliseconds(company.subscriptionEndDate);
  return new Date(Math.max(Number.isFinite(trial) ? trial : 0, Number.isFinite(paid) ? paid : 0));
}
function recentAuthentication(request, now = () => new Date()) {
  const time = request.auth?.token?.auth_time;
  if (typeof time !== 'number' || time > now().getTime() / 1000 + 30 || now().getTime() / 1000 - time > 300) {
    fail('failed-precondition', '보안 확인을 위해 다시 로그인해 주세요.');
  }
}
async function authorizeContext({ db, request, reader = db, now = () => new Date(),
  roles = ['ADMIN', 'SUB_ADMIN', 'MEMBER'], allowPendingPassword = false, allowExpired = false }) {
  if (!request.auth?.uid) fail('unauthenticated', '로그인이 필요합니다.');
  const snapshot = await read(db, reader, db.collection('UserProfile').doc(request.auth.uid));
  const profile = snapshot.data();
  if (!snapshot.exists || !roles.includes(profile.role) || (profile.status || 'ACTIVE') !== 'ACTIVE') {
    fail('permission-denied', '활성 계정의 권한이 필요합니다.');
  }
  if (profile.sessionValidAfter && (!request.auth.token?.auth_time || request.auth.token.auth_time < profile.sessionValidAfter)) {
    fail('unauthenticated', '비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
  }
  if (!allowPendingPassword && profile.mustChangePassword === true) {
    fail('failed-precondition', '최초 비밀번호를 변경한 후 이용해 주세요.');
  }
  if (profile.role === 'SUPER_ADMIN' && profile.companyId === 'PLATFORM') {
    return { ...profile, uid: request.auth.uid, company: null };
  }
  if (typeof profile.companyId !== 'string' || !profile.companyId || profile.companyId === 'PLATFORM' || profile.companyId.includes('/')) {
    fail('permission-denied', '소속 회사 정보가 필요합니다.');
  }
  const companySnap = await read(db, reader, db.collection('companies').doc(profile.companyId));
  const company = companySnap.data();
  if (!companySnap.exists || company.status !== 'ACTIVE') fail('permission-denied', '이용 가능한 회사의 계정이 필요합니다.');
  if (!allowExpired && (!company.accessUntil || typeof company.accessUntil.toMillis !== 'function' || company.accessUntil.toMillis() <= now().getTime())) {
    fail('permission-denied', '회사 구독 기간이 만료되었습니다. 관리자에게 문의해 주세요.');
  }
  return { ...profile, uid: request.auth.uid, company };
}
module.exports = { authorizeContext, recentAuthentication, legacyAccessUntil, milliseconds, fail, read };
