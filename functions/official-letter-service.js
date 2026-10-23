const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');

const fail = (code, message) => { throw new HttpsError(code, message); };
const text = (value, max, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    fail('invalid-argument', '입력값의 형식 또는 길이를 확인해 주세요.');
  }
  return value.trim();
};
const id = value => {
  const result = text(value, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail('invalid-argument', '잘못된 문서 ID입니다.');
  return result;
};
const integer = (value, min = 0) => {
  if (!Number.isInteger(value) || value < min || value > 999) {
    fail('invalid-argument', '문서번호는 000~999 범위의 정수여야 합니다.');
  }
  return value;
};
function koreaDate(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
}
function numberLabel(front, date, serial) {
  return `${String(front).padStart(3, '0')}-${date.replaceAll('-', '').slice(2)}-${String(serial).padStart(3, '0')}`;
}
function contentInput(data) {
  return {
    recipient: text(data.recipient, 200), reference: text(data.reference || '', 200, false),
    title: text(data.title, 200), body: text(data.body, 20000),
    attachments: text(data.attachments || '', 1000, false),
  };
}

/** All official-letter writes go through this service, including ADMIN writes. */
function createOfficialLetterService({ db, bucket, renderPdf, now = () => new Date() }) {
  const read = (reader, ref) => reader === db ? ref.get() : reader.get(ref);
  const settingsRef = companyId => db.collection('officialLetterSettings').doc(companyId);
  const letterRef = letterId => db.collection('officialLetters').doc(id(letterId));
  const versionRef = (ref, revision) => ref.collection('history').doc(String(revision).padStart(6, '0'));

  async function actor(request, reader = db) {
    if (!request.auth) fail('unauthenticated', '로그인이 필요합니다.');
    const snapshot = await read(reader, db.collection('UserProfile').doc(request.auth.uid));
    const user = snapshot.data();
    if (!snapshot.exists || !user.companyId || user.companyId === 'PLATFORM' ||
        !['ADMIN', 'SUB_ADMIN', 'MEMBER'].includes(user.role) ||
        (user.status && user.status !== 'ACTIVE')) {
      fail('permission-denied', '소속 회사의 활성 계정이 필요합니다.');
    }
    const company = await read(reader, db.collection('companies').doc(user.companyId));
    if (!company.exists || company.data().status !== 'ACTIVE') {
      fail('permission-denied', '활성 회사에서만 공문을 사용할 수 있습니다.');
    }
    return { ...user, uid: request.auth.uid, companyName: company.data().nameKo };
  }
  function admin(user) {
    if (user.role !== 'ADMIN') fail('permission-denied', '회사 최고관리자(ADMIN) 권한이 필요합니다.');
  }
  function access(user, letter) {
    if (!letter || letter.companyId !== user.companyId ||
        (user.role !== 'ADMIN' && !letter.participantIds.includes(user.uid))) {
      fail('permission-denied', '작성자와 해당 공문의 결재라인만 접근할 수 있습니다.');
    }
  }
  function expected(letter, revision) {
    if (!Number.isInteger(revision) || letter.revision !== revision) {
      fail('aborted', '다른 사용자가 변경했습니다. 최신 내용을 다시 열어 주세요.');
    }
  }
  async function imageData(path) {
    if (!path) return '';
    const [bytes] = await bucket.file(path).download();
    return `data:image/${path.endsWith('.png') ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
  }
  async function uploadImage(value, companyId) {
    if (!value) return '';
    if (typeof value !== 'string' || value.length > 420000) fail('invalid-argument', '이미지는 300KB 이하여야 합니다.');
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) fail('invalid-argument', 'PNG 또는 JPEG 이미지만 등록할 수 있습니다.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 300 * 1024) fail('invalid-argument', '이미지는 300KB 이하여야 합니다.');
    // PDFKit validates actual image bytes and dimensions, not just the MIME label.
    const PDFImage = require('pdfkit/js/pdfkit').prototype.openImage;
    let parsed;
    try { parsed = PDFImage.call({ _imageRegistry: {}, _imageCount: 0 }, bytes); }
    catch { fail('invalid-argument', '이미지 파일을 읽을 수 없습니다.'); }
    if (parsed.width > 4096 || parsed.height > 4096 || parsed.width < 1 || parsed.height < 1 ||
        (match[1] === 'png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') ||
        (match[1] === 'jpeg' && bytes.subarray(0, 2).toString('hex') !== 'ffd8')) {
      fail('invalid-argument', '이미지 형식과 크기(최대 4096px)를 확인해 주세요.');
    }
    const path = `companies/${companyId}/official-assets/${createHash('sha256').update(bytes).digest('hex')}.${match[1] === 'png' ? 'png' : 'jpg'}`;
    await bucket.file(path).save(bytes, {
      resumable: false, metadata: { contentType: `image/${match[1]}`, cacheControl: 'private, no-store' },
    });
    return path;
  }
  async function routing(user, reader) {
    const candidates = [];
    if (user.teamId) {
      const team = await read(reader, db.collection('teams').doc(user.teamId));
      if (team.exists && team.data().companyId === user.companyId && team.data().leaderId) candidates.push(team.data().leaderId);
    }
    if (user.divisionId) {
      const division = await read(reader, db.collection('divisions').doc(user.divisionId));
      if (division.exists && division.data().companyId === user.companyId && division.data().headId) candidates.push(division.data().headId);
    }
    const line = [];
    for (const uid of [...new Set(candidates)].filter(uid => uid !== user.uid)) {
      const profile = await read(reader, db.collection('UserProfile').doc(uid));
      const person = profile.data();
      if (profile.exists && person.companyId === user.companyId && person.role !== 'ADMIN' &&
          (!person.status || person.status === 'ACTIVE')) {
        line.push({ uid, name: person.name || uid, approvedAt: null });
      }
    }
    return line;
  }

  return async function manage(request) {
    const input = request.data || {};
    const action = input.action;
    // Read paths also authorize against server profiles, never browser role claims.
    if (action === 'bootstrap') {
      const user = await actor(request);
      const snapshot = await settingsRef(user.companyId).get();
      const settings = snapshot.data() || null;
      return {
        settings: settings ? { ...settings, logoData: await imageData(settings.logoPath),
          sealData: user.role === 'ADMIN' ? await imageData(settings.sealPath) : '' } : null,
        companyName: user.companyName, approvalLine: await routing(user, db),
      };
    }
    if (action === 'list') {
      const user = await actor(request);
      let query = db.collection('officialLetters').where('companyId', '==', user.companyId);
      if (user.role !== 'ADMIN') query = query.where('participantIds', 'array-contains', user.uid);
      // The membership query uses the dedicated officialLetters composite index.
      const snapshots = await query.get();
      return { letters: snapshots.docs.map(snapshot => {
        const d = snapshot.data();
        return { id: snapshot.id, title: d.content.title, recipient: d.content.recipient,
          creatorName: d.creatorName, status: d.status, revision: d.revision,
          number: d.number || '', updatedAt: d.updatedAt };
      }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
    }
    if (['get', 'history', 'pdf'].includes(action)) {
      const user = await actor(request);
      const ref = letterRef(input.id);
      const snapshot = await ref.get();
      const letter = snapshot.data();
      access(user, letter);
      if (action === 'get') return { letter: { id: snapshot.id, ...letter,
        ...(letter.branding ? { branding: { ...letter.branding, logoData: await imageData(letter.branding.logoPath),
          sealData: user.role === 'ADMIN' ? await imageData(letter.branding.sealPath) : '' } } : {}),
      } };
      if (action === 'history') {
        admin(user);
        const history = await ref.collection('history').orderBy('revision', 'desc').get();
        return { history: history.docs.map(d => ({ historyId: d.id, ...d.data() })) };
      }
      expected(letter, input.revision);
      if (letter.status !== 'ISSUED' || letter.approvedRevision !== letter.revision) {
        fail('failed-precondition', '현재 수정본에 대한 최고관리자 승인 후 PDF를 생성할 수 있습니다.');
      }
      const [logo, seal] = await Promise.all([
        bucket.file(letter.branding.logoPath).download(), bucket.file(letter.branding.sealPath).download(),
      ]);
      const bytes = await renderPdf(letter, { logo: logo[0], seal: seal[0] });
      // Edits or revoked membership during rendering must not expose a stale PDF.
      await db.runTransaction(async tx => {
        const currentUser = await actor(request, tx);
        const current = (await tx.get(ref)).data();
        access(currentUser, current);
        expected(current, input.revision);
        if (current.status !== 'ISSUED' || current.approvedRevision !== input.revision) fail('aborted', '승인 상태가 변경되었습니다.');
      });
      return { base64: bytes.toString('base64'), filename: `${letter.number}.pdf` };
    }
    if (action === 'saveSettings') {
      const user = await actor(request);
      admin(user);
      const data = input.settings || {};
      const values = {
        companyId: user.companyId, companyName: text(data.companyName, 120),
        address: text(data.address, 300), representative: text(data.representative, 80),
        phone: text(data.phone || '', 80, false), email: text(data.email || '', 120, false),
      };
      const [logoPath, sealPath] = await Promise.all([
        uploadImage(data.logoData, user.companyId), uploadImage(data.sealData, user.companyId),
      ]);
      await db.runTransaction(async tx => {
        const currentUser = await actor(request, tx); admin(currentUser);
        const ref = settingsRef(user.companyId);
        const existing = (await tx.get(ref)).data();
        if ((existing?.version || 0) !== input.expectedVersion) fail('aborted', '설정이 변경되었습니다. 다시 불러와 주세요.');
        const initial = !existing ? {
          lastFront: integer(data.lastFront), lastSerial: integer(data.lastSerial),
        } : {};
        tx.set(ref, { ...existing, ...values, ...initial, logoPath: logoPath || existing?.logoPath || '',
          sealPath: sealPath || existing?.sealPath || '', version: (existing?.version || 0) + 1,
          updatedAt: now().toISOString(), updatedBy: user.uid });
      });
      return { success: true };
    }
    if (action === 'save') {
      const content = contentInput(input.content || {});
      const ref = input.id ? letterRef(input.id) : db.collection('officialLetters').doc();
      await db.runTransaction(async tx => {
        const user = await actor(request, tx);
        const timestamp = now().toISOString();
        if (!input.id) {
          const approvalLine = await routing(user, tx);
          tx.create(ref, { companyId: user.companyId, creatorId: user.uid, creatorName: user.name || '',
            participantIds: [...new Set([user.uid, ...approvalLine.map(step => step.uid)])],
            approvalLine, content, revision: 1, status: 'DRAFT', everIssued: false,
            createdAt: timestamp, updatedAt: timestamp, updatedBy: user.uid });
        } else {
          const current = (await tx.get(ref)).data(); access(user, current); expected(current, input.revision);
          if (current.everIssued) admin(user);
          tx.create(versionRef(ref, current.revision), { ...current, archivedAt: timestamp, archivedBy: user.uid });
          tx.update(ref, { content, revision: current.revision + 1, status: 'DRAFT', approvedRevision: null,
            approvalLine: current.approvalLine.map(step => ({ ...step, approvedAt: null })),
            rejectionReason: '', updatedAt: timestamp, updatedBy: user.uid });
        }
      });
      return { id: ref.id };
    }
    if (['submit', 'review', 'deleteHistory'].includes(action)) {
      const ref = letterRef(input.id);
      return db.runTransaction(async tx => {
        const user = await actor(request, tx);
        const current = (await tx.get(ref)).data(); access(user, current); expected(current, input.revision);
        const timestamp = now().toISOString();
        if (action === 'deleteHistory') {
          admin(user);
          const historyRef = ref.collection('history').doc(id(input.historyId));
          const history = await tx.get(historyRef);
          if (!history.exists) fail('not-found', '보관 이력이 없습니다.');
          // Number reservations remain permanent even when archived content is removed.
          tx.delete(historyRef);
          return { success: true };
        }
        if (action === 'submit') {
          if (!['DRAFT', 'REJECTED'].includes(current.status)) fail('failed-precondition', '작성 또는 반려 상태에서 결재 요청할 수 있습니다.');
          const settings = (await tx.get(settingsRef(user.companyId))).data();
          if (!settings?.logoPath || !settings?.sealPath || !settings?.representative || !settings?.address) {
            fail('failed-precondition', '회사 관리자가 먼저 로고·주소·대표자·인감을 등록해야 합니다.');
          }
          const { companyName, address, representative, phone, email, logoPath, sealPath } = settings;
          tx.update(ref, { status: 'PENDING', branding: { companyName, address, representative, phone, email, logoPath, sealPath },
            approvalLine: current.approvalLine.map(step => ({ ...step, approvedAt: null })),
            updatedAt: timestamp, updatedBy: user.uid, rejectionReason: '' });
          return { success: true };
        }
        if (current.status !== 'PENDING') fail('failed-precondition', '결재 대기 중인 공문만 승인·반려할 수 있습니다.');
        const nextStep = current.approvalLine.find(step => !step.approvedAt);
        if (user.role !== 'ADMIN' && nextStep?.uid !== user.uid) fail('permission-denied', '현재 결재 순서가 아닙니다.');
        if (input.decision === 'reject') {
          tx.update(ref, { status: 'REJECTED', rejectionReason: text(input.reason, 1000),
            updatedAt: timestamp, updatedBy: user.uid, rejectedBy: user.uid });
          return { success: true };
        }
        if (input.decision !== 'approve') fail('invalid-argument', '승인 또는 반려를 선택해 주세요.');
        if (user.role !== 'ADMIN') {
          tx.update(ref, { approvalLine: current.approvalLine.map(step => step.uid === user.uid ? { ...step, approvedAt: timestamp } : step),
            updatedAt: timestamp, updatedBy: user.uid });
          return { success: true };
        }
        if (nextStep) fail('failed-precondition', '팀장·본부장 결재가 완료된 후 최종 승인할 수 있습니다.');
        const setting = settingsRef(user.companyId);
        const settings = (await tx.get(setting)).data();
        if (!settings) fail('failed-precondition', '문서번호 초기 설정이 필요합니다.');
        const front = input.front == null ? settings.lastFront + 1 : integer(input.front, 1);
        const serial = input.serial == null ? settings.lastSerial + 1 : integer(input.serial, 1);
        integer(front, 1); integer(serial, 1);
        const issueDate = input.issueDate || koreaDate(now());
        if (typeof issueDate !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(issueDate) ||
            Number.isNaN(Date.parse(issueDate)) || new Date(issueDate).toISOString().slice(0, 10) !== issueDate) {
          fail('invalid-argument', '유효한 발행일을 입력해 주세요.');
        }
        const number = numberLabel(front, issueDate, serial);
        const reservation = db.collection('officialLetterNumbers').doc(`${user.companyId}_${number}`);
        if ((await tx.get(reservation)).exists) fail('already-exists', '이미 발행된 문서번호입니다. 다른 번호를 입력해 주세요.');
        tx.create(reservation, { companyId: user.companyId, letterId: ref.id, revision: current.revision, number, issuedAt: timestamp });
        tx.update(setting, { lastFront: Math.max(settings.lastFront, front), lastSerial: Math.max(settings.lastSerial, serial),
          version: settings.version + 1 });
        tx.update(ref, { status: 'ISSUED', number, front, serial, issueDate, approvedRevision: current.revision,
          approvedBy: user.uid, approvedByName: user.name || '', approvedAt: timestamp, everIssued: true,
          updatedAt: timestamp, updatedBy: user.uid });
        return { success: true, number };
      });
    }
    fail('invalid-argument', '지원하지 않는 공문 작업입니다.');
  };
}

module.exports = { createOfficialLetterService, koreaDate, numberLabel };
