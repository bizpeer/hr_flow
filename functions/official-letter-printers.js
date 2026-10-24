const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');

const fail = (code, message) => { throw new HttpsError(code, message); };
const actions = ['listPrinters', 'savePrinter', 'listPrinterInspections', 'recordPrinterInspection'];
const version = value => {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid-argument', '저장된 버전을 확인해 주세요.');
  return value;
};
function measurement(value, max = 200) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > max ||
      Math.abs(value * 10 - Math.round(value * 10)) > 1e-7) {
    fail('invalid-argument', `실측값은 0.1~${max}mm 범위에서 0.1mm 단위로 입력해 주세요.`);
  }
  return value;
}

/** Company-scoped printer profiles and immutable, idempotent inspection records. */
function createPrinterInspectionService({ db, actor, admin, text, id, now, koreaDate, certificateDate, requireTemplate, sealDimension }) {
  const printers = companyId => db.collection('officialLetterPrinters').doc(companyId).collection('printers');
  const settingsRef = companyId => db.collection('officialLetterSettings').doc(companyId);
  const authorize = async (request, tx) => { const user = await actor(request, tx); admin(user); return user; };
  function profile(snapshot, companyId) {
    if (!snapshot.exists || snapshot.data().companyId !== companyId) fail('not-found', '소속 회사의 프린터를 찾을 수 없습니다.');
    return { ...snapshot.data(), id: snapshot.id };
  }
  async function page(tx, collection, input, field, key) {
    const pageSize = input.pageSize ?? 20;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) fail('invalid-argument', '조회 개수는 1~50개여야 합니다.');
    let query = collection.orderBy(field, 'desc');
    if (input.after !== undefined) {
      const cursor = await tx.get(collection.doc(id(input.after)));
      if (!cursor.exists) fail('invalid-argument', '조회 기준이 변경되었습니다. 목록을 새로고침해 주세요.');
      query = query.startAfter(cursor);
    }
    const snapshot = await tx.get(query.limit(pageSize + 1));
    const rows = snapshot.docs.slice(0, pageSize);
    return { [key]: rows.map(row => {
      const { inputHash: _inputHash, ...data } = row.data();
      return { ...data, id: row.id };
    }), nextCursor: snapshot.size > pageSize ? rows.at(-1).id : null };
  }
  return async request => {
    const input = request.data || {};
    return db.runTransaction(async tx => {
      const user = await authorize(request, tx);
      const collection = printers(user.companyId);
      if (input.action === 'listPrinters') return page(tx, collection, input, 'createdAt', 'printers');
      if (input.action === 'savePrinter') {
        const data = input.printer || {};
        if (typeof data.active !== 'boolean') fail('invalid-argument', '프린터 사용 상태를 확인해 주세요.');
        const values = { name: text(data.name, 100), model: text(data.model || '', 100, false),
          location: text(data.location || '', 200, false), active: data.active };
        const expectedVersion = version(input.expectedVersion);
        const ref = input.printerId === undefined ? collection.doc() : collection.doc(id(input.printerId));
        const existing = input.printerId === undefined ? null : profile(await tx.get(ref), user.companyId);
        if ((existing?.version || 0) !== expectedVersion) fail('aborted', '프린터 정보가 변경되었습니다. 최신 정보를 확인해 주세요.');
        const timestamp = now().toISOString();
        const saved = { ...values, companyId: user.companyId, version: expectedVersion + 1,
          createdAt: existing?.createdAt || timestamp, createdBy: existing?.createdBy || user.uid,
          updatedAt: timestamp, updatedBy: user.uid };
        tx.set(ref, saved);
        return { printer: { ...saved, id: ref.id } };
      }
      const ref = collection.doc(id(input.printerId));
      const printer = profile(await tx.get(ref), user.companyId);
      if (input.action === 'listPrinterInspections') return page(tx, ref.collection('inspections'), input, 'recordedAt', 'inspections');

      const data = input.inspection || {};
      if (typeof input.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) {
        fail('invalid-argument', '점검 저장 요청 ID를 확인해 주세요.');
      }
      if (data.actualSizeConfirmed !== true) fail('invalid-argument', 'A4 · 실제 크기(100%) 출력 여부를 확인해 주세요.');
      const values = {
        inspectedOn: certificateDate(data.inspectedOn, koreaDate(now())),
        measuredSealWidthMm: measurement(data.measuredSealWidthMm), measuredSealHeightMm: measurement(data.measuredSealHeightMm),
        horizontal100Mm: measurement(data.horizontal100Mm), vertical100Mm: measurement(data.vertical100Mm),
        toleranceMm: measurement(data.toleranceMm, 5), note: text(data.note || '', 1000, false),
        printSettings: text(data.printSettings || '', 200, false), actualSizeConfirmed: true,
      };
      const printerVersion = version(input.expectedPrinterVersion), settingsVersion = version(input.expectedSettingsVersion);
      const inputHash = createHash('sha256').update(JSON.stringify({ values, printerVersion, settingsVersion, uid: user.uid })).digest('hex');
      const inspectionRef = ref.collection('inspections').doc(input.requestId.toLowerCase());
      const previous = (await tx.get(inspectionRef)).data();
      if (previous) {
        if (previous.inputHash !== inputHash) fail('already-exists', '이 요청은 이미 저장되었습니다. 새 점검으로 등록해 주세요.');
        const { inputHash: _inputHash, ...inspection } = previous;
        return { inspection: { ...inspection, id: inspectionRef.id } };
      }
      if (!printer.active) fail('failed-precondition', '보관된 프린터는 사용 상태로 복원한 후 점검을 등록해 주세요.');
      if (printer.version !== printerVersion) fail('aborted', '프린터 정보가 변경되었습니다. 최신 정보를 확인해 주세요.');
      const settings = (await tx.get(settingsRef(user.companyId))).data();
      requireTemplate(settings);
      if (settings.version !== settingsVersion) fail('aborted', '회사 템플릿이 변경되었습니다. 최신 시험 PDF로 다시 확인해 주세요.');
      if (settings.sealWidthMm == null || settings.sealHeightMm == null) fail('failed-precondition', '인감 mm 규격을 템플릿에 먼저 저장해 주세요.');
      const sealWidthMm = sealDimension(settings.sealWidthMm), sealHeightMm = sealDimension(settings.sealHeightMm);
      const delta = (measured, expected) => Math.round((measured - expected) * 10) / 10;
      const deviations = { sealWidthMm: delta(values.measuredSealWidthMm, sealWidthMm), sealHeightMm: delta(values.measuredSealHeightMm, sealHeightMm),
        horizontal100Mm: delta(values.horizontal100Mm, 100), vertical100Mm: delta(values.vertical100Mm, 100) };
      const inspection = { ...values, companyId: user.companyId, printerId: ref.id,
        paperSize: 'A4', scalePercent: 100, result: Object.values(deviations).every(value => Math.abs(value) <= values.toleranceMm) ? 'PASS' : 'RECHECK',
        deviations, printerSnapshot: { name: printer.name, model: printer.model, location: printer.location, version: printer.version },
        templateSnapshot: { version: settings.version, companyName: settings.companyName, sealWidthMm, sealHeightMm,
          sealAssetId: settings.sealPath.split('/').at(-1) },
        recordedAt: now().toISOString(), recordedBy: user.uid, recordedByName: user.name || user.uid };
      tx.create(inspectionRef, { ...inspection, inputHash });
      return { inspection: { ...inspection, id: inspectionRef.id } };
    });
  };
}
module.exports = { createPrinterInspectionService, printerInspectionActions: actions };
