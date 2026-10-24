const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { migrateTenantSecurity } = require('../../scripts/migrate-tenant-security.cjs');

test('migration preserves records/media, reserves orphan IDs and revokes legacy links idempotently', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const app = initializeApp({ projectId: 'demo-security-migration' }, 'security-migration-test');
  const db = getFirestore(app), now = () => new Date('2026-10-24T01:00:00Z');
  const fetchOriginal = global.fetch;
  try {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-security-migration/databases/(default)/documents`, { method: 'DELETE' });
    await db.doc('companies/a').set({ status: 'ACTIVE', adminUid: 'legacy-owner', createdAt: '2026-10-01T00:00:00Z', domain: 'fixture.example' });
    await db.doc('UserProfile/member').set({ companyId: 'a', teamId: 't', divisionId: 'd' });
    const path = 'companies/a/expenses/member/fixture.pdf';
    const bucketName = 'fixture.test';
    const legacy = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=synthetic-token`;
    await db.doc('expenses/e').set({ companyId: 'a', userId: 'member', status: 'PENDING', teamId: 't', divisionId: 'd', attachmentUrl: legacy, amount: 123 });
    await db.doc('officialLetterSettings/orphan').set({ companyId: 'orphan', representative: 'Synthetic preserved representative' });
    await db.doc('officialLetterPrinters/orphan/printers/p/inspections/i').set({ companyId: 'orphan', measuredSealWidthMm: 23.3 });
    await db.doc('notices/invalid').set({ companyId: 'a', attachmentUrl: 'https://other.example/private' });
    await db.doc('attendance/removed-staff').set({ companyId: 'a', userId: 'old-member' });
    await db.doc('attendance/incomplete-owner').set({ companyId: 'a', userId: 'legacy-owner' });
    let disabled = false, revoked = false;
    const auth = { getUser: async uid => { assert.equal(uid, 'old-member'); return { disabled }; },
      updateUser: async (uid, value) => { assert.equal(uid, 'old-member'); assert.equal(value.disabled, true); disabled = true; },
      revokeRefreshTokens: async uid => { assert.equal(uid, 'old-member'); revoked = true; } };
    let token = 'synthetic-token', setCalls = 0, contents = Buffer.from('%PDF- preserved synthetic file');
    const bucket = { name: bucketName, getFiles: async () => [[{ name: path,
      getMetadata: async () => [{ metageneration: '1', metadata: token ? { firebaseStorageDownloadTokens: token } : {} }],
      setMetadata: async value => { assert.equal(value.metadata.firebaseStorageDownloadTokens, null); token = ''; setCalls++; },
    }]] };
    const plan = await migrateTenantSecurity({ db, bucket, auth, now });
    assert.equal(plan.mode, 'plan'); assert.equal(plan.entitlements, 1); assert.equal(plan.orphanReservations, 1);
    assert.equal(plan.pendingRouteMismatches, 0); assert.equal(plan.invalidAttachmentReferences, 1); assert.equal(setCalls, 0);
    assert.equal(plan.orphanAuthAccounts, 1); assert.equal(disabled, false);
    assert.equal((await db.doc('tenantRegistry/a').get()).exists, false);
    global.fetch = async url => { assert.equal(new URL(url).hostname, 'firebasestorage.googleapis.com'); return { status: 403, body: { cancel: async () => {} } }; };
    const applied = await migrateTenantSecurity({ db, bucket, auth, now, apply: true });
    assert.equal(applied.revoked, 1); assert.equal(applied.oldUrlsDenied, 1); assert.equal(applied.urlsRemoved, 1);
    assert.equal(applied.orphanAuthAccountsDisabled, 1); assert.equal(revoked, true);
    const expense = (await db.doc('expenses/e').get()).data();
    assert.equal(expense.amount, 123); assert.equal(expense.attachmentPath, path); assert.equal(expense.attachmentUrl, undefined);
    assert.equal((await db.doc('tenantRegistry/orphan').get()).data().status, 'DELETED');
    assert.equal((await db.doc('officialLetterSettings/orphan').get()).data().representative, 'Synthetic preserved representative');
    assert.equal((await db.doc('companies/a').get()).data().accessUntil.toDate().toISOString(), '2026-12-30T00:00:00.000Z');
    const second = await migrateTenantSecurity({ db, bucket, auth, now, apply: true });
    assert.equal(second.entitlements, 0); assert.equal(second.reservations, 0); assert.equal(second.revoked, 0); assert.equal(setCalls, 1);
    assert.equal(contents.toString(), '%PDF- preserved synthetic file');
  } finally { global.fetch = fetchOriginal; await db.terminate(); await deleteApp(app); }
});
