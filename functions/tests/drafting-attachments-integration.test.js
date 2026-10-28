const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createOfficialLetterService } = require('../official-letter-service');
const { createAttachmentService, MAX_BYTES } = require('../attachment-service');

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('A loopback FIRESTORE_EMULATOR_HOST is required; production tests are prohibited.');
}
process.env.METADATA_SERVER_DETECTION = 'none';
const projectId = 'demo-hr-flow-draft-attachments';
const app = initializeApp({ projectId }, 'drafting-attachments-integration-test');
const db = getFirestore(app);
const clock = new Date('2026-10-28T03:00:00.000Z');
const now = () => new Date(clock);
const pdf = Buffer.from('%PDF-1.7\nquotation fixture\n%%EOF');
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const files = new Map(), writes = [], deletes = [], verifications = [];
const hooks = { afterSave: null, afterDownload: null };
const bucket = {
  name: 'drafting-attachments-fixture.invalid',
  deleteFiles: async ({ prefix }) => {
    deletes.push(prefix);
    for (const name of files.keys()) if (name.startsWith(prefix)) files.delete(name);
  },
  file: name => ({
    name,
    save: async (bytes, options = {}) => {
      if (options.preconditionOpts?.ifGenerationMatch === 0 && files.has(name)) {
        throw Object.assign(new Error('immutable object already exists'), { code: 412 });
      }
      files.set(name, { bytes: Buffer.from(bytes), metadata: {
        ...options.metadata, size: String(bytes.length), generation: '1',
        metadata: { ...options.metadata?.metadata },
      } });
      writes.push({ name, options: structuredClone(options) });
      if (hooks.afterSave) await hooks.afterSave(name);
    },
    getMetadata: async () => {
      const file = files.get(name);
      if (!file) throw Object.assign(new Error('missing fixture object'), { code: 404 });
      return [structuredClone(file.metadata)];
    },
    download: async () => {
      const file = files.get(name);
      if (!file) throw Object.assign(new Error('missing fixture object'), { code: 404 });
      const bytes = Buffer.from(file.bytes);
      if (hooks.afterDownload) await hooks.afterDownload(name);
      return [bytes];
    },
    delete: async () => { files.delete(name); },
    exists: async () => [files.has(name)],
  }),
};
const auth = { verifyIdToken: async (token, checkRevoked) => {
  verifications.push({ token, checkRevoked });
  if (!token.startsWith('fixture:') || token === 'fixture:revoked') throw new Error('invalid fixture token');
  return { uid: token.slice(8), auth_time: clock.getTime() / 1000 };
} };
const manage = createOfficialLetterService({ db, bucket, now,
  renderPdf: async () => Buffer.from('%PDF-1.7\nissued drafting fixture\n%%EOF'),
});
const attachments = createAttachmentService({ db, auth, bucket, now });
const token = { auth_time: clock.getTime() / 1000, firebase: { sign_in_provider: 'password' } };
const call = (uid, action, data = {}) => manage({ ...(uid ? { auth: { uid, token } } : {}), data: { action, ...data } });
const content = { title: '견적서 첨부 기안', body: '타업체 견적서 검토를 요청합니다.', attachments: '', cooperationNote: '' };
const route = { teamLeader: false, divisionHead: true, cooperationDivisionIds: [], representative: false };
const save = (uid = 'writer', values = {}) => call(uid, 'save', { documentType: 'DRAFTING', content,
  draftingRoute: route, requestId: randomUUID(), ...values });
const load = async id => (await call('admin', 'get', { id })).letter;
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const create = async (uid = 'writer', values = {}) => (await save(uid, values)).id;
const edit = async (id, attachmentFiles, uid = 'writer', extra = {}) => {
  const letter = await load(id);
  return save(uid, { id, revision: letter.revision, content: { ...letter.content, attachmentFiles }, ...extra });
};
const issue = async id => {
  let letter = await load(id);
  await call('writer', 'submit', { id, revision: letter.revision });
  letter = await load(id);
  await call('head', 'review', { id, revision: letter.revision, decision: 'approve' });
  return load(id);
};
async function http(action, uid = 'writer', query = {}, overrides = {}) {
  const headers = { Authorization: uid ? `Bearer fixture:${uid}` : '', Origin: 'https://hr-flow.pages.dev',
    'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('외부업체 견적서.pdf'), ...overrides.headers };
  const req = { method: action === 'upload' ? 'POST' : 'GET', query: { category: 'drafting', ...query },
    rawBody: pdf, ...overrides,
    get: key => Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1],
  };
  const res = { statusCode: 200, headers: {}, body: undefined,
    set(key, value) { this.headers[key.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await attachments[action](req, res); return res;
}
async function stage(requestId, uid = 'writer', query = {}, overrides = {}) {
  const response = await http('upload', uid, { requestId, ...query }, overrides);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.equal(typeof response.body.id, 'string');
  return response.body;
}
const download = (id, file, uid = 'writer', query = {}) => http('download', uid,
  { documentId: id, revision: '1', attachmentId: file.id, ...query });
const scope = (uid, requestId, companyId = 'a') => createHash('sha256').update(JSON.stringify([companyId, uid, requestId.toLowerCase()])).digest('hex');
async function reset() {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
  files.clear(); writes.length = 0; deletes.length = 0; verifications.length = 0;
  hooks.afterSave = null; hooks.afterDownload = null;
  const batch = db.batch();
  for (const [id, adminUid] of [['a', 'admin'], ['b', 'foreign']]) batch.set(db.doc(`companies/${id}`), {
    status: 'ACTIVE', adminUid, nameKo: `첨부 검증회사 ${id}`, accessUntil: Timestamp.fromDate(new Date('2030-01-01T00:00:00Z')),
  });
  for (const [uid, role, companyId, divisionId, status] of [
    ['writer', 'MEMBER', 'a', 'strategy', 'ACTIVE'], ['peer', 'MEMBER', 'a', 'strategy', 'ACTIVE'],
    ['head', 'SUB_ADMIN', 'a', 'strategy', 'ACTIVE'], ['nonparticipant', 'SUB_ADMIN', 'a', 'strategy', 'ACTIVE'],
    ['admin', 'ADMIN', 'a', '', 'ACTIVE'], ['foreign', 'ADMIN', 'b', 'foreign', 'ACTIVE'],
    ['retired', 'MEMBER', 'a', 'strategy', 'RESIGNED'], ['stopped', 'MEMBER', 'a', 'strategy', 'SUSPENDED'],
  ]) batch.set(db.doc(`UserProfile/${uid}`), { uid, name: `${uid} 담당자`, role, companyId, divisionId,
    teamId: '', status, mustChangePassword: false });
  batch.set(db.doc('UserProfile/platform'), { uid: 'platform', role: 'SUPER_ADMIN', companyId: 'PLATFORM', status: 'ACTIVE' });
  batch.set(db.doc('divisions/strategy'), { companyId: 'a', name: '전략기획본부', headId: 'head' });
  batch.set(db.doc('divisions/foreign'), { companyId: 'b', name: '다른본부', headId: 'foreign' });
  await batch.commit();
}

test('drafting attachments retain document revision, private ACL and immutable provenance', async t => {
  t.beforeEach(reset);
  try {
    await t.test('stages PDF and image originals privately and save uses server metadata rather than browser descriptors', async () => {
      const requestId = randomUUID();
      const quotation = await stage(requestId);
      const image = await stage(requestId, 'writer', {}, { rawBody: png,
        headers: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('비교 견적.png') } });
      assert.equal(Object.hasOwn(quotation, 'path'), false);
      assert.equal(quotation.contentType, 'application/pdf'); assert.equal(quotation.size, pdf.length);
      assert.ok(writes.every(write => write.name.startsWith(`companies/a/drafting-attachments/${scope('writer', requestId)}/`)));
      assert.ok(writes.every(write => write.options.preconditionOpts.ifGenerationMatch === 0));
      assert.ok(writes.every(write => write.options.metadata.cacheControl === 'private, no-store'));
      assert.ok(writes.every(write => !JSON.stringify(write.options).includes('firebaseStorageDownloadTokens')));
      const id = await create('writer', { requestId, companyId: 'b', content: { ...content, attachmentFiles: [
        { ...quotation, name: '위조 명칭.html', contentType: 'text/html', size: 1, path: 'companies/b/stolen' }, image,
      ] } });
      const letter = await load(id);
      assert.equal(letter.companyId, 'a'); assert.equal(letter.drafting.attachmentScope, scope('writer', requestId));
      assert.deepEqual(letter.content.attachmentFiles, [quotation, image]);
      const response = await download(id, quotation);
      assert.equal(response.statusCode, 200); assert.deepEqual(response.body, pdf);
      assert.equal(response.headers['content-type'], 'application/pdf');
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.ok(response.headers['content-disposition'].startsWith('attachment;'));
      assert.ok(verifications.every(value => value.checkRevoked === true));
    });

    await t.test('download ACL grants exact participants and company ADMIN while same-division managers and foreign accounts are blocked', async () => {
      const requestId = randomUUID(), file = await stage(requestId);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
      for (const uid of ['writer', 'head', 'admin']) {
        const response = await download(id, file, uid); assert.equal(response.statusCode, 200, uid);
      }
      for (const uid of ['peer', 'nonparticipant', 'foreign', 'retired', 'stopped', 'platform', null, 'revoked']) {
        const response = await download(id, file, uid); assert.ok([401, 403].includes(response.statusCode), uid);
        assert.ok(!Buffer.isBuffer(response.body), uid);
      }
      await db.doc('UserProfile/writer').update({ mustChangePassword: true });
      assert.equal((await download(id, file)).statusCode, 403);
    });

    await t.test('staging rejects invalid identities and never accepts company ID or request ownership injection', async () => {
      const requestId = randomUUID(), file = await stage(requestId, 'writer', { companyId: 'b' });
      assert.ok([...files.keys()].every(name => name.startsWith('companies/a/')));
      for (const uid of [null, 'platform', 'retired', 'stopped', 'revoked']) {
        const response = await http('upload', uid, { requestId }); assert.ok([401, 403].includes(response.statusCode), uid);
      }
      for (const requestId of ['', 'not-a-uuid', '../request']) assert.equal((await http('upload', 'writer', { requestId })).statusCode, 400);
      await assert.rejects(save('peer', { requestId, content: { ...content, attachmentFiles: [file] } }));
      await assert.rejects(save('foreign', { requestId, content: { ...content, attachmentFiles: [file] } }));
      assert.equal((await db.collection('officialLetters').get()).size, 0);
      assert.equal((await db.collection('draftingCounters').get()).size, 0);
    });

    await t.test('malformed IDs, arbitrary storage references and request-to-document reuse cannot attach another original', async () => {
      const requestId = randomUUID(), file = await stage(requestId);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
      const different = await create();
      await assert.rejects(edit(different, [file]));
      await assert.rejects(save('writer', { content: { ...content, attachmentFiles: [file] } }));
      for (const input of [null, 'companies/a/drafting-attachments/stolen', [{ path: writes[0].name }],
        [{ id: '../stolen' }], [{ id: randomUUID() }], [file, file]]) {
        await assert.rejects(edit(id, input));
      }
      for (const query of [{ attachmentId: '../stolen' }, { documentId: '../letter' }, { attachmentId: randomUUID() }]) {
        assert.ok([400, 403, 404].includes((await download(id, file, 'writer', query)).statusCode));
      }
      const initial = await load(id);
      assert.deepEqual(initial.content.attachmentFiles, [file]); assert.equal(initial.revision, 1);
    });

    await t.test('upload validates byte signature, MIME, extension and the individual 10MB boundary', async () => {
      const requestId = randomUUID();
      for (const overrides of [
        { rawBody: Buffer.from('<html>unsafe</html>') },
        { rawBody: png, headers: { 'Content-Type': 'application/pdf' } },
        { headers: { 'Content-Type': 'image/svg+xml', 'X-File-Name': 'quotation.svg' } },
        { headers: { 'X-File-Name': 'quotation.html' } },
        { rawBody: Buffer.alloc(0) },
        { rawBody: Buffer.concat([pdf, Buffer.alloc(MAX_BYTES + 1 - pdf.length)]) },
      ]) {
        const response = await http('upload', 'writer', { requestId }, overrides);
        assert.ok([400, 413].includes(response.statusCode), JSON.stringify(response.body));
      }
      assert.equal(files.size, 0);
      const exact = Buffer.concat([pdf, Buffer.alloc(MAX_BYTES - pdf.length)]);
      const accepted = await stage(requestId, 'writer', {}, { rawBody: exact });
      assert.equal(accepted.size, MAX_BYTES);
      const longName = await stage(requestId, 'writer', {}, {
        headers: { 'X-File-Name': encodeURIComponent(`${'견적'.repeat(125)}.pdf`) },
      });
      assert.equal(Array.from(longName.name).length, 240);
      assert.ok(longName.name.endsWith('.pdf'));
    });

    await t.test('saved attachment set is capped at five files and 30MB total before reserving a document number', async () => {
      const requestId = randomUUID(), small = [];
      for (let i = 0; i < 6; i++) small.push(await stage(requestId));
      await assert.rejects(save('writer', { requestId, content: { ...content, attachmentFiles: small } }));
      assert.equal((await db.collection('draftingCounters').get()).size, 0);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: small.slice(0, 5) } });
      assert.equal((await load(id)).content.attachmentFiles.length, 5);
      const largeRequest = randomUUID(), large = [], bytes = Buffer.concat([pdf, Buffer.alloc(MAX_BYTES - pdf.length)]);
      for (let i = 0; i < 4; i++) large.push(await stage(largeRequest, 'writer', {}, { rawBody: bytes }));
      await assert.rejects(save('writer', { requestId: largeRequest, content: { ...content, attachmentFiles: large } }));
      const maximum = await create('writer', { requestId: largeRequest, content: { ...content, attachmentFiles: large.slice(0, 3) } });
      assert.equal((await load(maximum)).content.attachmentFiles.reduce((sum, item) => sum + item.size, 0), 30 * 1024 * 1024);
    });

    await t.test('creation retry keeps one document and the exact attachment set in its request fingerprint', async () => {
      const requestId = randomUUID(), first = await stage(requestId), second = await stage(requestId);
      const values = { requestId, content: { ...content, attachmentFiles: [first] } };
      const saved = await save('writer', values), repeated = await save('writer', { ...values, requestId: requestId.toUpperCase() });
      assert.equal(saved.id, repeated.id);
      assert.equal((await http('upload', 'writer', { requestId })).statusCode, 403, 'consumed new-document request cannot stage another object');
      await denied(save('writer', { ...values, content: { ...content, attachmentFiles: [second] } }), 'already-exists');
      assert.equal((await db.collection('officialLetters').get()).size, 1);
      assert.equal((await load(saved.id)).drafting.sequence, 1);
      assert.deepEqual((await load(saved.id)).content.attachmentFiles, [first]);
    });

    await t.test('existing-draft upload binds current revision and only the creator or ADMIN may add originals', async () => {
      const id = await create();
      for (const uid of ['head', 'nonparticipant', 'peer', 'foreign']) {
        const response = await http('upload', uid, { documentId: id, revision: '1' });
        assert.ok([401, 403].includes(response.statusCode), uid);
      }
      for (const revision of ['', '0', '1.5', '2', '../1']) {
        const response = await http('upload', 'writer', { documentId: id, revision });
        assert.ok([400, 403, 409].includes(response.statusCode), revision);
      }
      const response = await http('upload', 'writer', { documentId: id, revision: '1' });
      assert.equal(response.statusCode, 200);
      const file = response.body;
      await edit(id, [file]);
      assert.equal((await load(id)).revision, 2);
      assert.deepEqual((await load(id)).content.attachmentFiles, [file]);
      assert.ok([400, 403, 409].includes((await download(id, file)).statusCode));
      assert.equal((await download(id, file, 'writer', { revision: '2' })).statusCode, 200);
    });

    await t.test('object integrity, canonical metadata and uploader ownership remain enforced on save and download', async () => {
      const requestId = randomUUID(), file = await stage(requestId);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
      const stored = files.get(writes[0].name), originalBytes = Buffer.from(stored.bytes);
      stored.bytes = Buffer.from('%PDF-1.7\nsubstituted original');
      assert.equal((await download(id, file)).statusCode, 400);
      stored.bytes = originalBytes;
      stored.metadata.metadata.companyId = 'b';
      assert.equal((await download(id, file)).statusCode, 400);
      await assert.rejects(edit(id, [file]));
      stored.metadata.metadata.companyId = 'a';
      const adminUpload = await http('upload', 'admin', { documentId: id, revision: '1' });
      assert.equal(adminUpload.statusCode, 200);
      await denied(edit(id, [file, adminUpload.body]), 'permission-denied');
      await edit(id, [file, adminUpload.body], 'admin');
      assert.equal((await load(id)).content.attachmentFiles.length, 2);
    });

    await t.test('identity or document revision change during upload withholds the result and removes the staged bytes', async () => {
      const id = await create();
      hooks.afterSave = async () => { await db.doc(`officialLetters/${id}`).update({ revision: 2 }); };
      const response = await http('upload', 'writer', { documentId: id, revision: '1' });
      assert.ok([403, 409].includes(response.statusCode)); assert.equal(files.size, 0);
      hooks.afterSave = async () => { await db.doc('UserProfile/writer').update({ status: 'SUSPENDED' }); };
      const newResponse = await http('upload', 'writer', { requestId: randomUUID() });
      assert.equal(newResponse.statusCode, 403); assert.equal(files.size, 0);
    });

    await t.test('post-download account, participant, company and revision changes prevent byte disclosure', async () => {
      for (const change of ['account', 'participant', 'company', 'revision', 'reference']) {
        await reset();
        const requestId = randomUUID(), file = await stage(requestId);
        const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
        hooks.afterDownload = async () => {
          if (change === 'account') await db.doc('UserProfile/head').update({ status: 'SUSPENDED' });
          if (change === 'participant') await db.doc(`officialLetters/${id}`).update({ participantIds: ['writer'] });
          if (change === 'company') await db.doc('companies/a').update({ status: 'DELETING' });
          if (change === 'revision') await db.doc(`officialLetters/${id}`).update({ revision: 2 });
          if (change === 'reference') await db.doc(`officialLetters/${id}`).update({ 'content.attachmentFiles': [] });
        };
        const response = await download(id, file, 'head');
        assert.ok([403, 404, 409].includes(response.statusCode), change);
        assert.ok(!Buffer.isBuffer(response.body), change);
      }
    });

    await t.test('attachment removal archives the original and issued edits clear approval and PDF until another approval', async () => {
      const requestId = randomUUID(), file = await stage(requestId);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
      const issued = await issue(id); assert.equal(issued.status, 'ISSUED');
      await call('writer', 'pdf', { id, revision: 1 });
      await denied(edit(id, []), 'permission-denied');
      await edit(id, [], 'admin');
      const revised = await load(id);
      assert.equal(revised.number, issued.number); assert.equal(revised.revision, 2);
      assert.equal(revised.status, 'DRAFT'); assert.equal(revised.approvedRevision, null);
      assert.equal(revised.pdf, null); assert.equal(revised.pdfReady, false);
      assert.ok(revised.approvalLine.every(step => !step.approvedAt));
      assert.deepEqual(revised.content.attachmentFiles, []);
      assert.ok([403, 404].includes((await download(id, file, 'admin', { revision: '2' })).statusCode));
      assert.equal((await download(id, file, 'admin', { revision: '2', historyId: '000001' })).statusCode, 200);
      assert.equal((await download(id, file, 'writer', { revision: '2', historyId: '000001' })).statusCode, 403);
      await denied(call('admin', 'pdf', { id, revision: 2 }), 'failed-precondition');
    });

    await t.test('omitted attachmentFiles preserves legacy clients, but explicit removal cannot be downloaded through current document', async () => {
      const requestId = randomUUID(), file = await stage(requestId);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
      const letter = await load(id), { attachmentFiles, ...legacyContent } = letter.content;
      assert.equal(attachmentFiles.length, 1);
      await save('writer', { id, revision: 1, content: { ...legacyContent, body: '기존 클라이언트의 내용 수정' } });
      assert.deepEqual((await load(id)).content.attachmentFiles, [file]);
      await edit(id, []);
      assert.equal((await download(id, file, 'writer', { revision: '3' })).statusCode, 404);
      assert.equal((await download(id, file, 'admin', { revision: '3', historyId: '000002' })).statusCode, 200);
    });

    await t.test('history deletion keeps shared files until document deletion and then clears its own complete scope only', async () => {
      const requestId = randomUUID(), file = await stage(requestId);
      const id = await create('writer', { requestId, content: { ...content, attachmentFiles: [file] } });
      await edit(id, [file]);
      await call('admin', 'deleteHistory', { id, revision: 2, historyId: '000001' });
      assert.equal((await download(id, file, 'writer', { revision: '2' })).statusCode, 200);
      const separateRequest = randomUUID(), other = await stage(separateRequest);
      const otherId = await create('writer', { requestId: separateRequest, content: { ...content, attachmentFiles: [other] } });
      await issue(id);
      const response = await call('admin', 'deleteIssued', { id, revision: 2, confirm: true });
      assert.equal(response.success, true);
      assert.ok(deletes.includes(`companies/a/drafting-attachments/${scope('writer', requestId)}/`));
      assert.ok(![...files.keys()].some(name => name.includes(scope('writer', requestId))));
      assert.ok([403, 404].includes((await download(id, file, 'admin', { revision: '2' })).statusCode));
      assert.equal((await download(otherId, other)).statusCode, 200);
      assert.equal((await db.doc(`officialLetters/${id}`).get()).data().status, 'DELETED');
    });
  } finally { await deleteApp(app); }
});
