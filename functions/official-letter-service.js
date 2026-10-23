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
function numberLabel(front, date) {
  return `${String(front).padStart(3, '0')}-${date.replaceAll('-', '').slice(2)}`;
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
  const notificationRef = (uid, letterId) => db.collection('officialLetterNotifications').doc(uid).collection('items').doc(letterId);

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

  // Prepare all reads first; document and inbox changes commit in the same transaction.
  async function notifications(tx, ref, previous, next, event, user, timestamp) {
    const admins = await tx.get(db.collection('UserProfile').where('companyId', '==', next.companyId).where('role', '==', 'ADMIN'));
    const profiles = new Map(admins.docs.filter(d => !d.data().status || d.data().status === 'ACTIVE').map(d => [d.id, d.data()]));
    const first = next.status === 'PENDING' ? next.approvalLine.find(step => !step.approvedAt) : null;
    const actionIds = next.status === 'PENDING' ? (first ? [first.uid] : [...profiles.keys()]) : [];
    let informationIds = event === 'SUBMITTED' ? [] : [next.creatorId];
    if (event === 'ISSUED') informationIds = next.participantIds;
    if (event === 'REASSIGNED') informationIds = [...informationIds, ...next.approvalLine.map(step => step.uid)];
    const candidates = [...new Set([...actionIds, ...informationIds])];
    for (const uid of candidates) {
      if (!profiles.has(uid)) {
        const snapshot = await tx.get(db.collection('UserProfile').doc(uid));
        if (snapshot.exists) profiles.set(uid, snapshot.data());
      }
    }
    const recipientIds = candidates.filter(uid => {
      const person = profiles.get(uid);
      return person?.companyId === next.companyId && ['ADMIN', 'SUB_ADMIN', 'MEMBER'].includes(person.role) &&
        (!person.status || person.status === 'ACTIVE');
    });
    const oldIds = [...new Set([...(previous.notificationRecipientIds || []), ...previous.participantIds])];
    if (new Set([...oldIds, ...recipientIds]).size > 400) fail('resource-exhausted', '알림 수신자가 너무 많습니다. 회사 관리자에게 문의해 주세요.');
    const titles = { SUBMITTED: '공문 결재가 요청되었습니다.', STEP_APPROVED: '공문 중간 결재가 승인되었습니다.',
      REJECTED: '공문이 반려되었습니다.', ISSUED: '공문이 최종 승인되어 발행되었습니다.',
      CONTENT_CHANGED: '공문 내용이 수정되어 재결재가 필요합니다.', REASSIGNED: '공문 결재자가 재배정되었습니다.' };
    return { recipientIds, removedIds: oldIds.filter(uid => !recipientIds.includes(uid)),
      items: recipientIds.map(uid => ({ ref: notificationRef(uid, ref.id), data: {
        companyId: next.companyId, recipientId: uid, recipientRole: profiles.get(uid).role,
        letterId: ref.id, revision: next.revision, event, title: actionIds.includes(uid) ? '공문 결재 차례입니다.' : titles[event],
        status: next.status, requiresAction: actionIds.includes(uid),
        readAt: uid === user.uid && !actionIds.includes(uid) ? timestamp : null,
        createdAt: timestamp, updatedAt: timestamp,
      } })) };
  }
  function writeNotifications(tx, ref, plan) {
    for (const uid of plan.removedIds) tx.delete(notificationRef(uid, ref.id));
    for (const item of plan.items) tx.set(item.ref, item.data);
  }

  return async function manage(request) {
    const input = request.data || {};
    const action = input.action;
    if (action === 'ackNotification') {
      return db.runTransaction(async tx => {
        const user = await actor(request, tx);
        const ref = letterRef(input.id);
        const inbox = notificationRef(user.uid, ref.id);
        const item = (await tx.get(inbox)).data();
        if (!item) fail('not-found', '알림이 삭제되었거나 결재자가 변경되었습니다.');
        const letter = (await tx.get(ref)).data(); access(user, letter);
        if (item.companyId !== user.companyId || item.recipientId !== user.uid || item.recipientRole !== user.role) {
          fail('permission-denied', '이 알림에 접근할 수 없습니다.');
        }
        if (item.revision !== letter.revision || (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== item.updatedAt)) {
          fail('aborted', '새 알림으로 변경되었습니다. 목록을 확인해 주세요.');
        }
        tx.update(inbox, { readAt: now().toISOString() });
        return { success: true };
      });
    }
    if (action === 'approverCandidates') {
      const user = await actor(request); admin(user);
      const current = (await letterRef(input.id).get()).data(); access(user, current);
      const profiles = await db.collection('UserProfile').where('companyId', '==', user.companyId).get();
      return { candidates: profiles.docs.filter(d => d.id !== current.creatorId &&
        ['MEMBER', 'SUB_ADMIN'].includes(d.data().role) && (!d.data().status || d.data().status === 'ACTIVE'))
        .map(d => ({ uid: d.id, name: d.data().name || d.id, role: d.data().role,
          teamId: d.data().teamId || '', divisionId: d.data().divisionId || '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')) };
    }
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
          lastFront: integer(data.lastFront),
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
          const changed = { ...current, content, revision: current.revision + 1, status: 'DRAFT', approvedRevision: null,
            approvalLine: current.approvalLine.map(step => ({ ...step, approvedAt: null })),
            rejectionReason: '', updatedAt: timestamp, updatedBy: user.uid };
          const plan = await notifications(tx, ref, current, changed, 'CONTENT_CHANGED', user, timestamp);
          tx.create(versionRef(ref, current.revision), { ...current, archivedAt: timestamp, archivedBy: user.uid });
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
        }
      });
      return { id: ref.id };
    }
    if (['submit', 'review', 'deleteHistory', 'reassign'].includes(action)) {
      const ref = letterRef(input.id);
      return db.runTransaction(async tx => {
        const user = await actor(request, tx);
        const current = (await tx.get(ref)).data(); access(user, current); expected(current, input.revision);
        const timestamp = now().toISOString();
        if (action === 'reassign') {
          admin(user);
          const reason = text(input.reason, 1000);
          if (!Array.isArray(input.approverIds) || input.approverIds.length > 10) fail('invalid-argument', '결재자는 최대 10명까지 지정할 수 있습니다.');
          const uids = input.approverIds.map(id);
          if (new Set(uids).size !== uids.length || uids.includes(current.creatorId)) fail('invalid-argument', '작성자 또는 중복 결재자는 지정할 수 없습니다.');
          const approvalLine = [];
          for (const uid of uids) {
            const person = (await tx.get(db.collection('UserProfile').doc(uid))).data();
            if (!person || person.companyId !== user.companyId || !['MEMBER', 'SUB_ADMIN'].includes(person.role) ||
                (person.status && person.status !== 'ACTIVE')) fail('invalid-argument', '소속 회사의 활성 직원만 중간 결재자로 지정할 수 있습니다.');
            approvalLine.push({ uid, name: person.name || uid, approvedAt: null });
          }
          const changed = { ...current, approvalLine, participantIds: [current.creatorId, ...uids], revision: current.revision + 1,
            status: current.status === 'PENDING' ? 'PENDING' : 'DRAFT', approvedRevision: null, rejectionReason: '',
            reassignment: { reason, by: user.uid, at: timestamp, previousApproverIds: current.approvalLine.map(step => step.uid) },
            updatedAt: timestamp, updatedBy: user.uid };
          const plan = await notifications(tx, ref, current, changed, 'REASSIGNED', user, timestamp);
          tx.create(versionRef(ref, current.revision), { ...current, archivedAt: timestamp, archivedBy: user.uid });
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
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
          const changed = { ...current, status: 'PENDING', branding: { companyName, address, representative, phone, email, logoPath, sealPath },
            approvalLine: current.approvalLine.map(step => ({ ...step, approvedAt: null })),
            updatedAt: timestamp, updatedBy: user.uid, rejectionReason: '' };
          const plan = await notifications(tx, ref, current, changed, 'SUBMITTED', user, timestamp);
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
        if (current.status !== 'PENDING') fail('failed-precondition', '결재 대기 중인 공문만 승인·반려할 수 있습니다.');
        const nextStep = current.approvalLine.find(step => !step.approvedAt);
        if (user.role !== 'ADMIN' && nextStep?.uid !== user.uid) fail('permission-denied', '현재 결재 순서가 아닙니다.');
        if (input.decision === 'reject') {
          const changed = { ...current, status: 'REJECTED', rejectionReason: text(input.reason, 1000),
            updatedAt: timestamp, updatedBy: user.uid, rejectedBy: user.uid };
          const plan = await notifications(tx, ref, current, changed, 'REJECTED', user, timestamp);
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
        if (input.decision !== 'approve') fail('invalid-argument', '승인 또는 반려를 선택해 주세요.');
        if (user.role !== 'ADMIN') {
          const changed = { ...current, approvalLine: current.approvalLine.map(step => step.uid === user.uid ? { ...step, approvedAt: timestamp } : step),
            updatedAt: timestamp, updatedBy: user.uid };
          const plan = await notifications(tx, ref, current, changed, 'STEP_APPROVED', user, timestamp);
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
        if (nextStep) fail('failed-precondition', '팀장·본부장 결재가 완료된 후 최종 승인할 수 있습니다.');
        const setting = settingsRef(user.companyId);
        const settings = (await tx.get(setting)).data();
        if (!settings) fail('failed-precondition', '문서번호 초기 설정이 필요합니다.');
        const front = input.front == null ? settings.lastFront + 1 : integer(input.front, 1);
        integer(front, 1);
        const issueDate = koreaDate(now());
        if (input.issueDate !== undefined && input.issueDate !== issueDate) {
          fail('invalid-argument', '발행일은 한국 현재 날짜로 자동 기록됩니다.');
        }
        const number = numberLabel(front, issueDate);
        const reservation = db.collection('officialLetterNumbers').doc(`${user.companyId}_${number}`);
        if ((await tx.get(reservation)).exists) fail('already-exists', '이미 발행된 문서번호입니다. 다른 번호를 입력해 주세요.');
        const legacy = await tx.get(db.collection('officialLetterNumbers').where('companyId', '==', user.companyId)
          .where('number', '>=', `${number}-`).where('number', '<=', `${number}-\uf8ff`).limit(1));
        if (!legacy.empty) fail('already-exists', '동일한 순번과 발행일의 기존 공문이 있습니다. 다른 번호를 입력해 주세요.');
        const changed = { ...current, status: 'ISSUED', number, front, issueDate, numberFormatVersion: 2, approvedRevision: current.revision,
          approvedBy: user.uid, approvedByName: user.name || '', approvedAt: timestamp, everIssued: true,
          updatedAt: timestamp, updatedBy: user.uid };
        const plan = await notifications(tx, ref, current, changed, 'ISSUED', user, timestamp);
        tx.create(reservation, { companyId: user.companyId, letterId: ref.id, revision: current.revision, number, issuedAt: timestamp });
        tx.update(setting, { lastFront: Math.max(settings.lastFront, front),
          version: settings.version + 1 });
        tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
        writeNotifications(tx, ref, plan);
        return { success: true, number };
      });
    }
    fail('invalid-argument', '지원하지 않는 공문 작업입니다.');
  };
}

module.exports = { createOfficialLetterService, koreaDate, numberLabel };
