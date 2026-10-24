const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createOfficialLetterService, koreaDate, numberLabel } = require('../official-letter-service');
const { renderOfficialLetterPdf, renderSealPrintTestPdf } = require('../official-letter-pdf');
const fs = require('node:fs');
const path = require('node:path');
const { inflateSync, deflateSync, crc32 } = require('node:zlib');
const { randomUUID } = require('node:crypto');

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('A loopback FIRESTORE_EMULATOR_HOST is required; production tests are prohibited.');
}
const app = initializeApp({ projectId: 'demo-hr-flow-letters' }, 'official-letters-test');
const db = getFirestore(app);
const files = new Map();
const bucket = { file: name => ({
  save: async bytes => { files.set(name, bytes); },
  download: async () => { if (!files.has(name)) throw new Error('missing asset'); return [files.get(name)]; },
  delete: async () => { files.delete(name); },
}) };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const rectangularPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAA2UlEQVR4nO3YoRWAUBDEQFpI/x1ck9ACLisi1vMyH3PPwduYafDYH9AI5IYfQn8IPkIg+OEDwY8dCH7gQPCjBoIfMhD8eIHgBwsEP1Ig+GECGYhxA+t0go8QCH74QPBjB4IfOBD8qIHghwwEP14g+MECwY8UCH6YQAZi3MA6neAjBIIfPhD82IHgBw4EP2og+CEDwY8XCH6wQPAjBYIfJpCBGDewTif4CIHghw8EP3Yg+IEDwY8aCH7IQPDjBYIfLBD8SIHghwlkIMYNrNMJPkIg+OEDwY/9Zx+g/wbmoISrngAAAABJRU5ErkJggg==';
const jpeg = 'data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCNgCFDf//Z';
function pngFixture(width, height, compression = 0, targetBytes, pixel = 136) {
  const chunk = (name, data) => {
    const type = Buffer.from(name); const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height, pixel);
  for (let y = 0; y < height; y++) rows[y * (width * 4 + 1)] = 0;
  const chunks = [Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: compression }))];
  if (targetBytes) {
    const text = Buffer.alloc(targetBytes - Buffer.concat(chunks).length - 24, 120);
    text[0] = 110; text[1] = 0; // A valid PNG tEXt keyword and separator, before the IEND chunk.
    chunks.push(chunk('tEXt', text));
  }
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}
// Read the final PDF's compressed drawing commands, without any PDF parser dependency.
function decodedPdfStreams(pdf) {
  const source = pdf.toString('latin1');
  const streams = [];
  for (const stream of source.matchAll(/(\d+) 0 obj\b([\s\S]*?)stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (!/\/FlateDecode\b/.test(stream[2])) continue;
    try { streams.push(inflateSync(Buffer.from(stream[3], 'latin1')).toString('latin1')); } catch { /* Not a drawable Flate stream. */ }
  }
  return streams;
}
function imageMatrices(pdf) {
  const matrices = [];
  for (const decoded of decodedPdfStreams(pdf)) {
    for (const drawing of decoded.matchAll(/([-\d.]+) 0 0 ([-\d.]+) [-\d.]+ [-\d.]+ cm\s*\/(I\d+) Do/g)) {
      matrices.push({ width: Math.abs(Number(drawing[1])), height: Math.abs(Number(drawing[2])), image: drawing[3] });
    }
  }
  return matrices;
}
const now = () => new Date('2026-10-22T15:10:00.000Z');
let renderCount = 0;
const printJobs = [];
const manage = createOfficialLetterService({ db, bucket, now,
  renderPdf: async () => { renderCount++; return Buffer.from('%PDF approved'); },
  renderPrintTestPdf: async (settings, images) => { printJobs.push({ settings, images }); return Buffer.from('%PDF print calibration'); },
});
const call = (uid, action, data = {}) => manage({ ...(uid ? { auth: { uid, token: { role: 'SUPER_ADMIN' } } } : {}), data: { action, ...data } });
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const content = { recipient: '거래처 주식회사', reference: '사업 담당자', title: '참여의향서 제출의 건', body: '1. 귀사의 무궁한 발전을 기원합니다.\n\n2. 아래와 같이 안내드립니다.\n\n끝.', attachments: '회사 소개서 1부' };
const load = async id => (await call('admin', 'get', { id })).letter;
const create = async (uid = 'member') => (await call(uid, 'save', { content })).id;
const submit = async id => { const letter = await load(id); return call(letter.creatorId === 'admin' ? 'admin2' : 'admin', 'submit', { id, revision: letter.revision }); };
const review = async (uid, id, extras = {}) => { const letter = await load(id); return call(uid, 'review', { id, revision: letter.revision, decision: 'approve', ...extras }); };
const allSteps = async id => { await review('lead', id); await review('head', id); return review('admin', id); };
const inboxRef = (uid, letterId) => db.doc(`officialLetterNotifications/${uid}/items/${letterId}`);
const notification = async (uid, letterId) => (await inboxRef(uid, letterId).get()).data();
const reassign = async (id, approverIds, extras = {}) => {
  const letter = await load(id);
  return call('admin', 'reassign', { id, revision: letter.revision, approverIds, reason: '담당자 변경', ...extras });
};
const certificate = { nameKo: '김문서', nameEn: 'Kim Munseo', birthDate: '1990-02-03', address: '서울특별시 강남구 테스트로 25',
  division: '경영지원본부', position: '과장', startDate: '2021-03-15', endDate: '', purpose: '금융기관 제출용',
  department: '인사팀', contactName: '인사담당자', contactPhone: '02-111-2222' };
const createCertificate = async (documentType, values = certificate, uid = 'member') => (await call(uid, 'save', { documentType, content: { certificate: values } })).id;
const setDocumentApprovers = async documentApproverIds => {
  const settings = (await call('admin', 'bootstrap')).settings;
  return call('admin', 'saveSettings', { settings: { ...settings, documentApproverIds }, expectedVersion: settings.version });
};
const createPrinter = async (values = {}, uid = 'admin') => (await call(uid, 'savePrinter', {
  printer: { name: '총무팀 프린터', model: 'Office Laser 500', location: '서울 본사 3층', active: true, ...values }, expectedVersion: 0,
})).printer;
const printerInspection = settings => ({ inspectedOn: '2026-10-23', measuredSealWidthMm: settings.sealWidthMm,
  measuredSealHeightMm: settings.sealHeightMm, horizontal100Mm: 100, vertical100Mm: 100,
  toleranceMm: 0.5, note: '실제 크기 출력 후 자로 확인', printSettings: 'A4 / 실제 크기 100%', actualSizeConfirmed: true });
const recordInspection = async (printer, settings, values = {}, extras = {}, uid = 'admin') => call(uid, 'recordPrinterInspection', {
  printerId: printer.id, expectedPrinterVersion: printer.version, expectedSettingsVersion: settings.version,
  requestId: randomUUID(), inspection: { ...printerInspection(settings), ...values }, ...extras,
});
const records = snapshot => snapshot.docs.map(document => ({ path: document.ref.path, ...document.data() })).sort((a, b) => a.path.localeCompare(b.path));
async function officialState() {
  const [settings, letters, numbers, notifications] = await Promise.all([
    db.collection('officialLetterSettings').get(), db.collection('officialLetters').get(),
    db.collection('officialLetterNumbers').get(), db.collectionGroup('items').get(),
  ]);
  const histories = await Promise.all(letters.docs.map(document => document.ref.collection('history').get()));
  return { settings: records(settings), letters: records(letters), numbers: records(numbers), notifications: records(notifications),
    histories: histories.flatMap(records).sort((a, b) => a.path.localeCompare(b.path)) };
}

test('official-letter server authorization, numbering and revisions', async t => {
  try {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-hr-flow-letters/databases/(default)/documents`, { method: 'DELETE' });
    await db.doc('companies/a').set({ nameKo: '테스트 주식회사', status: 'ACTIVE' });
    await db.doc('companies/b').set({ nameKo: '다른 회사', status: 'ACTIVE' });
    await db.doc('companies/c').set({ nameKo: '설정 검증 회사', status: 'ACTIVE' });
    for (const [uid, role, companyId, extra] of [
      ['admin', 'ADMIN', 'a', {}], ['member', 'MEMBER', 'a', { teamId: 'team1', divisionId: 'division1' }],
      ['lead', 'MEMBER', 'a', {}], ['head', 'SUB_ADMIN', 'a', {}],
      ['peer', 'MEMBER', 'a', { teamId: 'team2', divisionId: 'division2', annualSalary: 123456789, email: 'private@example.com' }],
      ['admin2', 'ADMIN', 'a', {}], ['retired-admin', 'ADMIN', 'a', { status: 'RESIGNED' }],
      ['delegate', 'SUB_ADMIN', 'a', { divisionId: 'division1' }], ['delegate2', 'SUB_ADMIN', 'a', { divisionId: 'division2' }],
      ['no-division', 'SUB_ADMIN', 'a', {}], ['retired-delegate', 'SUB_ADMIN', 'a', { divisionId: 'division1', status: 'RESIGNED' }],
      ['outsider', 'ADMIN', 'b', {}], ['platform', 'SUPER_ADMIN', 'PLATFORM', {}], ['resigned', 'MEMBER', 'a', { status: 'RESIGNED' }],
      ['fresh-admin', 'ADMIN', 'c', {}],
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
      const saved = await call('admin', 'saveSettings', { settings, expectedVersion: 0 });
      assert.equal(saved.version, 1); assert.deepEqual(saved.assets, { logoRegistered: true, sealRegistered: true });
      await denied(call('admin', 'saveSettings', { settings, expectedVersion: 0 }), 'aborted');
      const bootstrap = await call('member', 'bootstrap');
      assert.equal(bootstrap.settings.sealData, '');
      assert.equal(bootstrap.settings.logoData, png);
      assert.deepEqual(bootstrap.approvalLine.map(step => step.uid), ['lead', 'head']);
      assert.equal((await call('admin', 'bootstrap')).settings.sealData, png);
      assert.equal(bootstrap.settings.sealWidthMm, 23.3); assert.equal(bootstrap.settings.sealHeightMm, 23.3);
      assert.deepEqual(bootstrap.templateStatus, { configured: true, missingFields: [] });
      // A legacy serial value must never affect the new front-date numbering.
      await db.doc('officialLetterSettings/a').update({ lastSerial: 999 });
    });
    await t.test('incomplete templates report missing fields without persisting a false successful save', async () => {
      const bootstrap = await call('fresh-admin', 'bootstrap');
      assert.equal(bootstrap.templateStatus.configured, false);
      assert.deepEqual([...bootstrap.templateStatus.missingFields].sort(), ['companyName', 'address', 'representative', 'logoPath', 'sealPath'].sort());
      for (const settings of [{ lastFront: 0 }, { companyName: '검증 회사', address: '서울특별시', representative: '대표자', logoData: png, lastFront: 0 }]) {
        await assert.rejects(call('fresh-admin', 'saveSettings', { settings, expectedVersion: 0 }), error =>
          error.code === 'failed-precondition' && Array.isArray(error.details?.missingFields) && error.details.missingFields.includes('sealPath'));
        assert.equal((await db.doc('officialLetterSettings/c').get()).exists, false);
      }
      const valid = (await call('admin', 'bootstrap')).settings;
      for (const field of ['companyName', 'address', 'representative']) {
        await assert.rejects(call('admin', 'saveSettings', { settings: { ...valid, [field]: '' }, expectedVersion: valid.version }), error =>
          error.code === 'failed-precondition' && error.details?.missingFields?.includes(field));
        assert.equal((await call('admin', 'bootstrap')).settings.version, valid.version);
      }
    });
    await t.test('saving omitted or empty image fields retains registered company assets and seal dimensions', async () => {
      const before = (await call('admin', 'bootstrap')).settings;
      const { logoData, sealData, sealWidthMm, sealHeightMm, ...withoutUploads } = before;
      assert.ok(logoData && sealData && sealWidthMm && sealHeightMm);
      const saved = await call('admin', 'saveSettings', { settings: { ...withoutUploads, phone: '02-555-1111' }, expectedVersion: before.version });
      assert.equal(saved.version, before.version + 1); assert.deepEqual(saved.assets, { logoRegistered: true, sealRegistered: true });
      const after = (await call('admin', 'bootstrap')).settings;
      assert.equal(after.logoPath, before.logoPath); assert.equal(after.sealPath, before.sealPath);
      assert.equal(after.logoData, png); assert.equal(after.sealData, png);
      assert.equal(after.sealWidthMm, before.sealWidthMm); assert.equal(after.sealHeightMm, before.sealHeightMm);
      await call('admin', 'saveSettings', { settings: { ...withoutUploads, logoData: '', sealData: '' }, expectedVersion: after.version });
      assert.equal((await call('admin', 'bootstrap')).settings.sealPath, before.sealPath);
      const invalidVersion = (await call('admin', 'bootstrap')).settings.version;
      await denied(call('admin', 'saveSettings', { settings: { ...withoutUploads, sealData: 'data:image/png;base64,aGVsbG8=' }, expectedVersion: invalidVersion }), 'invalid-argument');
      assert.equal((await call('admin', 'bootstrap')).settings.version, invalidVersion);
    });
    await t.test('millimeter seal dimensions validate their range and precision and round-trip through settings', async () => {
      for (const invalid of [4.9, 50.1, 20.05, '20', Number.NaN, Number.POSITIVE_INFINITY]) {
        const settings = (await call('admin', 'bootstrap')).settings;
        for (const field of ['sealWidthMm', 'sealHeightMm']) {
          await denied(call('admin', 'saveSettings', { settings: { ...settings, [field]: invalid }, expectedVersion: settings.version }), 'invalid-argument');
        }
        assert.equal((await call('admin', 'bootstrap')).settings.version, settings.version);
      }
      const settings = (await call('admin', 'bootstrap')).settings;
      await call('admin', 'saveSettings', { settings: { ...settings, sealWidthMm: 5, sealHeightMm: 50 }, expectedVersion: settings.version });
      const limits = (await call('admin', 'bootstrap')).settings;
      assert.equal(limits.sealWidthMm, 5); assert.equal(limits.sealHeightMm, 50);
      await call('admin', 'saveSettings', { settings: { ...limits, sealWidthMm: 20.1, sealHeightMm: 30.2 }, expectedVersion: limits.version });
      const precise = (await call('admin', 'bootstrap')).settings;
      assert.equal(precise.sealWidthMm, 20.1); assert.equal(precise.sealHeightMm, 30.2);
    });

    await t.test('valid PNG uploads above the former 300 KiB limit and up to 3 MiB are accepted', async () => {
      const before = (await call('admin', 'bootstrap')).settings;
      const large = pngFixture(1023, 768, 0, 3 * 1024 * 1024);
      const largeSeal = pngFixture(1023, 768, 0, 3 * 1024 * 1024, 170);
      assert.equal(large.length, 3 * 1024 * 1024); assert.equal(largeSeal.length, large.length);
      const logoData = `data:image/png;base64,${large.toString('base64')}`;
      const sealData = `data:image/png;base64,${largeSeal.toString('base64')}`;
      await call('admin', 'saveSettings', { settings: { ...before, logoData, sealData }, expectedVersion: before.version });
      const saved = (await call('admin', 'bootstrap')).settings;
      assert.equal(saved.logoData, logoData); assert.equal(saved.sealData, sealData);
      assert.deepEqual(files.get(saved.logoPath), large); assert.deepEqual(files.get(saved.sealPath), largeSeal);
      const rawSettings = (await db.doc('officialLetterSettings/a').get()).data();
      assert.equal(rawSettings.logoData, undefined); assert.equal(rawSettings.sealData, undefined);
      assert.ok(!JSON.stringify(rawSettings).includes('data:image/'), 'large image bytes must stay outside Firestore');
      const pdf = await renderOfficialLetterPdf({ number: 'UPLOAD-TEST', revision: 1, issueDate: '2026-10-23', branding: saved, content }, { logo: large, seal: largeSeal });
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.equal(imageMatrices(pdf).length, 2);
      const oversized = pngFixture(1023, 768, 0, 3 * 1024 * 1024 + 1);
      assert.equal(oversized.length, 3 * 1024 * 1024 + 1);
      await denied(call('admin', 'saveSettings', { settings: { ...saved, logoData: `data:image/png;base64,${oversized.toString('base64')}` }, expectedVersion: saved.version }), 'invalid-argument');
      assert.equal((await call('admin', 'bootstrap')).settings.version, saved.version);
      await call('admin', 'saveSettings', { settings: { ...saved, ...before }, expectedVersion: saved.version });
    });
    await t.test('larger upload limits preserve PNG and JPEG byte validation and the 4096 pixel boundary', async () => {
      let settings = (await call('admin', 'bootstrap')).settings;
      const before = settings;
      await call('admin', 'saveSettings', { settings: { ...settings, logoData: jpeg }, expectedVersion: settings.version });
      settings = (await call('admin', 'bootstrap')).settings;
      assert.equal(settings.logoData, jpeg);
      for (const [width, height] of [[4096, 1], [1, 4096]]) {
        await call('admin', 'saveSettings', { settings: { ...settings, logoData: `data:image/png;base64,${pngFixture(width, height, 9).toString('base64')}` }, expectedVersion: settings.version });
        settings = (await call('admin', 'bootstrap')).settings;
      }
      for (const logoData of [
        png.replace('image/png', 'image/jpeg'), jpeg.replace('image/jpeg', 'image/png'), 'data:image/jpeg;base64,/9j/AA==',
        ...[[4097, 1], [1, 4097]].map(([width, height]) => `data:image/png;base64,${pngFixture(width, height, 9).toString('base64')}`),
      ]) await denied(call('admin', 'saveSettings', { settings: { ...settings, logoData }, expectedVersion: settings.version }), 'invalid-argument');
      assert.equal((await call('admin', 'bootstrap')).settings.version, settings.version);
      await call('admin', 'saveSettings', { settings: { ...settings, ...before }, expectedVersion: settings.version });
    });
    await t.test('printer administration requires active company ADMIN and ignores spoofed ownership fields', async () => {
      await denied(call(null, 'listPrinters'), 'unauthenticated');
      for (const uid of ['member', 'head', 'delegate', 'platform', 'resigned']) {
        await denied(call(uid, 'listPrinters'), 'permission-denied');
        await denied(createPrinter({}, uid), 'permission-denied');
      }
      const before = await officialState();
      const printer = await createPrinter({ companyId: 'b', id: 'spoofed-id', version: 999, createdBy: 'outsider', createdAt: '2000-01-01' });
      assert.equal(printer.companyId, 'a'); assert.notEqual(printer.id, 'spoofed-id');
      assert.equal(printer.createdBy, 'admin'); assert.equal(printer.version, 1); assert.equal(printer.createdAt, now().toISOString());
      const edited = (await call('admin', 'savePrinter', { printerId: printer.id, expectedVersion: printer.version,
        printer: { name: '변경 프린터', model: 'Laser 600', location: '4층', active: true, companyId: 'b', createdBy: 'outsider' } })).printer;
      assert.equal(edited.version, 2); assert.equal(edited.companyId, 'a'); assert.equal(edited.createdBy, 'admin');
      await denied(call('admin', 'savePrinter', { printerId: printer.id, expectedVersion: 1, printer: edited }), 'aborted');
      await assert.rejects(call('outsider', 'savePrinter', { printerId: printer.id, expectedVersion: 2, printer: edited }), error => ['permission-denied', 'not-found'].includes(error.code));
      assert.ok(!(await call('outsider', 'listPrinters', { companyId: 'a' })).printers.some(item => item.id === printer.id));
      assert.deepEqual(await officialState(), before, 'printer settings must not change official letters, templates, counters or inboxes');
      for (const values of [{ name: '' }, { name: 'x'.repeat(101) }, { model: 'x'.repeat(101) }, { location: 'x'.repeat(201) }, { active: 'true' }]) {
        await denied(createPrinter(values), 'invalid-argument');
      }
      await denied(call('admin', 'savePrinter', { printerId: '../bad', expectedVersion: 1, printer: edited }), 'invalid-argument');
    });
    await t.test('printer inspections are append-only, compute results on the server and freeze printer and template snapshots', async () => {
      const settings = (await call('admin', 'bootstrap')).settings;
      const printer = await createPrinter({ name: '점검 대상' });
      const before = await officialState();
      const requestId = randomUUID();
      const payload = { requestId, companyId: 'b', recordedBy: 'outsider', recordedAt: '2000-01-01', result: 'RECHECK' };
      const result = await recordInspection(printer, settings, { measuredSealWidthMm: settings.sealWidthMm + 0.5,
        measuredSealHeightMm: settings.sealHeightMm - 0.5, horizontal100Mm: 100.5, vertical100Mm: 99.5,
        companyId: 'b', result: 'RECHECK', recordedBy: 'outsider', recordedAt: '2000-01-01', paperSize: 'A3', scalePercent: 75 }, payload);
      const entry = result.inspection;
      assert.equal(entry.id, requestId.toLowerCase());
      assert.equal(entry.companyId, 'a'); assert.equal(entry.printerId, printer.id); assert.equal(entry.recordedBy, 'admin');
      assert.equal(entry.recordedAt, now().toISOString()); assert.equal(entry.paperSize, 'A4'); assert.equal(entry.scalePercent, 100);
      assert.equal(entry.result, 'PASS');
      assert.deepEqual(entry.deviations, { sealWidthMm: 0.5, sealHeightMm: -0.5, horizontal100Mm: 0.5, vertical100Mm: -0.5 });
      assert.equal(entry.printerSnapshot.name, printer.name); assert.equal(entry.printerSnapshot.version, printer.version);
      assert.equal(entry.templateSnapshot.companyName, settings.companyName); assert.equal(entry.templateSnapshot.version, settings.version);
      assert.equal(entry.templateSnapshot.sealWidthMm, settings.sealWidthMm); assert.equal(entry.templateSnapshot.sealHeightMm, settings.sealHeightMm);
      assert.equal(typeof entry.templateSnapshot.sealAssetId, 'string'); assert.ok(entry.templateSnapshot.sealAssetId.length > 0);
      assert.equal(entry.templateSnapshot.sealData, undefined);
      const duplicate = await recordInspection(printer, settings, { measuredSealWidthMm: settings.sealWidthMm + 0.5,
        measuredSealHeightMm: settings.sealHeightMm - 0.5, horizontal100Mm: 100.5, vertical100Mm: 99.5,
        companyId: 'b', result: 'RECHECK', recordedBy: 'outsider', recordedAt: '2000-01-01', paperSize: 'A3', scalePercent: 75 }, payload);
      assert.equal(duplicate.inspection.id, entry.id);
      const upperCaseRetry = await recordInspection(printer, settings, { measuredSealWidthMm: settings.sealWidthMm + 0.5,
        measuredSealHeightMm: settings.sealHeightMm - 0.5, horizontal100Mm: 100.5, vertical100Mm: 99.5 }, { requestId: requestId.toUpperCase() });
      assert.equal(upperCaseRetry.inspection.id, entry.id);
      await denied(recordInspection(printer, settings, { measuredSealWidthMm: settings.sealWidthMm + 0.5,
        measuredSealHeightMm: settings.sealHeightMm - 0.5, horizontal100Mm: 100.5, vertical100Mm: 99.5 }, { requestId }, 'admin2'), 'already-exists');
      await denied(recordInspection(printer, settings, { note: '같은 요청 ID의 다른 내용' }, { requestId }), 'already-exists');
      const recheck = (await recordInspection(printer, settings, { horizontal100Mm: 100.6 })).inspection;
      assert.equal(recheck.result, 'RECHECK'); assert.equal(recheck.deviations.horizontal100Mm, 0.6);
      assert.deepEqual(await officialState(), before, 'recording inspection results must leave template versions, issuance and letters unchanged');
      await call('admin', 'savePrinter', { printerId: printer.id, expectedVersion: 1, printer: { ...printer, name: '변경된 장비', active: false } });
      await call('admin', 'saveSettings', { expectedVersion: settings.version, settings: { ...settings, sealWidthMm: 25, sealHeightMm: 25 } });
      const archivedEntries = (await call('admin', 'listPrinterInspections', { printerId: printer.id })).inspections;
      assert.equal(archivedEntries.length, 2); assert.deepEqual(archivedEntries.find(item => item.id === entry.id), entry);
      const retryAfterChanges = await recordInspection(printer, settings, { measuredSealWidthMm: settings.sealWidthMm + 0.5,
        measuredSealHeightMm: settings.sealHeightMm - 0.5, horizontal100Mm: 100.5, vertical100Mm: 99.5 }, { requestId });
      assert.deepEqual(retryAfterChanges.inspection, entry, 'a committed request remains idempotent after archive or template changes');
      const currentSettings = (await call('admin', 'bootstrap')).settings;
      await call('admin', 'saveSettings', { expectedVersion: currentSettings.version, settings: { ...currentSettings, ...settings } });
      const after = await officialState();
      assert.deepEqual(after.letters, before.letters); assert.deepEqual(after.numbers, before.numbers); assert.deepEqual(after.histories, before.histories);
      assert.deepEqual(after.notifications, before.notifications); assert.equal(after.settings.find(item => item.companyId === 'a').lastFront, settings.lastFront);
      await denied(call('admin', 'updatePrinterInspection', { printerId: printer.id, inspectionId: entry.id, inspection: { result: 'PASS' } }), 'invalid-argument');
      await denied(call('admin', 'deletePrinterInspection', { printerId: printer.id, inspectionId: entry.id }), 'invalid-argument');
    });
    await t.test('printer inspection input, archived printers and stale versions cannot create records', async () => {
      const settings = (await call('admin', 'bootstrap')).settings;
      const printer = await createPrinter();
      for (const uid of ['member', 'head', 'delegate', 'platform', 'resigned']) {
        await denied(recordInspection(printer, settings, {}, {}, uid), 'permission-denied');
        await denied(call(uid, 'listPrinterInspections', { printerId: printer.id }), 'permission-denied');
      }
      await assert.rejects(recordInspection(printer, settings, {}, {}, 'outsider'), error => ['permission-denied', 'not-found'].includes(error.code));
      for (const values of [
        { inspectedOn: '2026-10-24' }, { inspectedOn: '2026-02-30' }, { inspectedOn: '2026-1-1' }, { inspectedOn: '1899-12-31' }, { actualSizeConfirmed: false },
        { measuredSealWidthMm: 0 }, { measuredSealHeightMm: 200.1 }, { horizontal100Mm: '100' }, { vertical100Mm: 99.95 },
        { toleranceMm: 0 }, { toleranceMm: 5.1 }, { note: 'x'.repeat(1001) }, { printSettings: 'x'.repeat(201) },
      ]) await denied(recordInspection(printer, settings, values), 'invalid-argument');
      await denied(recordInspection(printer, settings, {}, { requestId: 'not-a-uuid' }), 'invalid-argument');
      await denied(recordInspection(printer, settings, {}, { expectedPrinterVersion: 0 }), 'aborted');
      await denied(recordInspection(printer, settings, {}, { expectedSettingsVersion: settings.version - 1 }), 'aborted');
      const archived = (await call('admin', 'savePrinter', { printerId: printer.id, expectedVersion: printer.version, printer: { ...printer, active: false } })).printer;
      await denied(recordInspection(archived, settings), 'failed-precondition');
      assert.deepEqual((await call('admin', 'listPrinterInspections', { printerId: printer.id })).inspections, []);
    });
    await t.test('printer and inspection pagination uses opaque scoped cursors without duplicate entries', async () => {
      const settings = (await call('admin', 'bootstrap')).settings;
      const printer = await createPrinter({ name: '페이지 확인' });
      for (let index = 0; index < 5; index++) await recordInspection(printer, settings, { note: `점검 ${index}` });
      const walk = async (action, key, payload = {}) => {
        const all = []; let after;
        for (let pages = 0; pages < 20; pages++) {
          const response = await call('admin', action, { ...payload, pageSize: 2, ...(after ? { after } : {}) });
          assert.ok(response[key].length <= 2); all.push(...response[key]);
          if (!response.nextCursor) return all;
          assert.notDeepEqual(response.nextCursor, after); after = response.nextCursor;
        }
        assert.fail('pagination must finish');
      };
      const inspections = await walk('listPrinterInspections', 'inspections', { printerId: printer.id });
      assert.equal(inspections.length, 5); assert.equal(new Set(inspections.map(item => item.id)).size, 5);
      const printers = await walk('listPrinters', 'printers');
      assert.equal(new Set(printers.map(item => item.id)).size, printers.length);
      assert.deepEqual(printers.map(item => item.id).sort(), (await call('admin', 'listPrinters', { pageSize: 50 })).printers.map(item => item.id).sort());
      for (const pageSize of [0, 51, 1.5, '2']) await denied(call('admin', 'listPrinters', { pageSize }), 'invalid-argument');
      await denied(call('admin', 'listPrinterInspections', { printerId: '../bad' }), 'invalid-argument');
      const foreign = await createPrinter({ name: '다른 회사 장비' }, 'outsider');
      await assert.rejects(call('admin', 'listPrinterInspections', { printerId: foreign.id }), error => ['not-found', 'permission-denied'].includes(error.code));
      await denied(call('admin', 'listPrinters', { after: foreign.id }), 'invalid-argument');
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
      const archived = (await call('admin', 'history', { id: letterId })).history[0];
      assert.equal(archived.content.body, content.body);
      assert.ok(files.has(archived.pdf.path));
      await denied(call('member', 'history', { id: letterId }), 'permission-denied');
      await denied(call('admin', 'pdf', { id: letterId, revision: 2 }), 'failed-precondition');
      await denied(call('admin', 'save', { id: letterId, revision: 1, content }), 'aborted');
      await submit(letterId); await allSteps(letterId);
      assert.equal((await load(letterId)).number, '002-261023');
      await denied(call('member', 'deleteHistory', { id: letterId, revision: 2, historyId: '000001' }), 'permission-denied');
      await call('admin', 'deleteHistory', { id: letterId, revision: 2, historyId: '000001' });
      assert.equal(files.has(archived.pdf.path), false, 'permanently deleting an archive removes its private PDF');
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
    await t.test('seal print calibration requires the current company ADMIN, a saved template and a current settings version', async () => {
      const { settings } = await call('admin', 'bootstrap');
      const jobsBefore = printJobs.length;
      await denied(call(null, 'sealPrintTest', { expectedVersion: settings.version }), 'unauthenticated');
      for (const uid of ['member', 'head', 'delegate', 'platform', 'resigned', 'retired-admin']) {
        await denied(call(uid, 'sealPrintTest', { expectedVersion: settings.version }), 'permission-denied');
      }
      await denied(call('outsider', 'sealPrintTest', { expectedVersion: settings.version, companyId: 'a', settings }), 'failed-precondition');
      await denied(call('fresh-admin', 'sealPrintTest', { expectedVersion: 0 }), 'failed-precondition');
      for (const expectedVersion of [undefined, '1', -1, 1.5]) {
        await denied(call('admin', 'sealPrintTest', { expectedVersion }), 'invalid-argument');
      }
      await denied(call('admin', 'sealPrintTest', { expectedVersion: settings.version - 1 }), 'aborted');
      assert.equal(printJobs.length, jobsBefore, 'unauthorized or stale requests must never render a seal');
    });
    await t.test('legacy or partially missing seal dimensions must be saved before print calibration', async () => {
      const { settings } = await call('admin', 'bootstrap');
      const jobsBefore = printJobs.length;
      for (const [sealWidthMm, sealHeightMm] of [[undefined, undefined], [20, undefined], [undefined, 30]]) {
        const legacy = { ...settings, companyId: 'c' };
        delete legacy.logoData; delete legacy.sealData; delete legacy.sealWidthMm; delete legacy.sealHeightMm;
        if (sealWidthMm !== undefined) legacy.sealWidthMm = sealWidthMm;
        if (sealHeightMm !== undefined) legacy.sealHeightMm = sealHeightMm;
        await db.doc('officialLetterSettings/c').set(legacy);
        await denied(call('fresh-admin', 'sealPrintTest', { expectedVersion: legacy.version }), 'failed-precondition');
      }
      await db.doc('officialLetterSettings/c').delete();
      assert.equal(printJobs.length, jobsBefore);
    });
    await t.test('print calibration returns only the PDF and leaves document history, numbering, inboxes and storage unchanged', async () => {
      const { settings } = await call('admin', 'bootstrap');
      const before = await officialState();
      const storedBefore = [...files.entries()].map(([name, bytes]) => [name, Buffer.from(bytes)]);
      const result = await call('admin', 'sealPrintTest', { expectedVersion: settings.version });
      assert.equal(Buffer.from(result.base64, 'base64').toString(), '%PDF print calibration');
      assert.match(result.filename, /\.pdf$/i);
      assert.deepEqual(Object.keys(result).sort(), ['base64', 'filename']);
      const job = printJobs.at(-1);
      assert.equal(job.settings.companyId, 'a');
      assert.equal(job.settings.sealWidthMm, settings.sealWidthMm);
      assert.equal(job.settings.sealHeightMm, settings.sealHeightMm);
      assert.deepEqual(job.images.seal, files.get(settings.sealPath));
      assert.deepEqual(await officialState(), before);
      assert.deepEqual([...files.entries()], storedBefore);
    });
    await t.test('print calibration rechecks ADMIN role, active membership, company and template version after rendering', async () => {
      const profileRef = db.doc('UserProfile/admin2');
      const settingsRef = db.doc('officialLetterSettings/a');
      const companyRef = db.doc('companies/a');
      const profile = (await profileRef.get()).data();
      const settings = (await settingsRef.get()).data();
      const company = (await companyRef.get()).data();
      for (const [change, accepted] of [
        [() => profileRef.update({ role: 'MEMBER' }), ['permission-denied']],
        [() => profileRef.update({ status: 'RESIGNED' }), ['permission-denied']],
        [() => profileRef.update({ companyId: 'b' }), ['permission-denied', 'aborted']],
        [() => companyRef.update({ status: 'SUSPENDED' }), ['permission-denied']],
        [() => settingsRef.update({ version: settings.version + 1 }), ['aborted']],
      ]) {
        const service = createOfficialLetterService({ db, bucket, now, renderPdf: async () => Buffer.from('%PDF'),
          renderPrintTestPdf: async () => { await change(); return Buffer.from('%PDF stale seal'); },
        });
        try {
          await assert.rejects(service({ auth: { uid: 'admin2' }, data: { action: 'sealPrintTest', expectedVersion: settings.version } }), error => accepted.includes(error.code));
        } finally {
          await Promise.all([profileRef.set(profile), settingsRef.set(settings), companyRef.set(company)]);
        }
      }
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
    await t.test('submitted seal dimensions and issued cached files remain frozen after changing the template', async () => {
      const before = (await call('admin', 'bootstrap')).settings;
      const id = await create(); await submit(id);
      const pendingBefore = await load(id);
      assert.equal(pendingBefore.branding.sealWidthMm, before.sealWidthMm);
      assert.equal(pendingBefore.branding.sealHeightMm, before.sealHeightMm);
      const issuedBefore = await load(letterId);
      const cachedBytes = Buffer.from(files.get(issuedBefore.pdf.path));
      const renderBefore = renderCount;
      await call('admin', 'saveSettings', { settings: { ...before, sealData: rectangularPng, sealWidthMm: 35.5, sealHeightMm: 25.5 }, expectedVersion: before.version });
      const pendingAfter = await load(id);
      assert.equal(pendingAfter.branding.sealPath, pendingBefore.branding.sealPath);
      assert.equal(pendingAfter.branding.sealWidthMm, before.sealWidthMm);
      assert.equal(pendingAfter.branding.sealHeightMm, before.sealHeightMm);
      const downloaded = await call('member', 'pdf', { id: letterId, revision: issuedBefore.revision });
      assert.deepEqual(Buffer.from(downloaded.base64, 'base64'), cachedBytes);
      assert.equal(renderCount, renderBefore, 'a template change must not regenerate an already issued PDF');
      assert.deepEqual((await load(letterId)).pdf, issuedBefore.pdf);
      assert.equal((await load(letterId)).branding.sealWidthMm, issuedBefore.branding.sealWidthMm);
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
    await t.test('certificate validation enforces document type, required fields and real employment dates', async () => {
      await denied(call('member', 'save', { documentType: 'UNSUPPORTED', content }), 'invalid-argument');
      for (const field of ['nameKo', 'address', 'division', 'position', 'startDate', 'purpose']) {
        await denied(createCertificate('EMPLOYMENT', { ...certificate, [field]: '' }), 'invalid-argument');
      }
      for (const values of [
        { birthDate: '2026-02-30' }, { birthDate: '2026-10-24' }, { birthDate: '90-02-03' },
        { startDate: '2027-01-01' }, { startDate: '2021-3-15' }, { startDate: '2021-02-29' }, { endDate: '2026-10-23' },
      ]) await denied(createCertificate('EMPLOYMENT', { ...certificate, ...values }), 'invalid-argument');
      for (const values of [{ endDate: '' }, { endDate: '2020-12-31' }, { endDate: '2026-10-24' }, { endDate: '2026-02-30' }]) {
        await denied(createCertificate('CAREER', { ...certificate, ...values }), 'invalid-argument');
      }
      const employmentId = await createCertificate('EMPLOYMENT', { ...certificate, nameEn: '', birthDate: '', department: '', contactName: '', contactPhone: '' });
      const employment = await load(employmentId);
      assert.equal(employment.documentType, 'EMPLOYMENT'); assert.equal(employment.content.title, '재직증명서');
      assert.equal(employment.content.certificate.nameKo, certificate.nameKo);
      const careerId = await createCertificate('CAREER', { ...certificate, endDate: '2026-10-23' });
      assert.equal((await load(careerId)).content.title, '경력증명서');
      await denied(call('member', 'save', { id: employmentId, revision: 1, documentType: 'CAREER', content: { certificate: { ...certificate, endDate: '2026-10-23' } } }), 'invalid-argument');
      const ordinaryId = await create();
      assert.equal((await load(ordinaryId)).documentType, 'OFFICIAL');
      await denied(call('member', 'save', { id: ordinaryId, revision: 1, documentType: 'EMPLOYMENT', content: { certificate } }), 'invalid-argument');
    });
    await t.test('only active same-company division managers can be granted final document approval', async () => {
      for (const values of [['member'], ['admin'], ['no-division'], ['retired-delegate'], ['outsider'], ['platform'], ['missing'], ['delegate', 'delegate']]) {
        await denied(setDocumentApprovers(values), 'invalid-argument');
      }
      const settings = (await call('admin', 'bootstrap')).settings;
      await denied(call('delegate', 'saveSettings', { settings: { ...settings, documentApproverIds: ['delegate'] }, expectedVersion: settings.version }), 'permission-denied');
      await setDocumentApprovers(['delegate', 'delegate2']);
      assert.deepEqual((await call('admin', 'bootstrap')).settings.documentApproverIds, ['delegate', 'delegate2']);
      assert.equal((await call('delegate', 'bootstrap')).settings.sealData, '');
      await setDocumentApprovers([]);
    });
    await t.test('company changes during image upload cannot write another company settings', async () => {
      await db.doc('UserProfile/switch-admin').set({ uid: 'switch-admin', role: 'ADMIN', companyId: 'a', status: 'ACTIVE' });
      const settings = (await call('admin', 'bootstrap')).settings;
      const switchingBucket = { file: name => ({
        save: async bytes => { files.set(name, bytes); await db.doc('UserProfile/switch-admin').update({ companyId: 'b' }); },
        download: async () => [files.get(name)], delete: async () => { files.delete(name); },
      }) };
      const switching = createOfficialLetterService({ db, bucket: switchingBucket, now, renderPdf: async () => Buffer.from('%PDF') });
      await assert.rejects(switching({ auth: { uid: 'switch-admin' }, data: { action: 'saveSettings', settings: { ...settings, companyName: '다른 회사로 바뀐 세션' }, expectedVersion: settings.version } }),
        error => ['permission-denied', 'aborted'].includes(error.code));
      assert.equal((await call('admin', 'bootstrap')).settings.version, settings.version);
      assert.equal((await db.doc('officialLetterSettings/b').get()).exists, false);
    });
    await t.test('an ADMIN author submits straight to issued with a saved private PDF but other ADMIN submissions still wait', async () => {
      const id = await create('admin');
      await reassign(id, ['lead', 'head']);
      const draft = await load(id);
      const previousFront = (await call('admin', 'bootstrap')).settings.lastFront;
      const result = await call('admin', 'submit', { id, revision: draft.revision });
      const issued = await load(id);
      assert.equal(issued.status, 'ISSUED'); assert.equal(issued.automaticApproval, true);
      assert.equal(issued.number, numberLabel(previousFront + 1, '2026-10-23'));
      assert.equal(issued.approvedRevision, issued.revision); assert.equal(issued.approvedBy, 'admin');
      assert.equal(result.pdfReady, true); assert.equal(issued.pdfReady, true);
      assert.ok(issued.pdf.path.startsWith('companies/a/official-pdfs/'));
      assert.equal(issued.pdf.revision, issued.revision); assert.equal(issued.pdf.number, issued.number);
      assert.equal(typeof issued.pdf.readyAt, 'string'); assert.ok(files.has(issued.pdf.path));
      const beforeDownload = renderCount;
      await call('admin', 'pdf', { id, revision: issued.revision });
      assert.equal(renderCount, beforeDownload, 'saved PDFs are downloaded without rendering again');
      const waitingId = await create('admin'); await submit(waitingId);
      assert.equal((await load(waitingId)).status, 'PENDING');
      assert.notEqual((await load(waitingId)).automaticApproval, true);
    });
    await t.test('delegation is scoped to the submitted creator division and sequential approvals still apply', async () => {
      const draftId = await create();
      await setDocumentApprovers(['delegate', 'delegate2']);
      await denied(call('delegate', 'get', { id: draftId }), 'permission-denied');
      await submit(draftId);
      const delegated = await call('delegate', 'get', { id: draftId });
      assert.equal(delegated.letter.branding.sealData, '');
      assert.equal(delegated.letter.permissions.canFinalApprove, false);
      await denied(call('delegate2', 'get', { id: draftId }), 'permission-denied');
      await assert.rejects(review('delegate', draftId), error => ['failed-precondition', 'permission-denied'].includes(error.code));
      await review('lead', draftId); await review('head', draftId);
      assert.equal((await call('delegate', 'get', { id: draftId })).letter.permissions.canFinalApprove, true);
      assert.equal((await notification('delegate', draftId)).requiresAction, true);
      // Later personnel transfers must not change the submitted document's division.
      await db.doc('UserProfile/member').update({ divisionId: 'division2' });
      await denied(call('delegate2', 'get', { id: draftId }), 'permission-denied');
      const result = await review('delegate', draftId);
      assert.equal(result.pdfReady, true); assert.equal((await load(draftId)).approvedBy, 'delegate');
      assert.equal((await call('delegate', 'get', { id: draftId })).letter.branding.sealData, '');
      await db.doc('UserProfile/member').update({ divisionId: 'division1' });
      await setDocumentApprovers([]);
      await denied(call('delegate', 'get', { id: draftId }), 'permission-denied');
      await denied(call('delegate', 'pdf', { id: draftId, revision: 1 }), 'permission-denied');
      assert.ok(!(await call('delegate', 'approvals')).letters.some(letter => letter.id === draftId));
    });
    await t.test('delegated managers cannot self-approve and revocation applies before final approval', async () => {
      await setDocumentApprovers(['delegate']);
      const ownId = await createCertificate('EMPLOYMENT', certificate, 'delegate'); await submit(ownId);
      await denied(review('delegate', ownId), 'permission-denied');
      const id = await create(); await submit(id); await review('lead', id); await review('head', id);
      assert.equal((await notification('delegate', id)).requiresAction, true);
      await setDocumentApprovers([]);
      await denied(review('delegate', id), 'permission-denied');
      await assert.rejects(call('delegate', 'ackNotification', { id }), error => ['permission-denied', 'not-found'].includes(error.code));
      assert.equal((await load(id)).status, 'PENDING');
      await setDocumentApprovers(['delegate']);
      await db.doc('UserProfile/delegate').update({ status: 'RESIGNED' });
      await denied(review('delegate', id), 'permission-denied');
      await db.doc('UserProfile/delegate').update({ status: 'ACTIVE' });
      await setDocumentApprovers([]);
    });
    await t.test('approvals and issued mine lists keep company, division, creator and draft boundaries', async () => {
      const pending = await create(); await submit(pending);
      const draft = await create();
      const otherDivision = await create('peer'); await submit(otherDivision);
      const issued = await createCertificate('EMPLOYMENT'); await submit(issued); await allSteps(issued);
      await setDocumentApprovers(['delegate', 'delegate2']);
      await denied(call('member', 'approvals'), 'permission-denied');
      const adminList = (await call('admin', 'approvals')).letters;
      assert.ok(adminList.some(letter => letter.id === pending)); assert.ok(adminList.some(letter => letter.id === otherDivision));
      assert.ok(!adminList.some(letter => letter.id === draft));
      const scoped = (await call('delegate', 'approvals')).letters;
      assert.ok(scoped.some(letter => letter.id === pending));
      assert.ok(!scoped.some(letter => [draft, otherDivision].includes(letter.id)));
      const mine = (await call('member', 'mine')).letters;
      assert.ok(mine.some(letter => letter.id === issued));
      assert.ok(mine.every(letter => letter.creatorId === 'member' && letter.status === 'ISSUED'));
      const summary = mine.find(letter => letter.id === issued);
      assert.equal(summary.documentType, 'EMPLOYMENT'); assert.equal(summary.pdfReady, true);
      assert.equal(typeof summary.createdAt, 'string'); assert.equal(summary.issueDate, '2026-10-23');
      assert.ok(!(await call('peer', 'mine')).letters.some(letter => letter.id === issued));
      await denied(call('outsider', 'get', { id: issued }), 'permission-denied');
      await setDocumentApprovers([]);
    });
    await t.test('PDF generation failure preserves issuance and retries without assigning another number', async () => {
      const id = await create('admin');
      const failing = createOfficialLetterService({ db, bucket, now, renderPdf: async () => { throw new Error('renderer unavailable'); } });
      const result = await failing({ auth: { uid: 'admin' }, data: { action: 'submit', id, revision: 1 } });
      assert.equal(result.success, true); assert.equal(result.pdfReady, false);
      const issued = await load(id);
      assert.equal(issued.status, 'ISSUED'); assert.equal(issued.pdfReady, false);
      const previousFront = (await call('admin', 'bootstrap')).settings.lastFront;
      const recovered = await call('admin', 'pdf', { id, revision: 1 });
      assert.equal(Buffer.from(recovered.base64, 'base64').toString(), '%PDF approved');
      const ready = await load(id);
      assert.equal(ready.pdfReady, true); assert.equal(ready.number, issued.number);
      assert.equal((await call('admin', 'bootstrap')).settings.lastFront, previousFront);
    });
    await t.test('failed archive PDF deletion leaves history available for a later retry', async () => {
      const id = await create(); await submit(id); await allSteps(id);
      await call('admin', 'save', { id, revision: 1, content: { ...content, title: '새 보관 이력' } });
      const archived = (await call('admin', 'history', { id })).history[0];
      const failingBucket = { file: name => ({
        save: async bytes => { files.set(name, bytes); }, download: async () => [files.get(name)],
        delete: async () => { throw new Error('private storage temporarily unavailable'); },
      }) };
      const failing = createOfficialLetterService({ db, bucket: failingBucket, now, renderPdf: async () => Buffer.from('%PDF') });
      await assert.rejects(failing({ auth: { uid: 'admin' }, data: { action: 'deleteHistory', id, revision: 2, historyId: archived.historyId } }));
      assert.equal((await call('admin', 'history', { id })).history.length, 1);
      assert.ok(files.has(archived.pdf.path));
      await call('admin', 'deleteHistory', { id, revision: 2, historyId: archived.historyId });
      assert.equal((await call('admin', 'history', { id })).history.length, 0);
      assert.equal(files.has(archived.pdf.path), false);
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
      await db.doc(`officialLetters/${letterId}`).update({ pdf: null, pdfReady: false });
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
    await t.test('cached PDF downloads recheck access after reading private storage', async () => {
      const current = await load('legacy-issued');
      await call('member', 'pdf', { id: current.id, revision: current.revision });
      const cachedBucket = { file: name => ({
        save: async bytes => { files.set(name, bytes); },
        delete: async () => { files.delete(name); },
        download: async () => {
          if (name.includes('/official-pdfs/')) await db.doc('UserProfile/member').update({ status: 'RESIGNED' });
          return [files.get(name)];
        },
      }) };
      const cachedService = createOfficialLetterService({ db, bucket: cachedBucket, now, renderPdf: async () => { throw new Error('a ready PDF must be downloaded from storage'); } });
      await denied(cachedService({ auth: { uid: 'member' }, data: { action: 'pdf', id: current.id, revision: current.revision } }), 'permission-denied');
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
      for (const [documentType, title, values] of [
        ['EMPLOYMENT', '재직증명서', certificate], ['CAREER', '경력증명서', { ...certificate, endDate: '2026-09-30' }],
      ]) {
        const certificatePdf = await renderOfficialLetterPdf({ ...letter, documentType,
          branding: { ...letter.branding, sealWidthMm: 23.3, sealHeightMm: 23.3 },
          content: { recipient: '', reference: '', title, body: '', attachments: '', certificate: values } }, { logo: bytes, seal: bytes });
        assert.equal(certificatePdf.subarray(0, 5).toString(), '%PDF-');
        assert.equal((certificatePdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'a standard certificate must fit on one A4 page');
        assert.notDeepEqual(certificatePdf, short, 'certificate layouts must differ from ordinary letters');
        fs.writeFileSync(path.join(output, `certificate-${documentType.toLowerCase()}.pdf`), certificatePdf);
      }
    });
    await t.test('PDF seal drawing matrices use exact millimeters and disable automatic print scaling', async () => {
      const source = await load(letterId);
      const images = { logo: Buffer.from(png.split(',')[1], 'base64'), seal: Buffer.from(rectangularPng.split(',')[1], 'base64') };
      const output = path.resolve(__dirname, '../../tmp/pdfs');
      for (const documentType of ['OFFICIAL', 'EMPLOYMENT', 'CAREER']) for (const [widthMm, heightMm] of [[20, 30], [50, 50]]) {
        const letter = { ...source, documentType, branding: { ...source.branding, sealWidthMm: widthMm, sealHeightMm: heightMm },
          content: documentType === 'OFFICIAL' ? content : { title: documentType === 'CAREER' ? '경력증명서' : '재직증명서', certificate: { ...certificate, endDate: documentType === 'CAREER' ? '2026-09-30' : '' } } };
        const pdf = await renderOfficialLetterPdf(letter, images);
        assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.7');
        assert.match(pdf.toString('latin1'), /\/PrintScaling\s*\/None\b/);
        const matrices = imageMatrices(pdf);
        assert.ok(matrices.length >= 2, 'the PDF must draw both company logo and seal');
        const seal = matrices.at(-1);
        assert.ok(Math.abs(seal.width - widthMm * 72 / 25.4) < 0.002, `${documentType} seal width must be exactly ${widthMm} mm`);
        assert.ok(Math.abs(seal.height - heightMm * 72 / 25.4) < 0.002, `${documentType} seal height must be exactly ${heightMm} mm`);
        fs.writeFileSync(path.join(output, `seal-${widthMm}x${heightMm}-${documentType.toLowerCase()}.pdf`), pdf);
      }
    });
    await t.test('legacy snapshots keep their original aspect-ratio fitted seal sizes', async () => {
      const source = await load(letterId);
      const images = { logo: Buffer.from(png.split(',')[1], 'base64'), seal: Buffer.from(rectangularPng.split(',')[1], 'base64') };
      const { sealWidthMm, sealHeightMm, ...legacyBranding } = source.branding;
      assert.ok(sealWidthMm && sealHeightMm);
      for (const [documentType, legacyWidth] of [['OFFICIAL', 66], ['EMPLOYMENT', 64], ['CAREER', 64]]) {
        const letter = { ...source, documentType, branding: legacyBranding,
          content: documentType === 'OFFICIAL' ? content : { title: '증명서', certificate: { ...certificate, endDate: documentType === 'CAREER' ? '2026-09-30' : '' } } };
        const pdf = await renderOfficialLetterPdf(letter, images);
        const seal = imageMatrices(pdf).at(-1);
        assert.ok(seal, 'the legacy PDF must still contain the seal');
        assert.equal(seal.width, legacyWidth); assert.equal(seal.height, legacyWidth / 2);
      }
    });
    await t.test('seal print calibration PDF uses one A4 sheet, exact seal size and physical reference vectors', async () => {
      const { settings } = await call('admin', 'bootstrap');
      const output = path.resolve(__dirname, '../../tmp/pdfs');
      const sealBytes = Buffer.from(rectangularPng.split(',')[1], 'base64');
      const near = (value, points) => Math.abs(value - points) < 0.002;
      for (const [sealWidthMm, sealHeightMm] of [[20, 30], [50, 50]]) {
        const pdf = await renderSealPrintTestPdf({ ...settings, sealWidthMm, sealHeightMm }, { seal: sealBytes });
        assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.7');
        assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
        assert.match(pdf.toString('latin1'), /\/MediaBox\s*\[0 0 595\.28 841\.89\]/);
        assert.match(pdf.toString('latin1'), /\/PrintScaling\s*\/None\b/);
        const seal = imageMatrices(pdf).at(-1);
        assert.ok(seal); assert.ok(near(seal.width, sealWidthMm * 72 / 25.4)); assert.ok(near(seal.height, sealHeightMm * 72 / 25.4));
        const commands = decodedPdfStreams(pdf).join('\n');
        const lines = [...commands.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/g)].map(match => ({
          x: Number(match[1]), y: Number(match[2]),
          width: Math.abs(Number(match[3]) - Number(match[1])), height: Math.abs(Number(match[4]) - Number(match[2])),
        }));
        assert.ok(lines.some(line => near(line.width, 100 * 72 / 25.4) && line.height === 0), 'horizontal 100 mm ruler must be an actual vector of that length');
        assert.ok(lines.some(line => near(line.height, 100 * 72 / 25.4) && line.width === 0), 'vertical 100 mm ruler must be an actual vector of that length');
        for (let millimeters = 0; millimeters <= 100; millimeters++) {
          const tick = millimeters % 10 === 0 ? 3 : millimeters % 5 === 0 ? 2 : 1;
          assert.ok(lines.some(line => near(line.x, (40 + millimeters) * 72 / 25.4) && near(line.y, 176 * 72 / 25.4) &&
            line.width === 0 && near(line.height, tick * 72 / 25.4)), `horizontal ruler tick ${millimeters} must be at its exact 1 mm position`);
          assert.ok(lines.some(line => near(line.x, 40 * 72 / 25.4) && near(line.y, (176 + millimeters) * 72 / 25.4) &&
            line.height === 0 && near(line.width, tick * 72 / 25.4)), `vertical ruler tick ${millimeters} must be at its exact 1 mm position`);
        }
        const squares = [...commands.matchAll(/[-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+) re/g)];
        assert.ok(squares.some(square => near(Math.abs(Number(square[1])), 50 * 72 / 25.4) && near(Math.abs(Number(square[2])), 50 * 72 / 25.4)), 'the physical reference square must measure 50 mm on both sides');
        fs.writeFileSync(path.join(output, `seal-print-test-${sealWidthMm}x${sealHeightMm}.pdf`), pdf);
      }
    });
  } finally { await deleteApp(app); }
});
