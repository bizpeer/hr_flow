const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createOfficialLetterService, koreaDate, numberLabel } = require('../official-letter-service');
const { renderOfficialLetterPdf } = require('../official-letter-pdf');
const fs = require('node:fs');
const path = require('node:path');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is required; production tests are prohibited.');
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

test('official-letter server authorization, numbering and revisions', async t => {
  try {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-hr-flow-letters/databases/(default)/documents`, { method: 'DELETE' });
    await db.doc('companies/a').set({ nameKo: '테스트 주식회사', status: 'ACTIVE' });
    await db.doc('companies/b').set({ nameKo: '다른 회사', status: 'ACTIVE' });
    for (const [uid, role, companyId, extra] of [
      ['admin', 'ADMIN', 'a', {}], ['member', 'MEMBER', 'a', { teamId: 'team1', divisionId: 'division1' }],
      ['lead', 'MEMBER', 'a', {}], ['head', 'SUB_ADMIN', 'a', {}], ['peer', 'MEMBER', 'a', {}],
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
        phone: '02-123-4567', email: 'office@example.com', logoData: png, sealData: png, lastFront: 0, lastSerial: 0 };
      await denied(call('admin', 'saveSettings', { settings: { ...settings, logoData: 'data:image/png;base64,aGVsbG8=' }, expectedVersion: 0 }), 'invalid-argument');
      await call('admin', 'saveSettings', { settings, expectedVersion: 0 });
      await denied(call('admin', 'saveSettings', { settings, expectedVersion: 0 }), 'aborted');
      const bootstrap = await call('member', 'bootstrap');
      assert.equal(bootstrap.settings.sealData, '');
      assert.equal(bootstrap.settings.logoData, png);
      assert.deepEqual(bootstrap.approvalLine.map(step => step.uid), ['lead', 'head']);
      assert.equal((await call('admin', 'bootstrap')).settings.sealData, png);
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
      assert.equal((await review('admin', letterId)).number, '001-261023-001');
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
      assert.equal((await load(letterId)).number, '002-261023-002');
      await denied(call('member', 'deleteHistory', { id: letterId, revision: 2, historyId: '000001' }), 'permission-denied');
      await call('admin', 'deleteHistory', { id: letterId, revision: 2, historyId: '000001' });
      assert.equal((await call('admin', 'history', { id: letterId })).history.length, 0);
      assert.equal((await db.doc('officialLetterNumbers/a_001-261023-001').get()).exists, true);
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
    await t.test('concurrent issuance increments both counters without duplicates', async () => {
      const ids = await Promise.all(Array.from({ length: 4 }, () => create('admin')));
      for (const id of ids) await submit(id);
      const results = await Promise.all(ids.map(id => review('admin', id)));
      assert.equal(new Set(results.map(result => result.number)).size, 4);
      assert.deepEqual(results.map(result => result.number).sort(), [3, 4, 5, 6].map(n => numberLabel(n, '2026-10-23', n)));
    });
    await t.test('admin can override numbers, duplicate reservations fail and high water marks do not decrease', async () => {
      const id = await create('admin'); await submit(id);
      await denied(review('admin', id, { front: 1, serial: 1 }), 'already-exists');
      await denied(review('admin', id, { issueDate: '2026-02-30' }), 'invalid-argument');
      await denied(review('admin', id, { front: 1000 }), 'invalid-argument');
      assert.equal((await review('admin', id, { front: 50, serial: 70, issueDate: '2026-10-24' })).number, '050-261024-070');
      const next = await create('admin'); await submit(next); await review('admin', next);
      assert.equal((await load(next)).number, '051-261023-071');
      const lower = await create('admin'); await submit(lower); await review('admin', lower, { front: 20, serial: 30 });
      const settings = (await call('admin', 'bootstrap')).settings;
      assert.equal(settings.lastFront, 51); assert.equal(settings.lastSerial, 71);
      await db.doc('officialLetterSettings/a').update({ lastFront: 999, lastSerial: 999 });
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
      assert.equal(numberLabel(7, '2026-10-23', 24), '007-261023-024');
    });
    await t.test('renders Korean A4 documents including long multipage bodies', async () => {
      const letter = { ...(await load(letterId)), number: '002-261023-002', issueDate: '2026-10-23', content };
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
