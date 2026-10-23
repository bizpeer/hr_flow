const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createOfficialLetterService, koreaDate, numberLabel } = require('../official-letter-service');
const { renderOfficialLetterPdf } = require('../official-letter-pdf');
const fs = require('node:fs');
const path = require('node:path');

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('A loopback FIRESTORE_EMULATOR_HOST is required; production tests are prohibited.');
}
const app = initializeApp({ projectId: 'demo-hr-flow-letters' }, 'official-letters-test');
const db = getFirestore(app);
const files = new Map();
const bucket = { file: name => ({
  save: async bytes => { files.set(name, bytes); },
  download: async () => { if (!files.has(name)) throw new Error('missing asset'); return [files.get(name)]; },
}) };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const now = () => new Date('2026-10-22T15:10:00.000Z');
let renderCount = 0;
const manage = createOfficialLetterService({ db, bucket, now, renderPdf: async () => { renderCount++; return Buffer.from('%PDF approved'); } });
const call = (uid, action, data = {}) => manage({ ...(uid ? { auth: { uid, token: { role: 'SUPER_ADMIN' } } } : {}), data: { action, ...data } });
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const content = { recipient: '거래처 주식회사', reference: '사업 담당자', title: '참여의향서 제출의 건', body: '1. 귀사의 무궁한 발전을 기원합니다.\n\n2. 아래와 같이 안내드립니다.\n\n끝.', attachments: '회사 소개서 1부' };
const load = async id => (await call('admin', 'get', { id })).letter;
const create = async (uid = 'member') => (await call(uid, 'save', { content })).id;
const submit = async id => { const letter = await load(id); return call('admin', 'submit', { id, revision: letter.revision }); };
const review = async (uid, id, extras = {}) => { const letter = await load(id); return call(uid, 'review', { id, revision: letter.revision, decision: 'approve', ...extras }); };
const allSteps = async id => { await review('lead', id); await review('head', id); return review('admin', id); };
const inboxRef = (uid, letterId) => db.doc(`officialLetterNotifications/${uid}/items/${letterId}`);
const notification = async (uid, letterId) => (await inboxRef(uid, letterId).get()).data();
const reassign = async (id, approverIds, extras = {}) => {
  const letter = await load(id);
  return call('admin', 'reassign', { id, revision: letter.revision, approverIds, reason: '담당자 변경', ...extras });
};

test('official-letter server authorization, numbering and revisions', async t => {
  try {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-hr-flow-letters/databases/(default)/documents`, { method: 'DELETE' });
    await db.doc('companies/a').set({ nameKo: '테스트 주식회사', status: 'ACTIVE' });
    await db.doc('companies/b').set({ nameKo: '다른 회사', status: 'ACTIVE' });
    for (const [uid, role, companyId, extra] of [
      ['admin', 'ADMIN', 'a', {}], ['member', 'MEMBER', 'a', { teamId: 'team1', divisionId: 'division1' }],
      ['lead', 'MEMBER', 'a', {}], ['head', 'SUB_ADMIN', 'a', {}],
      ['peer', 'MEMBER', 'a', { teamId: 'team2', divisionId: 'division2', annualSalary: 123456789, email: 'private@example.com' }],
      ['admin2', 'ADMIN', 'a', {}], ['retired-admin', 'ADMIN', 'a', { status: 'RESIGNED' }],
      ['outsider', 'ADMIN', 'b', {}], ['platform', 'SUPER_ADMIN', 'PLATFORM', {}], ['resigned', 'MEMBER', 'a', { status: 'RESIGNED' }],
    ]) await db.doc(`UserProfile/${uid}`).set({ uid, name: uid, role, companyId, status: 'ACTIVE', ...extra });
    await db.doc('teams/team1').set({ companyId: 'a', leaderId: 'lead' });
    await db.doc('divisions/division1').set({ companyId: 'a', headId: 'head' });

    await t.test('rejects anonymous, platform, resigned and browser role claims', async () => {
      await denied(call(null, 'bootstrap'), 'unauthenticated');
      await denied(call('platform', 'bootstrap'), 'permission-denied');
      await denied(call('resigned', 'bootstrap'), 'permission-denied');
      await denied(call('peer', 'saveSettings', { settings: {} }), 'permission-denied');
      await denied(call('admin', 'unknown'), 'invalid-argument');
    });
    await t.test('validates uploaded image bytes and initial counter, saves settings with optimistic version', async () => {
      const settings = { companyName: '테스트 주식회사', address: '서울특별시 강남구 테헤란로 87', representative: '홍길동',
        phone: '02-123-4567', email: 'office@example.com', logoData: png, sealData: png, lastFront: 0 };
      await denied(call('admin', 'saveSettings', { settings: { ...settings, logoData: 'data:image/png;base64,aGVsbG8=' }, expectedVersion: 0 }), 'invalid-argument');
      await call('admin', 'saveSettings', { settings, expectedVersion: 0 });
      await denied(call('admin', 'saveSettings', { settings, expectedVersion: 0 }), 'aborted');
      const bootstrap = await call('member', 'bootstrap');
      assert.equal(bootstrap.settings.sealData, '');
      assert.equal(bootstrap.settings.logoData, png);
      assert.deepEqual(bootstrap.approvalLine.map(step => step.uid), ['lead', 'head']);
      assert.equal((await call('admin', 'bootstrap')).settings.sealData, png);
      // A legacy serial value must never affect the new front-date numbering.
      await db.doc('officialLetterSettings/a').update({ lastSerial: 999 });
    });

    let letterId;
    await t.test('all users can draft; only author, line and company admin can read', async () => {
      letterId = await create();
      const letter = await load(letterId);
      assert.deepEqual(letter.participantIds, ['member', 'lead', 'head']);
      assert.equal(letter.revision, 1);
      assert.equal((await call('lead', 'get', { id: letterId })).letter.id, letterId);
      await denied(call('peer', 'get', { id: letterId }), 'permission-denied');
      await denied(call('outsider', 'get', { id: letterId }), 'permission-denied');
      assert.equal((await call('peer', 'list')).letters.length, 0);
      assert.equal((await call('member', 'list')).letters.length, 1);
      await denied(call('admin', 'get', { id: '../bad' }), 'invalid-argument');
      await denied(call('member', 'save', { content: { ...content, body: '' } }), 'invalid-argument');
    });
    await t.test('blocks draft PDF, out-of-order approval and final approval before line completion', async () => {
      await denied(call('member', 'pdf', { id: letterId, revision: 1 }), 'failed-precondition');
      await submit(letterId);
      await denied(review('head', letterId), 'permission-denied');
      await denied(review('admin', letterId), 'failed-precondition');
      await review('lead', letterId);
      await denied(call('lead', 'pdf', { id: letterId, revision: 1 }), 'failed-precondition');
      await review('head', letterId);
      assert.equal((await review('admin', letterId)).number, '001-261023');
      const pdf = await call('member', 'pdf', { id: letterId, revision: 1 });
      assert.equal(Buffer.from(pdf.base64, 'base64').toString(), '%PDF approved');
      assert.equal(renderCount, 1);
      await denied(review('admin', letterId), 'failed-precondition');
    });
    await t.test('issued revisions are admin-only, immutable history is preserved and PDF approval resets', async () => {
      await denied(call('member', 'save', { id: letterId, revision: 1, content }), 'permission-denied');
      await denied(call('lead', 'save', { id: letterId, revision: 1, content }), 'permission-denied');
      await call('admin', 'save', { id: letterId, revision: 1, content: { ...content, body: '수정된 내용입니다.' } });
      const current = await load(letterId);
      assert.equal(current.revision, 2); assert.equal(current.status, 'DRAFT');
      assert.ok(current.approvalLine.every(step => !step.approvedAt));
      assert.equal((await call('admin', 'history', { id: letterId })).history[0].content.body, content.body);
      await denied(call('member', 'history', { id: letterId }), 'permission-denied');
      await denied(call('admin', 'pdf', { id: letterId, revision: 2 }), 'failed-precondition');
      await denied(call('admin', 'save', { id: letterId, revision: 1, content }), 'aborted');
      await submit(letterId); await allSteps(letterId);
      assert.equal((await load(letterId)).number, '002-261023');
      await denied(call('member', 'deleteHistory', { id: letterId, revision: 2, historyId: '000001' }), 'permission-denied');
      await call('admin', 'deleteHistory', { id: letterId, revision: 2, historyId: '000001' });
      assert.equal((await call('admin', 'history', { id: letterId })).history.length, 0);
      assert.equal((await db.doc('officialLetterNumbers/a_001-261023').get()).exists, true);
    });
    await t.test('draft edits by a line member reset prior approval and archived content remains', async () => {
      const id = await create(); await submit(id); await review('lead', id);
      await call('head', 'save', { id, revision: 1, content: { ...content, title: '결재자 수정' } });
      const current = await load(id);
      assert.equal(current.status, 'DRAFT'); assert.equal(current.revision, 2);
      assert.ok(current.approvalLine.every(step => !step.approvedAt));
      await submit(id);
      await denied(call('lead', 'review', { id, revision: 2, decision: 'reject', reason: '' }), 'invalid-argument');
      await call('lead', 'review', { id, revision: 2, decision: 'reject', reason: '내용 보완 요청' });
      assert.equal((await load(id)).status, 'REJECTED');
      await submit(id); assert.equal((await load(id)).status, 'PENDING');
    });
    await t.test('submitted branding is frozen and only admins can retrieve its raw seal', async () => {
      const id = await create(); await submit(id);
      const before = (await call('admin', 'bootstrap')).settings;
      await call('admin', 'saveSettings', { settings: { ...before, companyName: '변경된 회사명' }, expectedVersion: before.version });
      const pending = await load(id);
      assert.equal(pending.branding.companyName, before.companyName);
      assert.equal(pending.branding.sealData, png);
      assert.equal((await call('member', 'get', { id })).letter.branding.sealData, '');
      assert.equal((await call('admin', 'bootstrap')).settings.companyName, '변경된 회사명');
    });
    await t.test('approver candidates require a company admin and expose only active eligible profile fields', async () => {
      const id = await create();
      for (const uid of ['member', 'head', 'peer', 'outsider', 'platform', 'resigned']) {
        await denied(call(uid, 'approverCandidates', { id }), 'permission-denied');
      }
      const { candidates } = await call('admin', 'approverCandidates', { id });
      assert.ok(candidates.some(person => person.uid === 'peer'));
      assert.ok(candidates.some(person => person.uid === 'head'));
      assert.ok(!candidates.some(person => ['admin', 'admin2', 'member', 'outsider', 'platform', 'resigned'].includes(person.uid)));
      for (const person of candidates) {
        assert.ok(Object.keys(person).every(key => ['uid', 'name', 'role', 'teamId', 'divisionId'].includes(key)));
        assert.ok(['MEMBER', 'SUB_ADMIN'].includes(person.role));
      }
      assert.equal(candidates.find(person => person.uid === 'peer').teamId, 'team2');
      await denied(call('admin', 'approverCandidates', { id: '../bad' }), 'invalid-argument');
    });
    await t.test('admin reassignment validates every approver and preserves the previous revision', async () => {
      const id = await create();
      await denied(call('member', 'reassign', { id, revision: 1, approverIds: ['peer'], reason: '변경' }), 'permission-denied');
      await denied(call('head', 'reassign', { id, revision: 1, approverIds: ['peer'], reason: '변경' }), 'permission-denied');
      await denied(call('outsider', 'reassign', { id, revision: 1, approverIds: ['peer'], reason: '변경' }), 'permission-denied');
      for (const approverIds of [null, 'peer', ['peer', 'peer'], ['member'], ['admin'], ['admin2'], ['resigned'], ['outsider'], ['platform'], ['missing'], ['../bad'], Array(11).fill('peer')]) {
        await assert.rejects(reassign(id, approverIds), error => ['invalid-argument', 'permission-denied', 'failed-precondition', 'not-found'].includes(error.code));
        assert.equal((await load(id)).revision, 1);
      }
      await denied(reassign(id, ['peer'], { reason: '' }), 'invalid-argument');
      await reassign(id, ['peer', 'head']);
      const current = await load(id);
      assert.equal(current.revision, 2); assert.equal(current.status, 'DRAFT');
      assert.equal(current.approvedRevision, null);
      assert.deepEqual(current.approvalLine.map(step => step.uid), ['peer', 'head']);
      assert.ok(current.approvalLine.every(step => step.approvedAt === null));
      assert.deepEqual(current.participantIds, ['member', 'peer', 'head']);
      assert.equal((await call('peer', 'get', { id })).letter.id, id);
      await denied(call('lead', 'get', { id }), 'permission-denied');
      await denied(call('lead', 'save', { id, revision: 2, content }), 'permission-denied');
      const { history } = await call('admin', 'history', { id });
      assert.equal(history[0].revision, 1);
      assert.deepEqual(history[0].approvalLine.map(step => step.uid), ['lead', 'head']);
      assert.deepEqual(history[0].content, content);
      await denied(call('admin', 'reassign', { id, revision: 1, approverIds: [], reason: '오래된 화면' }), 'aborted');
    });
    await t.test('notifications follow the current approval step and acknowledge only the caller inbox', async () => {
      const id = await create(); await submit(id);
      const first = await notification('lead', id);
      assert.equal(first.recipientId, 'lead'); assert.equal(first.companyId, 'a'); assert.equal(first.letterId, id);
      assert.equal(first.recipientRole, 'MEMBER');
      assert.equal(first.revision, 1); assert.equal(first.status, 'PENDING'); assert.equal(first.requiresAction, true);
      assert.equal(first.readAt, null); assert.equal(typeof first.title, 'string'); assert.ok(first.title.length > 0);
      assert.equal(first.body, undefined, 'notifications must not contain the document body');
      assert.equal(typeof first.event, 'string'); assert.equal(typeof first.createdAt, 'string');
      assert.equal(typeof first.updatedAt, 'string');
      assert.equal(await notification('head', id), undefined);
      assert.equal(await notification('admin', id), undefined);
      await call('lead', 'ackNotification', { id });
      assert.equal(typeof (await notification('lead', id)).readAt, 'string');
      assert.equal((await load(id)).revision, 1, 'acknowledgement must not edit the letter');
      await assert.rejects(call('peer', 'ackNotification', { id }), error => ['not-found', 'permission-denied'].includes(error.code));
      await assert.rejects(call('outsider', 'ackNotification', { id }), error => ['not-found', 'permission-denied'].includes(error.code));
      await denied(call('resigned', 'ackNotification', { id }), 'permission-denied');
      await denied(call('lead', 'ackNotification', { id: '../bad' }), 'invalid-argument');
      await review('lead', id);
      assert.ok(!(await notification('lead', id))?.requiresAction);
      assert.equal((await notification('head', id)).requiresAction, true);
      assert.equal((await notification('head', id)).readAt, null);
      await denied(call('head', 'ackNotification', { id, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }), 'aborted');
      assert.equal((await notification('head', id)).readAt, null);
      await call('head', 'ackNotification', { id, expectedUpdatedAt: (await notification('head', id)).updatedAt });
      assert.equal(typeof (await notification('head', id)).readAt, 'string');
      assert.equal((await notification('member', id)).requiresAction, false);
      await review('head', id);
      assert.equal((await notification('admin', id)).requiresAction, true);
      assert.equal((await notification('admin2', id)).requiresAction, true);
      assert.equal(await notification('retired-admin', id), undefined);
      await review('admin', id);
      for (const uid of ['member', 'lead', 'head']) {
        const issued = await notification(uid, id);
        assert.equal(issued.status, 'ISSUED'); assert.equal(issued.requiresAction, false);
        assert.equal(issued.readAt, null);
      }
      assert.ok(!(await notification('admin2', id))?.requiresAction);
    });
    await t.test('rejecting or editing a request removes stale approval actions and notifies the creator', async () => {
      const rejected = await create(); await submit(rejected);
      await call('lead', 'review', { id: rejected, revision: 1, decision: 'reject', reason: '보완 필요' });
      const rejection = await notification('member', rejected);
      assert.equal(rejection.status, 'REJECTED'); assert.equal(rejection.readAt, null);
      assert.ok(!(await notification('lead', rejected))?.requiresAction);
      const edited = await create(); await submit(edited); await review('lead', edited);
      assert.equal((await notification('head', edited)).requiresAction, true);
      await call('head', 'save', { id: edited, revision: 1, content: { ...content, title: '내용 보완' } });
      assert.ok(!(await notification('head', edited))?.requiresAction);
      const changed = await notification('member', edited);
      assert.equal(changed.revision, 2); assert.equal(changed.status, 'DRAFT'); assert.equal(changed.readAt, null);
    });
    await t.test('pending reassignment clears old approvals, revokes inbox access, and restarts the new line', async () => {
      const id = await create(); await submit(id); await review('lead', id);
      assert.equal((await notification('head', id)).requiresAction, true);
      await reassign(id, ['peer']);
      const current = await load(id);
      assert.equal(current.status, 'PENDING'); assert.equal(current.revision, 2);
      assert.deepEqual(current.participantIds, ['member', 'peer']);
      assert.deepEqual(current.approvalLine.map(step => step.approvedAt), [null]);
      assert.equal(await notification('lead', id), undefined);
      assert.equal(await notification('head', id), undefined);
      assert.equal((await notification('peer', id)).requiresAction, true);
      assert.equal((await notification('peer', id)).revision, 2);
      assert.equal((await notification('member', id)).revision, 2);
      await denied(call('head', 'get', { id }), 'permission-denied');
      await denied(call('peer', 'review', { id, revision: 1, decision: 'approve' }), 'aborted');
      await review('peer', id);
      assert.equal((await notification('admin', id)).requiresAction, true);
      const { history } = await call('admin', 'history', { id });
      assert.ok(history[0].approvalLine.find(step => step.uid === 'lead').approvedAt);
    });
    await t.test('reassignment accepts ten distinct eligible approvers and rejects an eleventh', async () => {
      const approverIds = Array.from({ length: 11 }, (_, index) => `line-${index}`);
      await Promise.all(approverIds.map(uid => db.doc(`UserProfile/${uid}`).set({ uid, name: uid, role: 'MEMBER', companyId: 'a', status: 'ACTIVE' })));
      const id = await create();
      await denied(reassign(id, approverIds), 'invalid-argument');
      assert.equal((await load(id)).revision, 1);
      await reassign(id, approverIds.slice(0, 10));
      assert.deepEqual((await load(id)).approvalLine.map(step => step.uid), approverIds.slice(0, 10));
    });
    await t.test('an empty reassignment routes pending requests directly to active company admins', async () => {
      const id = await create(); await submit(id); await reassign(id, []);
      assert.deepEqual((await load(id)).participantIds, ['member']);
      for (const uid of ['admin', 'admin2']) assert.equal((await notification(uid, id)).requiresAction, true);
      assert.equal(await notification('lead', id), undefined);
      assert.equal(await notification('head', id), undefined);
      await review('admin', id);
      assert.equal((await load(id)).status, 'ISSUED');
    });
    await t.test('issued reassignment archives the issued document and blocks PDF until fresh final approval', async () => {
      const id = await create(); await submit(id); await allSteps(id);
      const issued = await load(id);
      await reassign(id, ['peer']);
      const draft = await load(id);
      assert.equal(draft.status, 'DRAFT'); assert.equal(draft.approvedRevision, null); assert.equal(draft.revision, 2);
      assert.equal(draft.number, issued.number);
      const { history } = await call('admin', 'history', { id });
      assert.equal(history[0].number, issued.number); assert.equal(history[0].status, 'ISSUED');
      await denied(call('member', 'pdf', { id, revision: 2 }), 'failed-precondition');
      await denied(call('peer', 'save', { id, revision: 2, content }), 'permission-denied');
      await submit(id); await review('peer', id);
      await denied(call('member', 'pdf', { id, revision: 2 }), 'failed-precondition');
      await review('admin', id);
      assert.notEqual((await load(id)).number, issued.number);
      assert.equal((await call('member', 'pdf', { id, revision: 2 })).filename, `${(await load(id)).number}.pdf`);
    });
    await t.test('review racing with reassignment cannot leave approvals on the replaced line', async () => {
      const id = await create(); await submit(id);
      const outcomes = await Promise.allSettled([
        call('lead', 'review', { id, revision: 1, decision: 'approve' }),
        call('admin', 'reassign', { id, revision: 1, approverIds: ['peer'], reason: '동시 재배정' }),
      ]);
      assert.equal(outcomes[1].status, 'fulfilled');
      if (outcomes[0].status === 'rejected') assert.ok(['aborted', 'permission-denied'].includes(outcomes[0].reason.code));
      const current = await load(id);
      assert.equal(current.revision, 2); assert.equal(current.status, 'PENDING');
      assert.deepEqual(current.approvalLine.map(step => [step.uid, step.approvedAt]), [['peer', null]]);
      assert.equal((await notification('peer', id)).requiresAction, true);
      assert.equal(await notification('head', id), undefined);
    });
    await t.test('existing legacy issued numbers and archived copies remain unchanged', async () => {
      const source = await load(letterId);
      const legacy = { ...source, number: '024-261014-024', front: 24, serial: 24, issueDate: '2026-10-14', revision: 9, approvedRevision: 9 };
      delete legacy.id;
      await db.doc('officialLetters/legacy-issued').set(legacy);
      await db.doc('officialLetters/legacy-issued/history/000008').set({ ...legacy, revision: 8 });
      assert.equal((await load('legacy-issued')).number, '024-261014-024');
      assert.equal((await call('member', 'pdf', { id: 'legacy-issued', revision: 9 })).filename, '024-261014-024.pdf');
      assert.equal((await call('admin', 'history', { id: 'legacy-issued' })).history[0].number, '024-261014-024');
    });
    await t.test('concurrent issuance increments only the front counter without duplicates', async () => {
      const previous = (await call('admin', 'bootstrap')).settings.lastFront;
      const ids = await Promise.all(Array.from({ length: 4 }, () => create('admin')));
      for (const id of ids) await submit(id);
      const results = await Promise.all(ids.map(id => review('admin', id)));
      assert.equal(new Set(results.map(result => result.number)).size, 4);
      assert.deepEqual(results.map(result => result.number).sort(), [1, 2, 3, 4].map(n => numberLabel(previous + n, '2026-10-23')));
    });
    await t.test('the number date is taken from final issuance in Seoul, including a later month', async () => {
      const id = await create('admin'); await submit(id);
      const previous = (await call('admin', 'bootstrap')).settings.lastFront;
      const november = createOfficialLetterService({ db, bucket, now: () => new Date('2026-11-04T15:00:00.000Z'), renderPdf: async () => Buffer.from('%PDF') });
      const result = await november({ auth: { uid: 'admin' }, data: { action: 'review', id, revision: 1, decision: 'approve' } });
      assert.equal(result.number, numberLabel(previous + 1, '2026-11-05'));
      assert.equal((await load(id)).issueDate, '2026-11-05');
    });
    await t.test('only the front number is overridable, legacy collisions are reserved, and issue date is fixed to today', async () => {
      const id = await create('admin'); await submit(id);
      await denied(review('admin', id, { front: 1 }), 'already-exists');
      await denied(review('admin', id, { issueDate: '2026-02-30' }), 'invalid-argument');
      await denied(review('admin', id, { issueDate: '2026-10-24' }), 'invalid-argument');
      await denied(review('admin', id, { front: 1000 }), 'invalid-argument');
      await db.doc('officialLetterNumbers/a_040-261023-777').set({ companyId: 'a', number: '040-261023-777' });
      await db.doc('officialLetterNumbers/a_041-261023').set({ companyId: 'a', number: '041-261023' });
      await denied(review('admin', id, { front: 40 }), 'already-exists');
      await denied(review('admin', id, { front: 41 }), 'already-exists');
      assert.equal((await review('admin', id, { front: 50, issueDate: '2026-10-23' })).number, '050-261023');
      const next = await create('admin'); await submit(next); await review('admin', next);
      assert.equal((await load(next)).number, '051-261023');
      const lower = await create('admin'); await submit(lower); await review('admin', lower, { front: 20 });
      const settings = (await call('admin', 'bootstrap')).settings;
      assert.equal(settings.lastFront, 51);
      await db.doc('officialLetterSettings/a').update({ lastFront: 999 });
      const exhausted = await create('admin'); await submit(exhausted);
      await denied(review('admin', exhausted), 'invalid-argument');
      assert.equal((await load(exhausted)).status, 'PENDING');
    });
    await t.test('revalidates approval and active membership after PDF rendering', async () => {
      const current = await load(letterId);
      const revoked = createOfficialLetterService({ db, bucket, now, renderPdf: async () => {
        await db.doc(`officialLetters/${letterId}`).update({ status: 'DRAFT' }); return Buffer.from('%PDF');
      } });
      await denied(revoked({ auth: { uid: 'member' }, data: { action: 'pdf', id: letterId, revision: current.revision } }), 'aborted');
      await db.doc(`officialLetters/${letterId}`).update({ status: 'ISSUED' });
      const resigned = createOfficialLetterService({ db, bucket, now, renderPdf: async () => {
        await db.doc('UserProfile/member').update({ status: 'RESIGNED' }); return Buffer.from('%PDF');
      } });
      await denied(resigned({ auth: { uid: 'member' }, data: { action: 'pdf', id: letterId, revision: current.revision } }), 'permission-denied');
      await db.doc('UserProfile/member').update({ status: 'ACTIVE' });
    });
    await t.test('Seoul issuance day is independent of server timezone', () => {
      assert.equal(koreaDate(now()), '2026-10-23');
      assert.equal(koreaDate(new Date('2026-11-04T15:00:00.000Z')), '2026-11-05');
      assert.equal(numberLabel(7, '2026-10-23'), '007-261023');
      assert.equal(numberLabel(8, '2026-11-05'), '008-261105');
    });
    await t.test('renders Korean A4 documents including long multipage bodies', async () => {
      const letter = { ...(await load(letterId)), number: '002-261023', issueDate: '2026-10-23', content };
      const bytes = Buffer.from(png.split(',')[1], 'base64');
      // This valid logo/seal fixture is sufficient for image encoding and font embedding.
      const short = await renderOfficialLetterPdf(letter, { logo: bytes, seal: bytes });
      assert.equal(short.subarray(0, 5).toString(), '%PDF-');
      assert.equal((short.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'a short letter must not gain a footer-only page');
      const long = await renderOfficialLetterPdf({ ...letter, content: { ...content, body: Array(90).fill('한글 공문 본문 줄바꿈과 페이지 나눔을 확인합니다.').join('\n') } }, { logo: bytes, seal: bytes });
      assert.ok(long.length > short.length);
      assert.ok((long.toString('latin1').match(/\/Type \/Page\b/g) || []).length <= 5, 'footers must not create extra pages');
      const output = path.resolve(__dirname, '../../tmp/pdfs'); fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, 'official-letter-sample.pdf'), short);
      fs.writeFileSync(path.join(output, 'official-letter-multipage.pdf'), long);
    });
  } finally { await deleteApp(app); }
});
