const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createOfficialLetterService } = require('../official-letter-service');
const { createAttachmentService } = require('../attachment-service');

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('A loopback FIRESTORE_EMULATOR_HOST is required; production tests are prohibited.');
}
process.env.METADATA_SERVER_DETECTION = 'none';
const projectId = 'demo-hr-flow-work-reports';
const app = initializeApp({ projectId }, 'work-reports-test');
const db = getFirestore(app);
let currentTime = '2026-11-05T03:00:00.000Z';
const now = () => new Date(currentTime);
const files = new Map(), writes = [], rendered = [];
const bucket = {
  name: 'work-reports-fixture.invalid',
  deleteFiles: async ({ prefix }) => { for (const name of files.keys()) if (name.startsWith(prefix)) files.delete(name); },
  file: name => ({
    save: async (bytes, options = {}) => {
      if (options.preconditionOpts?.ifGenerationMatch === 0 && files.has(name)) throw Object.assign(new Error('immutable fixture'), { code: 412 });
      files.set(name, { bytes: Buffer.from(bytes), metadata: { ...options.metadata, size: String(bytes.length), metadata: { ...options.metadata?.metadata } } });
      writes.push({ name, options });
    },
    getMetadata: async () => {
      if (!files.has(name)) throw Object.assign(new Error('missing fixture'), { code: 404 });
      return [structuredClone(files.get(name).metadata)];
    },
    download: async () => {
      if (!files.has(name)) throw Object.assign(new Error('missing fixture'), { code: 404 });
      return [Buffer.from(files.get(name).bytes)];
    },
    delete: async () => { files.delete(name); },
  }),
};
const auth = { verifyIdToken: async (token, revoked) => {
  assert.equal(revoked, true);
  if (!token.startsWith('fixture:')) throw Error('invalid token');
  return { uid: token.slice(8) };
} };
const manage = createOfficialLetterService({ db, bucket, now, renderPdf: async letter => {
  rendered.push(structuredClone(letter)); return Buffer.from('%PDF-1.7\nwork report fixture\n%%EOF');
} });
const attachmentService = createAttachmentService({ db, auth, bucket, now });
const call = (uid, action, data = {}) => manage({ ...(uid ? { auth: { uid, token: { auth_time: now().getTime() / 1000,
  firebase: { sign_in_provider: 'password' } } } } : {}), data: { action, ...data } });
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const content = { title: '제목 임의 변경', body: '오늘 수행한 업무와 다음 업무를 보고합니다.', attachments: '', cooperationNote: '' };
const route = { teamLeader: true, divisionHead: true, cooperationDivisionIds: [], representative: false };
const save = (kind = 'DAILY', values = {}, uid = 'writer') => call(uid, 'save', { documentType: 'DRAFTING', draftingKind: kind,
  content, requestId: randomUUID(), ...values });
const load = async id => (await call('admin', 'get', { id })).letter;
const create = async (kind = 'DAILY', values = {}, uid = 'writer') => (await save(kind, values, uid)).id;
const submit = async (id, uid = 'writer') => call(uid, 'submit', { id, revision: (await load(id)).revision });
const review = async (id, uid, decision = 'approve') => call(uid, 'review', { id, revision: (await load(id)).revision,
  decision, ...(decision === 'reject' ? { reason: '내용을 보완해 주세요.' } : {}) });
const issue = async id => { await submit(id); await review(id, 'lead'); await review(id, 'head'); return load(id); };
const counters = async () => (await db.collection('draftingCounters').get()).docs.map(d => d.data());
async function http(action, uid, query = {}, bytes = Buffer.from('%PDF-1.7\nexternal fixture\n%%EOF')) {
  const headers = { Authorization: uid ? `Bearer fixture:${uid}` : '', Origin: 'https://hr-flow.pages.dev',
    'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('업무 자료.pdf') };
  const req = { method: action === 'upload' ? 'POST' : 'GET', query: { category: 'drafting', ...query }, rawBody: bytes,
    get: key => Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] };
  const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
  await attachmentService[action](req, res); return res;
}
async function reset() {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true); files.clear(); writes.length = 0; rendered.length = 0;
  currentTime = '2026-11-05T03:00:00.000Z';
  const batch = db.batch();
  for (const [id, adminUid] of [['a', 'admin'], ['b', 'foreign']]) batch.set(db.doc(`companies/${id}`), {
    status: 'ACTIVE', adminUid, nameKo: `업무보고 검증회사 ${id}`, accessUntil: Timestamp.fromDate(new Date('2030-01-01T00:00:00Z')),
  });
  for (const [uid, role, companyId, divisionId, teamId, status] of [
    ['admin', 'ADMIN', 'a', 'strategy', 'strategy-team', 'ACTIVE'], ['admin2', 'ADMIN', 'a', 'other', '', 'ACTIVE'],
    ['writer', 'MEMBER', 'a', 'strategy', 'strategy-team', 'ACTIVE'], ['lead', 'MEMBER', 'a', 'strategy', 'strategy-team', 'ACTIVE'],
    ['head', 'SUB_ADMIN', 'a', 'strategy', '', 'ACTIVE'], ['peer', 'MEMBER', 'a', 'strategy', 'strategy-team', 'ACTIVE'],
    ['delegate', 'SUB_ADMIN', 'a', 'strategy', '', 'ACTIVE'], ['other-head', 'SUB_ADMIN', 'a', 'other', '', 'ACTIVE'],
    ['foreign', 'ADMIN', 'b', 'foreign', 'foreign-team', 'ACTIVE'], ['retired', 'MEMBER', 'a', 'strategy', 'strategy-team', 'RESIGNED'],
    ['stopped', 'MEMBER', 'a', 'strategy', 'strategy-team', 'SUSPENDED'],
  ]) batch.set(db.doc(`UserProfile/${uid}`), { uid, role, companyId, divisionId, teamId, status,
    name: `${uid} 담당자`, mustChangePassword: false });
  batch.set(db.doc('UserProfile/platform'), { role: 'SUPER_ADMIN', companyId: 'PLATFORM', status: 'ACTIVE' });
  batch.set(db.doc('divisions/strategy'), { companyId: 'a', name: '전략기획본부', headId: 'head' });
  batch.set(db.doc('divisions/other'), { companyId: 'a', name: '경영지원본부', headId: 'other-head' });
  batch.set(db.doc('divisions/foreign'), { companyId: 'b', name: '타사본부', headId: 'foreign' });
  batch.set(db.doc('teams/strategy-team'), { companyId: 'a', divisionId: 'strategy', name: '전략기획팀', leaderId: 'lead' });
  batch.set(db.doc('teams/foreign-team'), { companyId: 'b', divisionId: 'foreign', name: '타사팀', leaderId: 'foreign' });
  batch.set(db.doc('officialLetterSettings/a'), { documentApproverIds: ['delegate'] });
  await batch.commit();
}

test('daily and weekly reports preserve company isolation and explicit organization confirmation', async t => {
  t.beforeEach(reset);
  try {
    await t.test('daily report has fixed server title, date, team/head line and no document number or counter', async () => {
      const id = await create('DAILY', { content: { ...content, recipient: '임의 수신', reference: '다른본부', cooperationNote: '임의 협조 요청' } });
      const letter = await load(id);
      assert.equal(letter.documentType, 'DRAFTING'); assert.equal(letter.drafting.kind, 'DAILY');
      assert.equal(letter.number, ''); assert.equal(letter.drafting.sequence, undefined);
      assert.deepEqual(letter.drafting.reportPeriod, { startDate: '2026-11-05', endDate: '2026-11-05' });
      assert.equal(letter.content.title, '일일 업무보고'); assert.equal(letter.content.recipient, '업무보고');
      assert.equal(letter.content.reference, ''); assert.equal(letter.content.cooperationNote, '');
      assert.deepEqual(letter.approvalLine.map(step => step.uid), ['lead', 'head']);
      assert.deepEqual(letter.drafting.route, route); assert.deepEqual(await counters(), []);
    });
    await t.test('weekly report defaults Monday through Sunday and accepts a selected workweek up to seven days', async () => {
      const first = await load(await create('WEEKLY'));
      assert.equal(first.content.title, '주간 업무보고');
      assert.deepEqual(first.drafting.reportPeriod, { startDate: '2026-11-02', endDate: '2026-11-08' });
      const second = await load(await create('WEEKLY', { reportPeriod: { startDate: '2026-11-02', endDate: '2026-11-06' } }));
      assert.deepEqual(second.drafting.reportPeriod, { startDate: '2026-11-02', endDate: '2026-11-06' });
      assert.deepEqual(await counters(), []);
    });
    await t.test('period rejects invalid dates, reversed ranges, multi-day daily reports and more than seven weekly days', async () => {
      for (const [kind, reportPeriod] of [
        ['DAILY', { startDate: '2026-11-05', endDate: '2026-11-06' }], ['DAILY', { startDate: '2026-02-30', endDate: '2026-02-30' }],
        ['WEEKLY', { startDate: '2026-11-06', endDate: '2026-11-02' }], ['WEEKLY', { startDate: '2026-11-01', endDate: '2026-11-08' }],
        ['WEEKLY', { startDate: '2026-11-05' }], ['DAILY', { startDate: '../date', endDate: '../date' }],
      ]) await denied(save(kind, { reportPeriod }), 'invalid-argument');
      assert.equal((await db.collection('officialLetters').get()).size, 0);
    });
    await t.test('kind is validated and immutable; reused creation UUID cannot change report kind or period', async () => {
      await denied(save('UNKNOWN'), 'invalid-argument');
      const requestId = randomUUID(); const first = await save('DAILY', { requestId });
      assert.deepEqual(await save('DAILY', { requestId }), first);
      await denied(save('WEEKLY', { requestId }), 'already-exists');
      await denied(save('DAILY', { requestId, reportPeriod: { startDate: '2026-11-04', endDate: '2026-11-04' } }), 'already-exists');
      await denied(save('WEEKLY', { id: first.id, revision: 1 }), 'invalid-argument');
      await denied(save('DRAFT', { id: first.id, revision: 1, draftingRoute: route }), 'invalid-argument');
    });
    await t.test('reports never consume the legacy division monthly drafting sequence', async () => {
      const first = await load(await create('DRAFT', { draftingRoute: route }));
      await create('DAILY'); await create('WEEKLY');
      const second = await load(await create('DRAFT', { draftingRoute: route }));
      assert.equal(first.number, '전략기획 11-001'); assert.equal(second.number, '전략기획 11-002');
      assert.equal((await counters())[0].lastSequence, 2);
    });
    await t.test('creation retries preserve their original default period across midnight, week changes and later edits', async () => {
      currentTime = '2026-11-05T14:59:59.999Z';
      const requestId = randomUUID(); const first = await save('DAILY', { requestId });
      currentTime = '2026-11-05T15:00:00.000Z';
      assert.deepEqual(await save('DAILY', { requestId }), first);
      assert.deepEqual((await load(first.id)).drafting.reportPeriod, { startDate: '2026-11-05', endDate: '2026-11-05' });
      await save('DAILY', { id: first.id, revision: 1, reportPeriod: { startDate: '2026-11-04', endDate: '2026-11-04' } });
      assert.deepEqual(await save('DAILY', { requestId }), first);
      assert.deepEqual((await load(first.id)).drafting.reportPeriod, { startDate: '2026-11-04', endDate: '2026-11-04' });
      currentTime = '2026-11-08T14:59:59.999Z';
      const weeklyId = randomUUID(); const weekly = await save('WEEKLY', { requestId: weeklyId });
      currentTime = '2026-11-08T15:00:00.000Z';
      assert.deepEqual(await save('WEEKLY', { requestId: weeklyId }), weekly);
      assert.deepEqual((await load(weekly.id)).drafting.reportPeriod, { startDate: '2026-11-02', endDate: '2026-11-08' });
    });
    await t.test('reports reject representative, cooperation and skipped-head routes while accepting the canonical fixed route', async () => {
      for (const draftingRoute of [{ ...route, representative: true }, { ...route, teamLeader: false },
        { ...route, divisionHead: false }, { ...route, cooperationDivisionIds: ['other'] }]) {
        await denied(save('DAILY', { draftingRoute }), 'invalid-argument');
      }
      assert.deepEqual((await load(await create('WEEKLY', { draftingRoute: route }))).drafting.route, route);
    });
    await t.test('only next team/head confirms; company administrators can read at any time but cannot bypass confirmation', async () => {
      const id = await create();
      assert.equal((await call('admin2', 'get', { id })).letter.id, id);
      await submit(id); await denied(review(id, 'admin'), 'permission-denied'); await denied(review(id, 'head'), 'permission-denied');
      await review(id, 'lead'); assert.equal((await load(id)).status, 'PENDING');
      await denied(review(id, 'admin2'), 'permission-denied'); await review(id, 'head');
      const issued = await load(id); assert.equal(issued.status, 'ISSUED'); assert.equal(issued.number, '');
      assert.equal(issued.approvedRevision, 1); assert.deepEqual(await counters(), []);
    });
    await t.test('administrator-authored report is not automatically confirmed after submission', async () => {
      const id = await create('DAILY', {}, 'admin');
      await submit(id, 'admin'); const letter = await load(id);
      assert.equal(letter.status, 'PENDING'); assert.ok(letter.approvalLine.every(step => step.approvedAt === null));
      await denied(review(id, 'admin'), 'permission-denied');
    });
    await t.test('one actual person holding both roles is merged but must explicitly confirm after submitting', async () => {
      await db.doc('teams/strategy-team').update({ leaderId: 'writer' }); await db.doc('divisions/strategy').update({ headId: 'writer' });
      const id = await create(); await submit(id);
      const pending = await load(id); assert.equal(pending.status, 'PENDING'); assert.equal(pending.approvalLine.length, 1);
      assert.equal(pending.approvalLine[0].uid, 'writer'); assert.match(pending.approvalLine[0].roleLabel, /팀장.*본부장/);
      await review(id, 'writer'); assert.equal((await load(id)).status, 'ISSUED');
    });
    await t.test('missing, foreign, suspended and password-pending organizational approvers cannot be selected', async () => {
      for (const update of [{ leaderId: 'foreign' }, { leaderId: 'stopped' }, { leaderId: '' }]) {
        await db.doc('teams/strategy-team').update(update); await denied(save(), 'failed-precondition');
      }
      await db.doc('teams/strategy-team').update({ leaderId: 'lead' }); await db.doc('UserProfile/head').update({ mustChangePassword: true });
      await denied(save(), 'failed-precondition'); await db.doc('UserProfile/head').update({ mustChangePassword: false });
      await db.doc('UserProfile/writer').update({ teamId: '' }); await denied(save(), 'failed-precondition');
      for (const uid of ['retired', 'stopped', 'platform']) await denied(save('DAILY', {}, uid), 'permission-denied');
    });
    await t.test('changed organization responsibility requires a new revision and resets prior confirmation', async () => {
      const id = await create(); await submit(id); await review(id, 'lead');
      await db.doc('divisions/strategy').update({ headId: 'other-head' });
      await denied(review(id, 'head'), 'failed-precondition');
      const before = await load(id); await save('DAILY', { id, revision: before.revision, content: before.content });
      const revised = await load(id); assert.equal(revised.revision, 2); assert.equal(revised.status, 'DRAFT');
      assert.deepEqual(revised.approvalLine.map(step => step.uid), ['lead', 'other-head']); assert.ok(revised.approvalLine.every(step => !step.approvedAt));
    });
    await t.test('current report read access is exact participants or company ADMIN; delegated same-division users gain no access', async () => {
      const id = await create();
      for (const uid of ['writer', 'lead', 'head', 'admin', 'admin2']) assert.equal((await call(uid, 'get', { id })).letter.id, id);
      for (const uid of ['peer', 'delegate', 'other-head', 'foreign', 'retired', 'stopped', 'platform']) await denied(call(uid, 'get', { id }), 'permission-denied');
      await denied(call(null, 'get', { id }), 'unauthenticated');
    });
    await t.test('report originals use the same strict file ACL and archive references remain ADMIN-only', async () => {
      const requestId = randomUUID(); const uploaded = await http('upload', 'writer', { requestId }); assert.equal(uploaded.statusCode, 200);
      const id = await create('DAILY', { requestId, content: { ...content, attachmentFiles: [uploaded.body] } });
      for (const uid of ['writer', 'lead', 'head', 'admin2']) assert.equal((await http('download', uid, { documentId: id, revision: '1', attachmentId: uploaded.body.id })).statusCode, 200);
      for (const uid of ['peer', 'delegate', 'foreign', 'stopped']) assert.equal((await http('download', uid, { documentId: id, revision: '1', attachmentId: uploaded.body.id })).statusCode, 403);
      const before = await load(id); await save('DAILY', { id, revision: 1, content: { ...before.content, attachmentFiles: [] } });
      assert.equal((await http('download', 'writer', { documentId: id, revision: '2', attachmentId: uploaded.body.id })).statusCode, 404);
      assert.equal((await http('download', 'writer', { documentId: id, revision: '2', historyId: '000001', attachmentId: uploaded.body.id })).statusCode, 403);
      assert.equal((await http('download', 'admin2', { documentId: id, revision: '2', historyId: '000001', attachmentId: uploaded.body.id })).statusCode, 200);
    });
    await t.test('confirmed reports retain period on ADMIN revision and require team/head confirmation again', async () => {
      const id = await create('WEEKLY'); const issued = await issue(id);
      await denied(save('WEEKLY', { id, revision: 1, content: issued.content }), 'permission-denied');
      await save('WEEKLY', { id, revision: 1, content: { ...issued.content, body: '관리자 보완 보고 내용' } }, 'admin2');
      const revised = await load(id); assert.equal(revised.revision, 2); assert.equal(revised.status, 'DRAFT');
      assert.equal(revised.number, ''); assert.deepEqual(revised.drafting.reportPeriod, issued.drafting.reportPeriod);
      assert.ok(revised.approvalLine.every(step => !step.approvedAt));
      await denied(call('admin', 'pdf', { id, revision: 2 }), 'failed-precondition');
      assert.equal((await call('admin2', 'history', { id })).history.length, 1);
      await submit(id, 'admin2'); await review(id, 'lead'); await review(id, 'head'); assert.equal((await load(id)).status, 'ISSUED');
      assert.deepEqual(await counters(), []);
    });
    await t.test('PDF is confirmation-gated, receives fixed report metadata and has a readable filename without a document number', async () => {
      const first = await create('DAILY'); await denied(call('writer', 'pdf', { id: first, revision: 1 }), 'failed-precondition');
      await issue(first); const firstPdf = await call('writer', 'pdf', { id: first, revision: 1 });
      assert.match(firstPdf.filename, /일일.*업무보고.*\.pdf$/); assert.notEqual(firstPdf.filename, '.pdf'); assert.ok(!firstPdf.filename.includes('undefined'));
      assert.equal(rendered[0].number, ''); assert.equal(rendered[0].drafting.kind, 'DAILY');
      const second = await create('WEEKLY'); await issue(second); const secondPdf = await call('writer', 'pdf', { id: second, revision: 1 });
      assert.match(secondPdf.filename, /주간.*업무보고.*\.pdf$/);
      const paths = writes.filter(write => write.name.includes('/official-pdfs/')).map(write => write.name);
      assert.equal(paths.length, 2); assert.notEqual(paths[0], paths[1]);
    });
    await t.test('confirmation requests and completion remain integrated into the existing inbox and next-person notifications', async () => {
      const id = await create('DAILY'); await submit(id);
      const pending = (await call('head', 'approvals')).letters.find(letter => letter.id === id);
      assert.equal(pending.draftingKind, 'DAILY'); assert.equal(pending.status, 'PENDING'); assert.equal(pending.canReview, false);
      assert.deepEqual(pending.reportPeriod, { startDate: '2026-11-05', endDate: '2026-11-05' });
      const leadNote = (await db.doc(`officialLetterNotifications/lead/items/${id}`).get()).data();
      assert.equal(leadNote.requiresAction, true); assert.match(leadNote.title, /업무보고/);
      await review(id, 'lead'); assert.equal((await db.doc(`officialLetterNotifications/head/items/${id}`).get()).data().requiresAction, true);
      await review(id, 'head');
      const issuedNote = (await db.doc(`officialLetterNotifications/writer/items/${id}`).get()).data();
      assert.equal(issuedNote.requiresAction, false); assert.match(issuedNote.title, /확인/);
      assert.equal((await call('writer', 'mine')).letters.find(letter => letter.id === id).draftingKind, 'DAILY');
    });
    await t.test('draftingList applies inclusive KST dates to every role and returns only their company/participants', async () => {
      const before = await create('DAILY'); const atStart = await create('DAILY'); const atEnd = await create('WEEKLY');
      const after = await create('DAILY'); const peer = await create('DAILY', {}, 'peer'); const foreign = await create('DAILY', {}, 'foreign');
      for (const [id, updatedAt] of [[before, '2026-11-04T14:59:59.999Z'], [atStart, '2026-11-04T15:00:00.000Z'],
        [atEnd, '2026-11-05T14:59:59.999Z'], [after, '2026-11-05T15:00:00.000Z']]) await db.doc(`officialLetters/${id}`).update({ updatedAt });
      const period = { startDate: '2026-11-05', endDate: '2026-11-05' };
      const ids = async uid => (await call(uid, 'draftingList', period)).letters.map(letter => letter.id).sort();
      assert.deepEqual(await ids('writer'), [atStart, atEnd].sort()); assert.deepEqual(await ids('delegate'), []);
      assert.deepEqual(await ids('admin2'), [atStart, atEnd, peer].sort());
      assert.deepEqual(await ids('foreign'), [foreign]); assert.ok(!(await ids('lead')).includes(foreign));
      assert.ok((await call('writer', 'draftingList', { ...period, companyId: 'b' })).letters.every(letter => letter.id !== foreign));
    });
    await t.test('draftingList defaults to thirty days, validates ranges and keeps non-drafting documents out', async () => {
      const old = await create(); await db.doc(`officialLetters/${old}`).update({ updatedAt: '2026-10-06T14:59:59.999Z' });
      const boundary = await create(); await db.doc(`officialLetters/${boundary}`).update({ updatedAt: '2026-10-06T15:00:00.000Z' });
      const recent = await create('WEEKLY');
      const other = db.collection('officialLetters').doc(); await other.set({ companyId: 'a', creatorId: 'writer', participantIds: ['writer'],
        approvalLine: [], documentType: 'OFFICIAL', content, status: 'DRAFT', revision: 1, updatedAt: now().toISOString(), createdAt: now().toISOString() });
      assert.deepEqual((await call('writer', 'draftingList')).letters.map(letter => letter.id).sort(), [boundary, recent].sort());
      for (const range of [{ startDate: '', endDate: '' }, { startDate: '2026-11-06', endDate: '2026-11-05' },
        { startDate: '2026-02-30', endDate: '2026-03-01' }, { startDate: '2026-11-05' }]) await denied(call('writer', 'draftingList', range), 'invalid-argument');
      await denied(call('platform', 'draftingList'), 'permission-denied'); await denied(call('stopped', 'draftingList'), 'permission-denied');
    });
  } finally { await deleteApp(app); }
});
