const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createOfficialLetterService } = require('../official-letter-service');
const { renderOfficialLetterPdf } = require('../official-letter-pdf');

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('A loopback FIRESTORE_EMULATOR_HOST is required; production tests are prohibited.');
}
const projectId = 'demo-hr-flow-drafting';
const app = initializeApp({ projectId }, 'drafting-test');
const db = getFirestore(app);
const files = new Map();
const writes = [];
const rendered = [];
let currentTime = '2026-11-04T15:10:00.000Z';
const now = () => new Date(currentTime);
const bucket = {
  deleteFiles: async ({ prefix }) => { for (const name of files.keys()) if (name.startsWith(prefix)) files.delete(name); },
  file: name => ({
    save: async (bytes, options) => { files.set(name, Buffer.from(bytes)); writes.push({ name, options }); },
    download: async () => { if (!files.has(name)) throw new Error('missing object'); return [Buffer.from(files.get(name))]; },
    delete: async () => { files.delete(name); },
  }),
};
const createService = (overrides = {}) => createOfficialLetterService({ db, bucket, now,
  renderPdf: async letter => { rendered.push(structuredClone(letter)); return Buffer.from('%PDF drafting approved'); }, ...overrides });
const manage = createService();
const call = (uid, action, data = {}, service = manage, token = {}) => service({
  ...(uid ? { auth: { uid, token: { role: 'SUPER_ADMIN', ...token } } } : {}), data: { action, ...data },
});
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const content = { title: '신규 사업 추진의 건', body: '1. 신규 사업의 추진을 요청합니다.\n2. 검토 후 결재하여 주시기 바랍니다.',
  attachments: '사업계획서 1부', cooperationNote: '예산 검토 후 의견 회신 요청' };
const headRoute = { teamLeader: false, divisionHead: true, cooperationDivisionIds: [], representative: false };
const representativeRoute = { teamLeader: true, divisionHead: true, cooperationDivisionIds: ['cooperation'], representative: true };
const save = (uid = 'writer', route = headRoute, values = {}, service = manage) => call(uid, 'save', {
  documentType: 'DRAFTING', content, draftingRoute: route, requestId: randomUUID(), ...values,
}, service);
const letter = async id => (await call('owner', 'get', { id })).letter;
const submit = async (id, uid = 'writer', service = manage) => call(uid, 'submit', { id, revision: (await letter(id)).revision }, service);
const review = async (uid, id, values = {}, service = manage) => call(uid, 'review', {
  id, revision: (await letter(id)).revision, decision: 'approve', ...values,
}, service);
const snapshot = async collection => (await db.collection(collection).get()).docs
  .map(document => ({ id: document.id, ...document.data() })).sort((a, b) => a.id.localeCompare(b.id));
const persistentState = async () => ({ letters: await snapshot('officialLetters'), counters: await snapshot('draftingCounters'),
  requests: await snapshot('draftingRequests'), numbers: await snapshot('officialLetterNumbers'), settings: await snapshot('officialLetterSettings') });
async function reset() {
  const cleared = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(cleared.ok, true);
  files.clear(); writes.length = 0; rendered.length = 0; currentTime = '2026-11-04T15:10:00.000Z';
  const batch = db.batch();
  for (const [id, adminUid] of [['a', 'owner'], ['b', 'outsider']]) batch.set(db.doc(`companies/${id}`), {
    nameKo: id === 'a' ? '기안 검증 주식회사' : '다른 회사', adminUid, status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z', accessUntil: Timestamp.fromDate(new Date('2030-01-01T00:00:00.000Z')),
  });
  for (const [uid, role, companyId, divisionId, teamId, extra] of [
    ['owner', 'ADMIN', 'a', 'strategy', 'strategy-team', {}], ['admin2', 'ADMIN', 'a', 'strategy', 'strategy-team', {}],
    ['writer', 'MEMBER', 'a', 'strategy', 'strategy-team', {}], ['lead', 'MEMBER', 'a', 'strategy', 'strategy-team', {}],
    ['head', 'SUB_ADMIN', 'a', 'strategy', '', {}], ['co-head', 'SUB_ADMIN', 'a', 'cooperation', '', {}],
    ['second-head', 'SUB_ADMIN', 'a', 'second-cooperation', '', {}], ['peer', 'MEMBER', 'a', 'strategy', 'strategy-team', {}],
    ['unassigned', 'MEMBER', 'a', '', '', {}], ['retired', 'SUB_ADMIN', 'a', 'strategy', '', { status: 'RESIGNED' }],
    ['stopped', 'MEMBER', 'a', 'strategy', 'strategy-team', { status: 'SUSPENDED' }],
    ['outsider', 'ADMIN', 'b', 'foreign-division', 'foreign-team', {}],
    ['foreign-head', 'SUB_ADMIN', 'b', 'foreign-division', '', {}], ['platform', 'SUPER_ADMIN', 'PLATFORM', '', '', {}],
  ]) batch.set(db.doc(`UserProfile/${uid}`), { uid, name: `${uid} 담당자`, role, companyId, divisionId, teamId,
    status: 'ACTIVE', mustChangePassword: false, email: `${uid}@example.invalid`, annualSalary: 99999999, ...extra });
  for (const [id, companyId, name, headId] of [
    ['strategy', 'a', '전략기획본부', 'head'], ['cooperation', 'a', '운영지원본부', 'co-head'],
    ['second-cooperation', 'a', '영업본부', 'second-head'], ['foreign-division', 'b', '타사본부', 'foreign-head'],
  ]) batch.set(db.doc(`divisions/${id}`), { companyId, name, headId });
  batch.set(db.doc('teams/strategy-team'), { companyId: 'a', divisionId: 'strategy', name: '사업기획팀', leaderId: 'lead' });
  batch.set(db.doc('teams/foreign-team'), { companyId: 'b', divisionId: 'foreign-division', name: '타사팀', leaderId: 'outsider' });
  await batch.commit();
}

test('drafting organization, numbering, approval and private PDF boundaries', async t => {
  t.beforeEach(reset);
  try {
    await t.test('rejects anonymous, platform, retired, stopped, expired and password-incomplete creation', async () => {
      for (const [uid, code] of [[null, 'unauthenticated'], ['platform', 'permission-denied'], ['retired', 'permission-denied'], ['stopped', 'permission-denied']]) {
        await denied(save(uid), code);
      }
      await db.doc('UserProfile/writer').update({ mustChangePassword: true });
      await denied(save(), 'failed-precondition');
      await db.doc('UserProfile/writer').update({ mustChangePassword: false, sessionValidAfter: 1 });
      await denied(save(), 'unauthenticated');
      await db.doc('UserProfile/writer').update({ sessionValidAfter: 0 });
      for (const patch of [{ status: 'SUSPENDED' }, { status: 'DELETING' }, { status: 'DELETED' }, { status: 'ACTIVE', accessUntil: Timestamp.fromDate(now()) }]) {
        await db.doc('companies/a').update(patch); await denied(save(), 'permission-denied');
      }
      assert.deepEqual(await snapshot('officialLetters'), []); assert.deepEqual(await snapshot('draftingCounters'), []);
    });

    await t.test('creates a numbered draft without any official template or image and ignores forged company, author and date fields', async () => {
      const saved = await save('writer', headRoute, { companyId: 'b', creatorId: 'outsider', number: '조작 01-999', front: 999,
        issueDate: '2000-01-01', drafting: { draftDate: '2000-01-01', sequence: 999, divisionName: '타사' } });
      const draft = await letter(saved.id);
      assert.equal(draft.documentType, 'DRAFTING'); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.revision, 1);
      assert.equal(draft.companyId, 'a'); assert.equal(draft.creatorId, 'writer'); assert.equal(draft.creatorName, 'writer 담당자');
      assert.equal(draft.number, '전략기획 11-001'); assert.equal(draft.drafting.draftDate, '2026-11-05');
      assert.equal(draft.drafting.sequence, 1); assert.equal(draft.drafting.divisionName, '전략기획본부');
      assert.equal(draft.drafting.teamName, '사업기획팀'); assert.equal(draft.drafting.yearMonth, '202611');
      assert.equal(draft.pdfReady, false); assert.equal(rendered.length, 0); assert.equal(files.size, 0);
      assert.deepEqual(await snapshot('officialLetterSettings'), []);
      const counterId = createHash('sha256').update(JSON.stringify(['a', 'strategy', '202611'])).digest('hex');
      assert.equal((await db.doc(`draftingCounters/${counterId}`).get()).exists, true);
    });

    await t.test('requires an assigned same-company division and rejects forged or inconsistent organization references', async () => {
      await assert.rejects(save('unassigned'));
      for (const patch of [{ divisionId: 'foreign-division' }, { divisionId: 'missing' }, { teamId: 'foreign-team' },
        { divisionId: 'cooperation', teamId: 'strategy-team' }, { divisionId: 'invalid/path' }]) {
        await db.doc('UserProfile/writer').update({ divisionId: 'strategy', teamId: 'strategy-team', ...patch });
        await assert.rejects(save());
      }
      assert.deepEqual(await snapshot('officialLetters'), []); assert.deepEqual(await snapshot('draftingCounters'), []);
    });

    await t.test('drafting organization candidates stay within the authenticated company and expose no salary or personal login fields', async () => {
      const bootstrap = await call('writer', 'draftingBootstrap', { companyId: 'b', creatorId: 'outsider' });
      const serialized = JSON.stringify(bootstrap);
      assert.ok(serialized.includes('전략기획본부')); assert.ok(serialized.includes('운영지원본부'));
      for (const forbidden of ['foreign-head', 'foreign-division', '타사본부', 'annualSalary', '99999999', '@example.invalid']) {
        assert.ok(!serialized.includes(forbidden), `organization candidates must not expose ${forbidden}`);
      }
      await denied(call('stopped', 'draftingBootstrap'), 'permission-denied');
      await denied(call('outsider', 'get', { id: (await save()).id }), 'permission-denied');
    });

    await t.test('an ADMIN without a division can edit and submit on behalf of the creator using the original document organization', async () => {
      const saved = await save();
      await db.doc('UserProfile/owner').update({ divisionId: '', teamId: '' });
      await assert.rejects(call('owner', 'draftingBootstrap'));
      const bootstrap = await call('owner', 'draftingBootstrap', { id: saved.id });
      assert.deepEqual(bootstrap.division, { id: 'strategy', name: '전략기획본부', prefix: '전략기획' });
      assert.deepEqual(bootstrap.team, { id: 'strategy-team', name: '사업기획팀' });
      await denied(call('outsider', 'draftingBootstrap', { id: saved.id }), 'permission-denied');
      await denied(call('peer', 'draftingBootstrap', { id: saved.id }), 'permission-denied');
      await call('owner', 'save', { id: saved.id, revision: 1, documentType: 'DRAFTING', content: { ...content, body: '관리자가 보완한 내용' }, draftingRoute: headRoute });
      await submit(saved.id, 'owner');
      assert.equal((await letter(saved.id)).status, 'PENDING'); assert.equal(rendered.length, 0);
      assert.equal((await letter(saved.id)).creatorId, 'writer');
      assert.equal((await letter(saved.id)).drafting.submittedBy, 'owner');
      assert.equal((await letter(saved.id)).drafting.submittedByName, 'owner 담당자');
      await denied(review('owner', saved.id), 'permission-denied');
      await review('head', saved.id); assert.equal((await letter(saved.id)).status, 'ISSUED');
    });

    await t.test('HEAD final routing places cooperation before the own division head while representative routing preserves the selected hierarchy', async () => {
      const first = await save('writer', { ...headRoute, teamLeader: true, cooperationDivisionIds: ['cooperation', 'second-cooperation'] });
      const headDraft = await letter(first.id);
      assert.deepEqual(headDraft.approvalLine.map(step => step.uid), ['lead', 'co-head', 'second-head', 'head']);
      assert.deepEqual(headDraft.approvalLine.map(step => step.kind), ['TEAM_LEADER', 'COOPERATION', 'COOPERATION', 'DIVISION_HEAD']);
      const second = await save('writer', representativeRoute);
      const representative = await letter(second.id);
      assert.deepEqual(representative.approvalLine.map(step => step.uid), ['lead', 'head', 'co-head', 'owner']);
      assert.equal(representative.approvalLine.at(-1).kind, 'REPRESENTATIVE');
      for (const step of representative.approvalLine) { assert.equal(typeof step.roleLabel, 'string'); assert.ok(step.roleLabel); }
      assert.equal(headDraft.approvalLine[1].divisionId, 'cooperation'); assert.equal(headDraft.approvalLine[1].divisionName, '운영지원본부');
    });

    await t.test('invalid routes, foreign cooperation and an additional ADMIN posing as representative cannot reserve a number', async () => {
      for (const route of [
        { ...headRoute, divisionHead: false }, { ...headRoute, teamLeader: 'true' },
        { ...headRoute, cooperationDivisionIds: ['foreign-division'] }, { ...headRoute, cooperationDivisionIds: ['strategy'] },
        { ...headRoute, cooperationDivisionIds: ['missing'] }, { ...headRoute, cooperationDivisionIds: ['invalid/path'] },
        { ...headRoute, cooperationDivisionIds: 'cooperation' }, { ...headRoute, cooperationDivisionIds: ['cooperation', 'cooperation'] },
        { ...headRoute, cooperationDivisionIds: ['one', 'two', 'three', 'four', 'five', 'six'] },
      ]) await assert.rejects(save('writer', route));
      await db.doc('companies/a').update({ adminUid: 'outsider' });
      await assert.rejects(save('writer', representativeRoute));
      await db.doc('companies/a').update({ adminUid: 'peer' });
      await assert.rejects(save('writer', representativeRoute));
      assert.deepEqual(await snapshot('officialLetters'), []); assert.deepEqual(await snapshot('draftingCounters'), []);
    });

    await t.test('browser-supplied member or representative UIDs cannot replace actual organization responsibility references', async () => {
      for (const injected of [{ teamLeaderUid: 'peer' }, { divisionHeadUid: 'peer' }, { cooperationHeadIds: ['peer'] }, { representativeUid: 'admin2' }]) {
        await denied(save('writer', { ...representativeRoute, ...injected }), 'invalid-argument');
      }
      const saved = await save('writer', representativeRoute, { approvalLine: [{ uid: 'peer', kind: 'REPRESENTATIVE' }] });
      assert.deepEqual((await letter(saved.id)).approvalLine.map(step => step.uid), ['lead', 'head', 'co-head', 'owner']);
      const legitimate = await save('writer', headRoute);
      await db.doc('divisions/strategy').update({ headId: 'peer' });
      const changed = await save('writer', headRoute);
      assert.deepEqual((await letter(changed.id)).approvalLine.map(step => step.uid), ['peer'], 'a formally appointed MEMBER may hold a division-head position');
      await submit(changed.id); await review('peer', changed.id); assert.equal((await letter(changed.id)).status, 'ISSUED');
      await denied(submit(legitimate.id), 'failed-precondition');
    });

    await t.test('inactive or foreign organization responsibility references fail closed', async () => {
      for (const headId of ['retired', 'foreign-head', 'missing']) {
        await db.doc('divisions/strategy').update({ headId }); await assert.rejects(save());
      }
      await db.doc('divisions/strategy').update({ headId: 'head' });
      for (const leaderId of ['retired', 'foreign-head', 'missing']) {
        await db.doc('teams/strategy-team').update({ leaderId }); await assert.rejects(save('writer', { ...headRoute, teamLeader: true }));
      }
      assert.deepEqual(await snapshot('officialLetters'), []);
    });

    await t.test('a repeated creation request is idempotent and conflicting content or route cannot consume another sequence', async () => {
      const requestId = randomUUID();
      const first = await save('writer', headRoute, { requestId });
      const before = await persistentState();
      const repeated = await save('writer', headRoute, { requestId });
      assert.equal(repeated.id, first.id); assert.deepEqual(await persistentState(), before);
      const normalizedRetry = await save('writer', headRoute, { requestId: requestId.toUpperCase(), content: {
        ...content, title: `  ${content.title}  `, body: ` ${content.body} `,
      } });
      assert.equal(normalizedRetry.id, first.id); assert.deepEqual(await persistentState(), before);
      await denied(save('writer', headRoute, { requestId, content: { ...content, title: '서로 다른 요청' } }), 'already-exists');
      await denied(save('writer', representativeRoute, { requestId }), 'already-exists');
      assert.deepEqual(await persistentState(), before);
      const next = await save(); assert.equal((await letter(next.id)).number, '전략기획 11-002');
      const other = await save('peer', headRoute, { requestId }); assert.notEqual(other.id, first.id);
    });

    await t.test('new drafting requests validate UUIDs and content before any reservation and keep the document type immutable', async () => {
      for (const requestId of [undefined, '', 'not-a-uuid', '../../request', 1]) await denied(save('writer', headRoute, { requestId }), 'invalid-argument');
      for (const invalidContent of [{ ...content, title: '' }, { ...content, body: '' }, { ...content, title: 'x'.repeat(201) }]) {
        await denied(save('writer', headRoute, { content: invalidContent }), 'invalid-argument');
      }
      assert.deepEqual(await snapshot('draftingCounters'), []);
      const saved = await save();
      await denied(call('writer', 'save', { id: saved.id, revision: 1, documentType: 'OFFICIAL', content }), 'invalid-argument');
    });

    await t.test('concurrent same-request clicks create exactly one draft and concurrent distinct requests receive unique division sequences', async () => {
      const requestId = randomUUID(); const duplicates = await Promise.all(Array.from({ length: 3 }, () => save('writer', headRoute, { requestId })));
      assert.equal(new Set(duplicates.map(result => result.id)).size, 1);
      const distinct = await Promise.all(Array.from({ length: 4 }, () => save()));
      const created = await Promise.all(distinct.map(result => letter(result.id)));
      assert.deepEqual(created.map(value => value.drafting.sequence).sort((a, b) => a - b), [2, 3, 4, 5]);
      assert.equal(new Set(created.map(value => value.number)).size, 4);
      assert.equal((await snapshot('officialLetters')).length, 5);
    });

    await t.test('three-digit presentation continues at 1000 and corrupt or unsafe counter values never allocate a number', async () => {
      const counterId = createHash('sha256').update(JSON.stringify(['a', 'strategy', '202611'])).digest('hex');
      const counter = db.doc(`draftingCounters/${counterId}`);
      const values = { companyId: 'a', divisionId: 'strategy', yearMonth: '202611' };
      await counter.set({ ...values, lastSequence: 998 });
      assert.equal((await letter((await save()).id)).number, '전략기획 11-999');
      assert.equal((await letter((await save()).id)).number, '전략기획 11-1000');
      for (const lastSequence of [-1, 1.5, Number.MAX_SAFE_INTEGER, Number.NaN]) {
        await counter.set({ ...values, lastSequence }); const before = await persistentState();
        await assert.rejects(save()); assert.deepEqual(await persistentState(), before);
      }
    });

    await t.test('Korean month and year changes reset only the matching company and division counter while issued numbers stay fixed', async () => {
      currentTime = '2026-10-31T14:59:59.999Z'; const october = await save();
      assert.equal((await letter(october.id)).number, '전략기획 10-001');
      currentTime = '2026-10-31T15:00:00.000Z'; const november = await save();
      assert.equal((await letter(november.id)).number, '전략기획 11-001');
      currentTime = '2026-12-31T15:00:00.000Z'; const january = await save();
      assert.equal((await letter(january.id)).number, '전략기획 01-001');
      await submit(october.id); await review('head', october.id);
      assert.equal((await letter(october.id)).number, '전략기획 10-001');
      assert.equal((await letter(october.id)).drafting.draftDate, '2026-10-31');
      assert.equal((await snapshot('draftingCounters')).length, 3);
      assert.deepEqual(await snapshot('officialLetterSettings'), []);
    });

    await t.test('creation captures one timestamp so a Korean midnight crossing cannot split its number month and saved draft date', async () => {
      let calls = 0;
      const crossing = createService({ now: () => new Date(calls++ < 2 ? '2026-10-31T14:59:59.999Z' : '2026-10-31T15:00:00.000Z') });
      const saved = await save('writer', headRoute, {}, crossing); const draft = await letter(saved.id);
      assert.equal(draft.createdAt, '2026-10-31T14:59:59.999Z'); assert.equal(draft.drafting.draftDate, '2026-10-31');
      assert.equal(draft.drafting.yearMonth, '202610'); assert.equal(draft.number, '전략기획 10-001');
      const counter = (await snapshot('draftingCounters'))[0]; assert.equal(counter.yearMonth, '202610');
    });

    await t.test('number sequences are isolated by company and immutable division ID', async () => {
      const own = await save();
      await db.doc('teams/cooperation-team').set({ companyId: 'a', divisionId: 'cooperation', name: '협조본부팀', leaderId: 'second-head' });
      await db.doc('UserProfile/peer').update({ divisionId: 'cooperation', teamId: 'cooperation-team' });
      const otherDivision = await save('peer'); const otherCompany = await save('outsider');
      assert.equal((await letter(own.id)).drafting.sequence, 1);
      assert.equal((await letter(otherDivision.id)).number, '운영지원 11-001');
      const foreign = (await call('outsider', 'get', { id: otherCompany.id })).letter;
      assert.equal(foreign.companyId, 'b'); assert.equal(foreign.drafting.sequence, 1);
      const counters = await snapshot('draftingCounters'); assert.equal(counters.length, 3);
      await db.doc('divisions/strategy').update({ name: '이름변경본부' });
      const renamed = await save();
      assert.equal((await letter(renamed.id)).number, '이름변경 11-002');
      assert.equal((await letter(own.id)).number, '전략기획 11-001');
      assert.equal((await snapshot('draftingCounters')).length, 3);
    });

    await t.test('created author and organization labels remain frozen after profile and organization names change', async () => {
      const saved = await save();
      await db.doc('UserProfile/writer').update({ name: '이름변경 작성자' });
      await db.doc('divisions/strategy').update({ name: '이름변경본부' });
      await db.doc('teams/strategy-team').update({ name: '이름변경팀' });
      await submit(saved.id); await review('head', saved.id);
      const issued = await letter(saved.id);
      assert.equal(issued.creatorName, 'writer 담당자'); assert.equal(issued.drafting.divisionName, '전략기획본부');
      assert.equal(issued.drafting.teamName, '사업기획팀'); assert.equal(issued.number, '전략기획 11-001');
      assert.equal(typeof issued.drafting.submittedAt, 'string');
    });

    await t.test('only the next selected approver may approve or reject, and HEAD approval issues immediately without ADMIN approval or a seal', async () => {
      const saved = await save('writer', { ...headRoute, teamLeader: true }); await submit(saved.id);
      for (const uid of ['writer', 'head', 'owner', 'admin2', 'peer', 'outsider']) await denied(review(uid, saved.id), 'permission-denied');
      await denied(review('owner', saved.id, { decision: 'reject', reason: '관리자 우회' }), 'permission-denied');
      assert.equal((await letter(saved.id)).permissions.canFinalApprove, false);
      await review('lead', saved.id);
      const headView = (await call('head', 'get', { id: saved.id })).letter;
      assert.equal(headView.permissions.canFinalApprove, true);
      const issued = await review('head', saved.id);
      assert.equal(issued.pdfReady, true); const final = await letter(saved.id);
      assert.equal(final.status, 'ISSUED'); assert.equal(final.approvedBy, 'head'); assert.equal(final.approvedRevision, 1);
      assert.notEqual(final.automaticApproval, true); assert.equal(rendered.length, 1); assert.equal(final.number, '전략기획 11-001');
      assert.ok(files.has(final.pdf.path)); assert.match(final.pdf.path, /^companies\/a\/official-pdfs\//);
      assert.equal((await db.doc('officialLetterSettings/a').get()).exists, false);
      assert.deepEqual(await snapshot('officialLetterNumbers'), []);
      const downloaded = await call('writer', 'pdf', { id: saved.id, revision: 1 });
      assert.equal(Buffer.from(downloaded.base64, 'base64').toString(), '%PDF drafting approved'); assert.equal(rendered.length, 1);
    });

    await t.test('representative approval waits for the selected cooperation head and a representative author must explicitly approve their own step', async () => {
      const saved = await save('owner', representativeRoute); await submit(saved.id, 'owner');
      const pending = await letter(saved.id); assert.equal(pending.status, 'PENDING'); assert.equal(rendered.length, 0);
      await denied(review('owner', saved.id), 'permission-denied');
      await review('lead', saved.id); await review('head', saved.id);
      await denied(review('owner', saved.id), 'permission-denied');
      await review('co-head', saved.id); await review('owner', saved.id);
      assert.equal((await letter(saved.id)).status, 'ISSUED'); assert.equal((await letter(saved.id)).approvedBy, 'owner');
      assert.equal(rendered.length, 1);
    });

    await t.test('a creator who is the division head may explicitly approve their selected final step without an automatic approval', async () => {
      const saved = await save('head'); await submit(saved.id, 'head');
      assert.equal((await letter(saved.id)).status, 'PENDING'); assert.equal(rendered.length, 0);
      const selfView = (await call('head', 'get', { id: saved.id })).letter;
      assert.equal(selfView.permissions.canReview, true); assert.equal(selfView.permissions.canFinalApprove, true);
      await review('head', saved.id);
      assert.equal((await letter(saved.id)).status, 'ISSUED'); assert.equal(rendered.length, 1);
    });

    await t.test('drafting notifications follow the chosen steps without broadening the legacy MEMBER management inbox', async () => {
      const saved = await save('writer', representativeRoute); await submit(saved.id);
      const inbox = async uid => (await db.doc(`officialLetterNotifications/${uid}/items/${saved.id}`).get()).data();
      assert.equal((await inbox('lead')).requiresAction, true); assert.equal((await inbox('lead')).documentType, 'DRAFTING');
      assert.equal(await inbox('owner'), undefined);
      await denied(call('lead', 'approvals'), 'permission-denied');
      assert.ok((await call('lead', 'list')).letters.some(entry => entry.id === saved.id));
      await review('lead', saved.id); assert.equal((await inbox('head')).requiresAction, true);
      await review('head', saved.id); assert.equal((await inbox('co-head')).requiresAction, true);
      await review('co-head', saved.id); assert.equal((await inbox('owner')).requiresAction, true);
      await review('owner', saved.id);
      for (const uid of ['writer', 'lead', 'head', 'co-head', 'owner']) {
        const item = await inbox(uid); assert.equal(item.event, 'ISSUED'); assert.equal(item.requiresAction, false);
        assert.equal(item.documentType, 'DRAFTING'); assert.equal(item.companyId, 'a');
      }
      assert.equal(await inbox('outsider'), undefined);
    });

    await t.test('the same person holding several selected positions appears once at the highest final position', async () => {
      await db.doc('teams/strategy-team').update({ leaderId: 'head' });
      await db.doc('divisions/cooperation').update({ headId: 'head' });
      const saved = await save('writer', { ...headRoute, teamLeader: true, cooperationDivisionIds: ['cooperation'] });
      const draft = await letter(saved.id);
      assert.deepEqual(draft.approvalLine.map(step => step.uid), ['head']); assert.equal(draft.approvalLine[0].kind, 'DIVISION_HEAD');
      await submit(saved.id); await review('head', saved.id); assert.equal((await letter(saved.id)).status, 'ISSUED');
    });

    await t.test('revoked membership or company readiness is checked again at approval and PDF download', async () => {
      const saved = await save(); await submit(saved.id);
      for (const patch of [{ status: 'RESIGNED' }, { status: 'SUSPENDED' }, { companyId: 'b' }]) {
        const original = (await db.doc('UserProfile/head').get()).data(); await db.doc('UserProfile/head').update(patch);
        try { await denied(review('head', saved.id), 'permission-denied'); }
        finally { await db.doc('UserProfile/head').set(original); }
      }
      await review('head', saved.id);
      await db.doc('UserProfile/writer').update({ status: 'RESIGNED' });
      await denied(call('writer', 'pdf', { id: saved.id, revision: 1 }), 'permission-denied');
      await denied(call('outsider', 'get', { id: saved.id }), 'permission-denied');
      await denied(call('outsider', 'pdf', { id: saved.id, revision: 1 }), 'permission-denied');
    });

    await t.test('rejection, resubmission and an issued revision preserve the original reserved number and archived PDF', async () => {
      const saved = await save('writer', { ...headRoute, teamLeader: true }); await submit(saved.id);
      await review('lead', saved.id, { decision: 'reject', reason: '추가 설명 필요' });
      assert.equal((await letter(saved.id)).status, 'REJECTED'); await submit(saved.id);
      await review('lead', saved.id); await review('head', saved.id);
      const original = await letter(saved.id); const counters = await snapshot('draftingCounters');
      currentTime = '2026-12-01T00:00:00.000Z';
      await denied(call('writer', 'save', { id: saved.id, revision: 1, documentType: 'DRAFTING', content, draftingRoute: headRoute }), 'permission-denied');
      await call('owner', 'save', { id: saved.id, revision: 1, documentType: 'DRAFTING', content: { ...content, body: '개정된 기안 본문' },
        draftingRoute: { ...headRoute, teamLeader: true } });
      const revised = await letter(saved.id); assert.equal(revised.status, 'DRAFT'); assert.equal(revised.number, original.number);
      assert.deepEqual(revised.drafting.draftDate, original.drafting.draftDate); assert.deepEqual(await snapshot('draftingCounters'), counters);
      assert.equal(revised.drafting.submittedAt, null); assert.equal(revised.drafting.submittedBy, null); assert.equal(revised.drafting.submittedByName, null);
      await denied(call('writer', 'pdf', { id: saved.id, revision: 2 }), 'failed-precondition');
      const archives = (await call('owner', 'history', { id: saved.id })).history;
      assert.equal(archives.length, 1); assert.equal(archives[0].number, original.number); assert.ok(files.has(archives[0].pdf.path));
      await submit(saved.id); await review('lead', saved.id); await review('head', saved.id);
      assert.equal((await letter(saved.id)).number, original.number); assert.equal((await letter(saved.id)).approvedRevision, 2);
      assert.deepEqual(await snapshot('draftingCounters'), counters);
      await call('owner', 'deleteHistory', { id: saved.id, revision: 2, historyId: archives[0].historyId });
      assert.equal(files.has(archives[0].pdf.path), false); assert.equal(files.has((await letter(saved.id)).pdf.path), true);
    });

    await t.test('duplicate final clicks cannot issue twice or allocate a new number', async () => {
      const saved = await save(); await submit(saved.id); const counters = await snapshot('draftingCounters');
      const results = await Promise.allSettled([review('head', saved.id), review('head', saved.id)]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal((await letter(saved.id)).status, 'ISSUED'); assert.deepEqual(await snapshot('draftingCounters'), counters);
      assert.equal((await snapshot('officialLetters')).length, 1);
    });

    await t.test('deletion retains the numbering request reservation so a removed draft cannot be recreated with the same key', async () => {
      const requestId = randomUUID(); const saved = await save('writer', headRoute, { requestId }); await submit(saved.id); await review('head', saved.id);
      const counters = await snapshot('draftingCounters'); const requests = await snapshot('draftingRequests');
      await call('owner', 'deleteIssued', { id: saved.id, revision: 1, confirm: true }, manage,
        { auth_time: now().getTime() / 1000, firebase: { sign_in_provider: 'password' } });
      assert.equal((await db.doc(`officialLetters/${saved.id}`).get()).data().status, 'DELETED');
      assert.deepEqual(await snapshot('draftingCounters'), counters); assert.deepEqual(await snapshot('draftingRequests'), requests);
      await assert.rejects(save('writer', headRoute, { requestId }));
      const next = await save(); assert.equal((await letter(next.id)).number, '전략기획 11-002');
    });

    await t.test('real drafting PDF rendering works without image storage and embeds the saved author, approver and form fields', async () => {
      for (const submitter of ['writer', 'owner']) {
        const saved = await save(); await submit(saved.id, submitter);
        const drawnText = [];
        const pdfService = createService({ renderPdf: async (...args) => {
          const prototype = require('pdfkit').prototype;
          const original = prototype.text;
          prototype.text = function (...values) { drawnText.push(String(values[0])); return original.apply(this, values); };
          try { return await renderOfficialLetterPdf(...args); }
          finally { prototype.text = original; }
        } });
        const result = await review('head', saved.id, {}, pdfService);
        assert.equal(result.pdfReady, true);
        const issued = await letter(saved.id); const bytes = files.get(issued.pdf.path);
        assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(bytes.length > 5000);
        assert.match(bytes.toString('latin1'), /\/MediaBox\s*\[0 0 595\.28 841\.89\]/);
        assert.match(bytes.toString('latin1'), /\/PrintScaling\s*\/None\b/);
        assert.match(bytes.toString('latin1'), /\/Count\s+1\b/);
        assert.doesNotMatch(bytes.toString('latin1'), /\/Subtype\s*\/Image\b/);
        assert.equal(issued.creatorName, 'writer 담당자'); assert.equal(issued.approvalLine.at(-1).name, 'head 담당자');
        assert.equal(issued.drafting.submittedBy, submitter); assert.equal(issued.drafting.submittedByName, `${submitter} 담당자`);
        const written = drawnText.join('\n');
        for (const value of ['기안일자', '문서번호', '내부품의', '보존년한', '3년', '담당', '본부장', 'writer 담당자', 'head 담당자',
          '2026. 11. 05', issued.number, content.title, content.body, content.cooperationNote]) assert.ok(written.includes(value), `PDF must draw ${value}`);
        for (const omitted of ['대표이사', '협조본부장', '팀장']) assert.ok(!drawnText.includes(omitted), 'only selected approval positions are drawn');
        assert.equal(written.includes('(대리제출: owner 담당자)'), submitter === 'owner');
      }
    });

    await t.test('drafting counters and idempotency reservations deny every direct browser operation including platform administrator access', async () => {
      const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
      const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, Timestamp: ClientTimestamp } = await import('firebase/firestore');
      const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
      const environment = await initializeTestEnvironment({ projectId: 'demo-hr-flow-drafting-rules',
        firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } });
      try {
        await environment.clearFirestore();
        await environment.withSecurityRulesDisabled(async context => {
          const store = context.firestore();
          for (const id of ['a', 'b']) await setDoc(doc(store, `companies/${id}`), { status: 'ACTIVE', accessUntil: ClientTimestamp.fromDate(new Date('2030-01-01')) });
          for (const [uid, role, companyId] of [['browser-member', 'MEMBER', 'a'], ['browser-admin', 'ADMIN', 'a'],
            ['browser-foreign', 'ADMIN', 'b'], ['browser-platform', 'SUPER_ADMIN', 'PLATFORM']]) {
            await setDoc(doc(store, `UserProfile/${uid}`), { uid, role, companyId, status: 'ACTIVE', mustChangePassword: false });
          }
          for (const name of ['draftingCounters', 'draftingRequests']) await setDoc(doc(store, `${name}/reserved`), { companyId: 'a' });
        });
        for (const uid of ['browser-member', 'browser-admin', 'browser-foreign', 'browser-platform']) {
          const store = environment.authenticatedContext(uid).firestore();
          await assertSucceeds(getDoc(doc(store, `UserProfile/${uid}`)));
          for (const name of ['draftingCounters', 'draftingRequests']) {
            const existing = doc(store, `${name}/reserved`);
            await assertFails(getDoc(existing)); await assertFails(getDocs(collection(store, name)));
            await assertFails(setDoc(doc(store, `${name}/new`), { companyId: 'a' }));
            await assertFails(updateDoc(existing, { companyId: 'b' })); await assertFails(deleteDoc(existing));
          }
        }
      } finally { await environment.cleanup(); }
    });
  } finally { await deleteApp(app); }
});
