const { createHash, randomUUID } = require('node:crypto');
const { authorizeContext, fail } = require('./security-context');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const filename = value => {
  const clean = String(value || '첨부파일').replace(/[\\/\u0000-\u001f\u007f]/g, '_');
  const points = Array.from(clean);
  if (points.length <= 240) return clean;
  const suffix = /\.(?:pdf|png|jpe?g|webp|gif)$/i.exec(clean)?.[0] || '';
  return points.slice(0, 240 - suffix.length).join('') + suffix;
};
const uuidInput = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    fail('invalid-argument', '첨부자료 식별자를 확인해 주세요.');
  }
  return value.toLowerCase();
};
const documentId = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) fail('invalid-argument', '기안서를 다시 선택해 주세요.');
  return value;
};
const revisionInput = value => {
  if (typeof value === 'string' && /^[1-9][0-9]{0,14}$/.test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || value < 1) fail('invalid-argument', '기안서 개정을 확인해 주세요.');
  return value;
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const key = values => digest(JSON.stringify(values));
const descriptorKey = file => JSON.stringify([file?.id, file?.name, file?.contentType, file?.size]);

function fileType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function fileNameMatches(name, type) {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
  return type === 'image/jpeg' ? ['jpg', 'jpeg'].includes(extension) : extension === TYPES[type];
}

/** Immutable staged files. Only a saved current/archive reference permits download. */
function createDraftingAttachments({ db, bucket, now = () => new Date(), uuid = randomUUID }) {
  const authorize = request => authorizeContext({ db, request, now });
  function scope(user, current, requestId) {
    if (current && current.companyId !== user.companyId) fail('permission-denied', '소속 회사의 기안서만 사용할 수 있습니다.');
    const value = current ? current.drafting?.attachmentScope || key([user.companyId, current.creatorId, documentId(current.id)])
      : key([user.companyId, user.uid, uuidInput(requestId)]);
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('failed-precondition', '기안서 첨부자료 설정을 확인해 주세요.');
    return value;
  }
  const prefixFor = (user, current, requestId) => `companies/${user.companyId}/drafting-attachments/${scope(user, current, requestId)}/`;
  const filePath = (user, current, requestId, attachmentId) => prefixFor(user, current, requestId) + uuidInput(attachmentId);
  function access(user, letter) {
    if (!letter || letter.companyId !== user.companyId || letter.documentType !== 'DRAFTING' ||
        ['DELETING', 'DELETED'].includes(letter.status) ||
        (user.role !== 'ADMIN' && !letter.participantIds?.includes(user.uid))) {
      fail('permission-denied', '기안자와 지정 결재자만 첨부자료를 열람할 수 있습니다.');
    }
  }
  function editable(user, letter) {
    access(user, letter);
    if ((user.role !== 'ADMIN' && letter.creatorId !== user.uid) || (letter.everIssued && user.role !== 'ADMIN')) {
      fail('permission-denied', '기안자 또는 회사 관리자만 첨부자료를 변경할 수 있습니다.');
    }
  }
  async function load(document) {
    const ref = db.collection('officialLetters').doc(documentId(document));
    const snapshot = await ref.get();
    return { ref, letter: snapshot.exists ? { ...snapshot.data(), id: ref.id || document } : null };
  }
  async function metadata(user, current, requestId, attachmentId) {
    const id = uuidInput(attachmentId);
    const file = bucket.file(filePath(user, current, requestId, id));
    let result;
    try { [result] = await file.getMetadata(); }
    catch (error) { if (error.code === 404) fail('not-found', '첨부자료를 찾을 수 없습니다.'); throw error; }
    const detail = result.metadata || {};
    const size = Number(result.size);
    const name = filename(detail.name);
    if (!TYPES[result.contentType] || !Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES ||
        detail.companyId !== user.companyId || detail.scope !== scope(user, current, requestId) ||
        detail.attachmentId !== id || detail.size !== String(size) || typeof detail.uploadedBy !== 'string' ||
        !/^[a-f0-9]{64}$/.test(detail.sha256 || '') || !fileNameMatches(name, result.contentType) ||
        detail.name !== name || result.metadata?.firebaseStorageDownloadTokens) {
      fail('invalid-argument', '첨부자료의 형식 또는 저장 정보를 확인해 주세요.');
    }
    return { file, descriptor: { id, name, contentType: result.contentType, size }, detail };
  }
  async function resolve(user, current, requestId, inputFiles) {
    if (inputFiles === undefined) inputFiles = current?.content?.attachmentFiles || [];
    if (!Array.isArray(inputFiles) || inputFiles.length > MAX_FILES) fail('invalid-argument', '첨부자료는 최대 5개까지 등록할 수 있습니다.');
    const existing = new Set((current?.content?.attachmentFiles || []).map(file => file.id));
    const ids = inputFiles.map(file => uuidInput(typeof file === 'string' ? file : file?.id));
    if (new Set(ids).size !== ids.length) fail('invalid-argument', '중복 첨부자료를 제거해 주세요.');
    const result = [];
    for (const attachmentId of ids) {
      const uploaded = await metadata(user, current, requestId, attachmentId);
      if (!existing.has(attachmentId) && uploaded.detail.uploadedBy !== user.uid) fail('permission-denied', '직접 등록한 첨부자료만 추가할 수 있습니다.');
      result.push(uploaded.descriptor);
    }
    if (result.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) fail('resource-exhausted', '첨부자료 합계는 30MB 이하여야 합니다.');
    return result;
  }
  async function uploadContext(request, query) {
    const user = await authorize(request);
    if (query.documentId !== undefined) {
      const { letter } = await load(query.documentId);
      editable(user, letter);
      if (letter.revision !== revisionInput(query.revision)) fail('aborted', '기안서가 변경되었습니다. 최신 내용을 다시 열어 주세요.');
      return { user, letter, binding: scope(user, letter) };
    }
    const requestId = uuidInput(query.requestId);
    const binding = scope(user, null, requestId);
    if ((await db.collection('draftingRequests').doc(binding).get()).exists) fail('failed-precondition', '저장된 기안서를 다시 열고 첨부자료를 등록해 주세요.');
    return { user, letter: null, requestId, binding };
  }
  function sameUser(initial, current) {
    return ['uid', 'companyId', 'role', 'divisionId', 'teamId'].every(field => initial[field] === current[field]);
  }
  async function upload(request, query, bytes, contentType, originalName) {
    const initial = await uploadContext(request, query);
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) fail('resource-exhausted', '첨부자료는 파일당 10MB 이하여야 합니다.');
    const type = fileType(bytes);
    const name = filename(originalName);
    if (!type || contentType?.split(';')[0] !== type || !fileNameMatches(name, type)) fail('invalid-argument', 'PDF, PNG, JPG, WebP 또는 GIF 파일을 선택해 주세요.');
    const attachmentId = uuidInput(uuid());
    const file = bucket.file(filePath(initial.user, initial.letter, initial.requestId, attachmentId));
    await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: {
      contentType: type, cacheControl: 'private, no-store', metadata: { attachmentId, name, companyId: initial.user.companyId,
        scope: initial.binding, uploadedBy: initial.user.uid, sha256: digest(bytes), size: String(bytes.length) },
    } });
    try {
      const current = await uploadContext(request, query);
      if (!sameUser(initial.user, current.user) || initial.binding !== current.binding || initial.letter?.revision !== current.letter?.revision) {
        fail('permission-denied', '소속 또는 기안서 정보가 변경되었습니다.');
      }
    } catch (error) { await file.delete().catch(() => {}); throw error; }
    return { id: attachmentId, name, contentType: type, size: bytes.length };
  }
  async function downloadContext(request, query) {
    const user = await authorize(request);
    const { ref, letter } = await load(query.documentId);
    access(user, letter);
    if (letter.revision !== revisionInput(query.revision)) fail('aborted', '기안서가 변경되었습니다. 최신 내용을 다시 열어 주세요.');
    let version = letter;
    if (query.historyId !== undefined) {
      if (user.role !== 'ADMIN') fail('permission-denied', '보관본 첨부자료는 회사 관리자만 열람할 수 있습니다.');
      if (typeof query.historyId !== 'string' || !/^[0-9]{6,15}$/.test(query.historyId)) fail('invalid-argument', '보관본을 다시 선택해 주세요.');
      const snapshot = await ref.collection('history').doc(query.historyId).get();
      version = snapshot.exists ? { ...snapshot.data(), id: letter.id } : null;
      if (!version || version.documentType !== 'DRAFTING' || version.companyId !== user.companyId || version.creatorId !== letter.creatorId) {
        fail('not-found', '기안서 보관본을 찾을 수 없습니다.');
      }
    }
    const attachmentId = uuidInput(query.attachmentId);
    const descriptor = version.content?.attachmentFiles?.find(file => file.id === attachmentId);
    if (!descriptor) fail('not-found', '이 기안서에 등록된 첨부자료가 아닙니다.');
    return { user, letter, version, attachmentId, descriptor, path: filePath(user, version, undefined, attachmentId),
      signature: JSON.stringify([letter.revision, letter.status, version.revision, version.drafting?.attachmentScope, descriptor]) };
  }
  async function download(request, query) {
    const initial = await downloadContext(request, query);
    const stored = await metadata(initial.user, initial.version, undefined, initial.attachmentId);
    if (descriptorKey(stored.descriptor) !== descriptorKey(initial.descriptor)) fail('failed-precondition', '첨부자료 정보가 변경되었습니다.');
    const [bytes] = await stored.file.download({ validation: 'crc32c' });
    if (!Buffer.isBuffer(bytes) || bytes.length !== stored.descriptor.size || bytes.length > MAX_BYTES ||
        fileType(bytes) !== stored.descriptor.contentType || digest(bytes) !== stored.detail.sha256) {
      fail('invalid-argument', '첨부자료의 형식 또는 무결성을 확인해 주세요.');
    }
    const current = await downloadContext(request, query);
    if (!sameUser(initial.user, current.user) || initial.path !== current.path || initial.signature !== current.signature) {
      fail('permission-denied', '첨부자료 접근 정보가 변경되었습니다.');
    }
    return { bytes, ...stored.descriptor };
  }
  return { scope, prefixFor, resolve, upload, download };
}

module.exports = { createDraftingAttachments, fileType, filename, TYPES, MAX_BYTES, MAX_FILES, MAX_TOTAL_BYTES };
