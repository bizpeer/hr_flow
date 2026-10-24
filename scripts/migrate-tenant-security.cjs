// Run with an Admin SDK client supplied by the deployment environment. The
// default is a read-only plan; mutation requires apply: true. No PII or tokens
// are returned or logged. Existing documents and media are preserved.
const { createHash } = require('node:crypto');
const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { Timestamp, FieldValue } = requireFunctions('firebase-admin/firestore');
const { legacyAccessUntil, milliseconds } = require('../functions/security-context');
const { legacyAttachmentPath } = require('../functions/attachment-service');

async function migrateTenantSecurity({ db, bucket, auth, apply = false, scope = 'all', now = () => new Date() }) {
  if (!['all', 'backfill'].includes(scope)) throw new Error('Invalid migration scope');
  const report = { mode: apply ? 'apply' : 'plan', scope, companies: 0, entitlements: 0, reservations: 0, orphanReservations: 0,
    attachments: 0, urlsRemoved: 0, tokenObjects: 0, revoked: 0, oldUrlsDenied: 0, invalidAttachmentReferences: 0, pendingRouteMismatches: 0,
    cappedTrialDates: 0, domainConflicts: 0, tenantSubjectMismatches: 0, missingHistoricalSubjects: 0,
    orphanAuthAccounts: 0, orphanAuthAccountsDisabled: 0 };
  const companies = await db.collection('companies').get(), ids = new Set(companies.docs.map(d => d.id));
  const states = new Map(companies.docs.map(d => [d.id, d.data().status]));
  const reserved = new Set();
  async function reserve(companyId) {
    if (!companyId || companyId === 'PLATFORM' || typeof companyId !== 'string' || companyId.includes('/') || reserved.has(companyId)) return;
    reserved.add(companyId);
    const ref = db.collection('tenantRegistry').doc(companyId), existing = await ref.get();
    if (!existing.exists) {
      report.reservations++;
      if (!ids.has(companyId)) report.orphanReservations++;
      if (apply) await ref.create({ status: ids.has(companyId) ? (['ACTIVE', 'SUSPENDED'].includes(states.get(companyId)) ? 'ACTIVE' : states.get(companyId)) : 'DELETED', reservedAt: now().toISOString(), migration: 'tenant-security-v1' });
    }
  }
  for (const doc of companies.docs) {
    report.companies++;
    await reserve(doc.id);
    const data = doc.data();
    if (!data.accessUntil?.toMillis) {
      report.entitlements++;
      const declaredStart = milliseconds(data.createdAt), serverStart = doc.createTime.toMillis();
      const start = Number.isFinite(declaredStart) ? Math.min(declaredStart, serverStart) : serverStart;
      if (!Number.isFinite(declaredStart) || declaredStart > serverStart) report.cappedTrialDates++;
      if (apply) await doc.ref.update({ accessUntil: Timestamp.fromDate(legacyAccessUntil({ ...data, createdAt: new Date(start).toISOString() })) });
    }
    if (typeof data.domain === 'string' && data.domain) {
      const ref = db.collection('companyDomains').doc(createHash('sha256').update(data.domain.trim().toLowerCase()).digest('hex'));
      const existing = await ref.get();
      if (existing.exists && existing.data().companyId !== doc.id) report.domainConflicts++;
      if (!existing.exists && apply) await ref.create({ companyId: doc.id, createdAt: now().toISOString() });
    }
  }
  // Reserve every existing tenant ID, including data left by older deletion code.
  for (const collection of await db.listCollections()) {
    if (['tenantRegistry', 'companyDomains', 'system_config'].includes(collection.id)) continue;
    const data = await collection.select('companyId').get();
    for (const doc of data.docs) await reserve(doc.data().companyId);
  }
  for (const name of ['officialLetterSettings', 'officialLetterPrinters']) {
    for (const ref of await db.collection(name).listDocuments()) await reserve(ref.id);
  }
  // Old rows may predate immutable tenant fields. Report potential corruption,
  // while retaining legitimate history of removed or transferred employees.
  const subjects = new Map();
  for (const category of ['attendance', 'payroll_records', 'expenses', 'leaves']) {
    const records = await db.collection(category).select('companyId', 'userId').get();
    for (const record of records.docs) {
      const data = record.data();
      if (typeof data.userId !== 'string' || !data.userId || data.userId.includes('/')) continue;
      if (!subjects.has(data.userId)) subjects.set(data.userId, (await db.collection('UserProfile').doc(data.userId).get()).data());
      const subject = subjects.get(data.userId);
      if (!subject) report.missingHistoricalSubjects++;
      else if (subject.companyId !== data.companyId) report.tenantSubjectMismatches++;
    }
  }
  if (auth) {
    const companyOwners = new Set(companies.docs.map(doc => doc.data().adminUid));
    for (const [uid, profile] of subjects) {
      if (profile || companyOwners.has(uid)) continue;
      // Historical ownership plus a missing profile identifies a removed staff
      // account. Never disable an incomplete company-owner enrollment.
      if ((await db.collection('UserProfile').doc(uid).get()).exists) continue;
      try {
        const account = await auth.getUser(uid);
        if (account.disabled) continue;
        report.orphanAuthAccounts++;
        if (apply && scope === 'all') {
          await auth.updateUser(uid, { disabled: true });
          await auth.revokeRefreshTokens(uid);
          report.orphanAuthAccountsDisabled++;
        }
      } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    }
  }
  for (const category of ['expenses', 'leaves', 'notices']) {
    const records = await db.collection(category).get();
    for (const record of records.docs) {
      const data = record.data();
      if (data.status === 'PENDING' && category !== 'notices') {
        const owner = typeof data.userId === 'string' && data.userId ? (await db.collection('UserProfile').doc(data.userId).get()).data() : null;
        if (!owner || owner.companyId !== data.companyId || (data.teamId || '') !== (owner.teamId || '') || (data.divisionId || '') !== (owner.divisionId || '')) report.pendingRouteMismatches++;
      }
      if (!data.attachmentUrl) continue;
      const path = legacyAttachmentPath(data.attachmentUrl, bucket.name);
      const prefix = `companies/${data.companyId}/${category}/${category === 'notices' ? '' : `${data.userId}/`}`;
      if (!path || !path.startsWith(prefix) || path.includes('..') || /[\u0000-\u001f\\]/.test(path)) { report.invalidAttachmentReferences++; continue; }
      report.attachments++;
      if (apply && scope === 'all') {
        await record.ref.update({ attachmentPath: path, attachmentUrl: FieldValue.delete() });
        report.urlsRemoved++;
      }
    }
  }
  const [files] = await bucket.getFiles({ prefix: 'companies/' });
  for (const file of files) {
    await reserve(file.name.split('/')[1]);
    const [metadata] = await file.getMetadata();
    const tokens = metadata.metadata?.firebaseStorageDownloadTokens;
    if (!tokens) continue;
    report.tokenObjects++;
    if (!apply || scope !== 'all') continue;
    await file.setMetadata({ cacheControl: 'private, no-store', metadata: { firebaseStorageDownloadTokens: null } }, { ifMetagenerationMatch: metadata.metageneration });
    const [next] = await file.getMetadata();
    if (next.metadata?.firebaseStorageDownloadTokens) throw new Error('Token revocation incomplete');
    report.revoked++;
    // Check the old bearer link without consuming or saving file contents.
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${encodeURIComponent(String(tokens).split(',')[0])}`;
    const response = await fetch(url, { cache: 'no-store' });
    await response.body?.cancel();
    if (![401, 403, 404].includes(response.status)) throw new Error('Old attachment link is still accessible');
    report.oldUrlsDenied++;
  }
  return report;
}
module.exports = { migrateTenantSecurity };
