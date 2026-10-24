const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');
const { createPrinterInspectionService, printerInspectionActions } = require('./official-letter-printers');
const { authorizeContext } = require('./security-context');

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const fail = (code, message, details) => { throw new HttpsError(code, message, details); };
const templateFields = { companyName: '회사명', address: '회사 주소', representative: '대표자', logoPath: '회사 로고', sealPath: '대표자 인감' };
function templateStatus(settings) {
  const missingFields = Object.keys(templateFields).filter(key => typeof settings?.[key] !== 'string' || !settings[key].trim());
  return { configured: missingFields.length === 0, missingFields };
}
function requireTemplate(settings) {
  const status = templateStatus(settings);
  if (!status.configured) fail('failed-precondition',
    `회사 서류 템플릿에 ${status.missingFields.map(key => templateFields[key]).join('·')}이(가) 저장되지 않았습니다. ADMIN이 회사 서류 템플릿에서 필수 항목을 입력하고 템플릿 저장을 완료해 주세요.`, { ...status, code: 'MISSING_TEMPLATE_FIELDS' });
}
function sealDimension(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 5 || value > 50 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-7) {
    fail('invalid-argument', '인감 가로·세로 크기는 각각 5~50mm 범위에서 0.1mm 단위로 입력해 주세요.');
  }
  return value;
}
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
const documentTypeInput = value => {
  if (!['OFFICIAL', 'EMPLOYMENT', 'CAREER'].includes(value)) fail('invalid-argument', '서류 종류를 확인해 주세요.');
  return value;
};
const certificateDate = (value, today, required = true) => {
  const result = text(value || '', 10, required);
  if (!result && !required) return '';
  const parsed = new Date(`${result}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || result < '1900-01-01' || result > today ||
      Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    fail('invalid-argument', '날짜는 유효한 과거 또는 오늘 날짜(YYYY-MM-DD)로 입력해 주세요.');
  }
  return result;
};
function contentInput(data, type, today) {
  if (type !== 'OFFICIAL') {
    const c = data.certificate || {};
    const certificate = {
      nameKo: text(c.nameKo, 80), nameEn: text(c.nameEn || '', 100, false),
      birthDate: certificateDate(c.birthDate, today, false), address: text(c.address, 300),
      division: text(c.division, 120), position: text(c.position, 100),
      startDate: certificateDate(c.startDate, today), endDate: certificateDate(c.endDate, today, type === 'CAREER'),
      purpose: text(c.purpose, 200), department: text(c.department || '', 100, false),
      contactName: text(c.contactName || '', 80, false), contactPhone: text(c.contactPhone || '', 80, false),
    };
    if ((type === 'EMPLOYMENT' && certificate.endDate) ||
        (certificate.endDate && certificate.endDate < certificate.startDate) ||
        (certificate.birthDate && certificate.birthDate > certificate.startDate)) {
      fail('invalid-argument', '재직·경력 기간과 생년월일을 확인해 주세요.');
    }
    return { recipient: '', reference: '', title: type === 'EMPLOYMENT' ? '재직증명서' : '경력증명서',
      body: '', attachments: '', certificate };
  }
  return {
    recipient: text(data.recipient, 200), reference: text(data.reference || '', 200, false),
    title: text(data.title, 200), body: text(data.body, 20000),
    attachments: text(data.attachments || '', 1000, false),
  };
}

/** All official-letter writes go through this service, including ADMIN writes. */
function createOfficialLetterService({ db, bucket, renderPdf, renderPrintTestPdf, now = () => new Date() }) {
  const read = (reader, ref) => reader === db ? ref.get() : reader.get(ref);
  const settingsRef = companyId => db.collection('officialLetterSettings').doc(companyId);
  const letterRef = letterId => db.collection('officialLetters').doc(id(letterId));
  const versionRef = (ref, revision) => ref.collection('history').doc(String(revision).padStart(6, '0'));
  const notificationRef = (uid, letterId) => db.collection('officialLetterNotifications').doc(uid).collection('items').doc(letterId);

  async function actor(request, reader = db) {
    const user = await authorizeContext({ db, request, reader, now });
    const settings = (await read(reader, settingsRef(user.companyId))).data();
    return { ...user, uid: request.auth.uid, companyName: user.company.nameKo,
      documentApprovalGranted: user.role === 'SUB_ADMIN' && Boolean(user.divisionId) &&
        (settings?.documentApproverIds || []).includes(request.auth.uid) };
  }
  function admin(user) {
    if (user.role !== 'ADMIN') fail('permission-denied', '회사 최고관리자(ADMIN) 권한이 필요합니다.');
  }
  function access(user, letter) {
    if (!letter || letter.companyId !== user.companyId ||
        (user.role !== 'ADMIN' && !letter.participantIds.includes(user.uid) && !delegated(user, letter))) {
      fail('permission-denied', '작성자와 해당 공문의 결재라인만 접근할 수 있습니다.');
    }
  }
  function delegated(user, letter) {
    return user.documentApprovalGranted && letter.divisionId === user.divisionId &&
      ['PENDING', 'REJECTED', 'ISSUED'].includes(letter.status) && letter.creatorId !== user.uid;
  }
  function permissions(user, letter) {
    const next = letter.approvalLine.find(step => !step.approvedAt);
    return { canReview: letter.status === 'PENDING' &&
      (user.role === 'ADMIN' || next?.uid === user.uid || (!next && delegated(user, letter))),
    canFinalApprove: letter.status === 'PENDING' && !next && (user.role === 'ADMIN' || delegated(user, letter)) };
  }
  function summary(snapshot, user) {
    const d = snapshot.data();
    return { id: snapshot.id, documentType: d.documentType || 'OFFICIAL', title: d.content.title,
      recipient: d.content.certificate?.nameKo || d.content.recipient, creatorId: d.creatorId, creatorName: d.creatorName, status: d.status,
      revision: d.revision, number: d.number || '', updatedAt: d.updatedAt, createdAt: d.createdAt,
      issueDate: d.issueDate || '', pdfReady: Boolean(d.pdfReady && d.pdf?.revision === d.revision && d.approvedRevision === d.revision),
      ...permissions(user, d) };
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
    // Bound base64 allocation before decoding; the JPEG data-URL prefix is 23 characters.
    if (typeof value !== 'string' || value.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3) + 23) fail('invalid-argument', '이미지는 3MB 이하여야 합니다.');
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) fail('invalid-argument', 'PNG 또는 JPEG 이미지만 등록할 수 있습니다.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail('invalid-argument', '이미지는 3MB 이하여야 합니다.');
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
    if (next.status === 'PENDING' && !first && next.divisionId) {
      const settings = (await tx.get(settingsRef(next.companyId))).data();
      for (const uid of settings?.documentApproverIds || []) {
        if (!profiles.has(uid)) {
          const snapshot = await tx.get(db.collection('UserProfile').doc(uid));
          if (snapshot.exists) profiles.set(uid, snapshot.data());
        }
        const person = profiles.get(uid);
        if (person?.role === 'SUB_ADMIN' && person.companyId === next.companyId && person.divisionId === next.divisionId &&
            (!person.status || person.status === 'ACTIVE') && uid !== next.creatorId) actionIds.push(uid);
      }
    }
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
    const titles = { SUBMITTED: '서류 결재가 요청되었습니다.', STEP_APPROVED: '서류 중간 결재가 승인되었습니다.',
      REJECTED: '서류가 반려되었습니다.', ISSUED: '서류가 최종 승인되어 발행되었습니다.',
      CONTENT_CHANGED: '서류 내용이 수정되어 재결재가 필요합니다.', REASSIGNED: '서류 결재자가 재배정되었습니다.' };
    return { recipientIds, removedIds: oldIds.filter(uid => !recipientIds.includes(uid)),
      items: recipientIds.map(uid => ({ ref: notificationRef(uid, ref.id), data: {
        companyId: next.companyId, recipientId: uid, recipientRole: profiles.get(uid).role,
        letterId: ref.id, revision: next.revision, event, title: actionIds.includes(uid) ? '서류 결재 차례입니다.' : titles[event],
        documentType: next.documentType || 'OFFICIAL',
        delegatedApproval: profiles.get(uid).role === 'SUB_ADMIN' && !next.participantIds.includes(uid), divisionId: next.divisionId || '',
        status: next.status, requiresAction: actionIds.includes(uid),
        readAt: uid === user.uid && !actionIds.includes(uid) ? timestamp : null,
        createdAt: timestamp, updatedAt: timestamp,
      } })) };
  }
  function writeNotifications(tx, ref, plan) {
    for (const uid of plan.removedIds) tx.delete(notificationRef(uid, ref.id));
    for (const item of plan.items) tx.set(item.ref, item.data);
  }

  async function issue(tx, user, current, ref, input, timestamp) {
    const setting = settingsRef(user.companyId);
    const settings = (await tx.get(setting)).data();
    if (!settings) fail('failed-precondition', '문서번호 초기 설정이 필요합니다.');
    if (input.front != null && user.role !== 'ADMIN') fail('permission-denied', '문서번호 변경은 ADMIN만 가능합니다.');
    const front = input.front == null ? settings.lastFront + 1 : integer(input.front, 1);
    integer(front, 1);
    const issueDate = koreaDate(now());
    if (input.issueDate !== undefined && input.issueDate !== issueDate) fail('invalid-argument', '발행일은 한국 현재 날짜로 자동 기록됩니다.');
    const number = numberLabel(front, issueDate);
    const reservation = db.collection('officialLetterNumbers').doc(`${user.companyId}_${number}`);
    if ((await tx.get(reservation)).exists) fail('already-exists', '이미 발행된 문서번호입니다. 다른 번호를 입력해 주세요.');
    const legacy = await tx.get(db.collection('officialLetterNumbers').where('companyId', '==', user.companyId)
      .where('number', '>=', `${number}-`).where('number', '<=', `${number}-\uf8ff`).limit(1));
    if (!legacy.empty) fail('already-exists', '동일한 순번과 발행일의 기존 서류가 있습니다. 다른 번호를 입력해 주세요.');
    const changed = { ...current, status: 'ISSUED', number, front, issueDate, numberFormatVersion: 2,
      approvedRevision: current.revision, approvedBy: user.uid, approvedByName: user.name || '', approvedAt: timestamp,
      everIssued: true, pdf: null, pdfReady: false, updatedAt: timestamp, updatedBy: user.uid };
    const plan = await notifications(tx, ref, current, changed, 'ISSUED', user, timestamp);
    tx.create(reservation, { companyId: user.companyId, letterId: ref.id, revision: current.revision, number, issuedAt: timestamp });
    tx.update(setting, { lastFront: Math.max(settings.lastFront, front), version: settings.version + 1 });
    tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
    writeNotifications(tx, ref, plan);
    return { success: true, issued: true, number, revision: current.revision };
  }

  async function ensurePdf(request, ref, revision) {
    const user = await actor(request);
    const letter = (await ref.get()).data(); access(user, letter); expected(letter, revision);
    if (letter.status !== 'ISSUED' || letter.approvedRevision !== revision) {
      fail('failed-precondition', '현재 수정본의 최종 승인 후 PDF를 생성할 수 있습니다.');
    }
    const path = `companies/${letter.companyId}/official-pdfs/${ref.id}/${revision}-${letter.number}.pdf`;
    let bytes;
    if (letter.pdfReady && letter.pdf?.path === path && letter.pdf.revision === revision && letter.pdf.number === letter.number) {
      try { [bytes] = await bucket.file(path).download(); } catch { /* Regenerate a missing private object. */ }
    }
    if (!bytes) {
      const [logo, seal] = await Promise.all([
        bucket.file(letter.branding.logoPath).download(), bucket.file(letter.branding.sealPath).download(),
      ]);
      bytes = await renderPdf(letter, { logo: logo[0], seal: seal[0] });
      await bucket.file(path).save(bytes, { resumable: false,
        metadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' } });
    }
    // A cached or newly rendered file is never returned after access/approval revocation.
    try {
      await db.runTransaction(async tx => {
        const currentUser = await actor(request, tx);
        const current = (await tx.get(ref)).data(); access(currentUser, current); expected(current, revision);
        if (current.status !== 'ISSUED' || current.approvedRevision !== revision || current.number !== letter.number) {
          fail('aborted', '승인 상태가 변경되었습니다.');
        }
        if (!current.pdfReady || current.pdf?.path !== path) {
          tx.update(ref, { pdfReady: true, pdf: { path, revision, number: letter.number, readyAt: now().toISOString() } });
        }
      });
    } catch (error) {
      const current = (await ref.get()).data();
      if (!current || current.revision !== revision || current.number !== letter.number || current.status !== 'ISSUED') {
        try { await bucket.file(path).delete({ ignoreNotFound: true }); } catch { /* Private stale files remain inaccessible. */ }
      }
      throw error;
    }
    return bytes;
  }

  const managePrinters = createPrinterInspectionService({ db, actor, admin, text, id, now, koreaDate, certificateDate, requireTemplate, sealDimension });
  return async function manage(request) {
    const input = request.data || {};
    const action = input.action;
    if (printerInspectionActions.includes(action)) return managePrinters(request);
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
    if (action === 'sealPrintTest') {
      // Test output uses only the current company's saved assets and never issues a document.
      const { user, settings } = await db.runTransaction(async tx => {
        const user = await actor(request, tx); admin(user);
        const settings = (await tx.get(settingsRef(user.companyId))).data();
        requireTemplate(settings);
        if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
          fail('invalid-argument', '저장된 템플릿 버전을 확인해 주세요.');
        }
        if (settings.version !== input.expectedVersion) fail('aborted', '회사 템플릿이 변경되었습니다. 최신 설정을 다시 불러와 주세요.');
        if (settings.sealWidthMm == null || settings.sealHeightMm == null) {
          fail('failed-precondition', '인감 가로·세로 mm 크기를 지정하고 회사 템플릿을 먼저 저장해 주세요.');
        }
        sealDimension(settings.sealWidthMm); sealDimension(settings.sealHeightMm);
        return { user, settings };
      });
      const [seal] = await bucket.file(settings.sealPath).download();
      const bytes = await renderPrintTestPdf(settings, { seal });
      // Recheck access and the saved snapshot after rendering, before disclosing a seal PDF.
      await db.runTransaction(async tx => {
        const currentUser = await actor(request, tx); admin(currentUser);
        if (currentUser.companyId !== user.companyId) fail('aborted', '소속 회사가 변경되었습니다. 다시 로그인해 주세요.');
        const current = (await tx.get(settingsRef(user.companyId))).data();
        if (current?.version !== settings.version || current.sealPath !== settings.sealPath ||
            current.sealWidthMm !== settings.sealWidthMm || current.sealHeightMm !== settings.sealHeightMm) {
          fail('aborted', '회사 템플릿이 변경되었습니다. 최신 설정으로 다시 테스트해 주세요.');
        }
      });
      return { base64: bytes.toString('base64'), filename: 'seal-print-test.pdf' };
    }
    // Read paths also authorize against server profiles, never browser role claims.
    if (action === 'bootstrap') {
      const user = await actor(request);
      const snapshot = await settingsRef(user.companyId).get();
      const settings = snapshot.data() || null;
      const visibleSettings = settings ? { ...settings } : null;
      if (visibleSettings && user.role !== 'ADMIN') delete visibleSettings.documentApproverIds;
      const documentApprovers = user.role === 'ADMIN' ? (await db.collection('UserProfile').where('companyId', '==', user.companyId).get()).docs
        .filter(d => d.data().role === 'SUB_ADMIN' && d.data().divisionId && (!d.data().status || d.data().status === 'ACTIVE'))
        .map(d => ({ uid: d.id, name: d.data().name || d.id, role: 'SUB_ADMIN', divisionId: d.data().divisionId })) : [];
      const team = user.teamId ? (await db.collection('teams').doc(user.teamId).get()).data() : null;
      const division = user.divisionId ? (await db.collection('divisions').doc(user.divisionId).get()).data() : null;
      const divisionName = division?.companyId === user.companyId ? division.name || '' : '';
      const teamName = team?.companyId === user.companyId ? team.name || '' : '';
      return {
        settings: settings ? { ...visibleSettings, logoData: await imageData(settings.logoPath),
          sealData: user.role === 'ADMIN' ? await imageData(settings.sealPath) : '' } : null,
        templateStatus: templateStatus(settings),
        companyName: user.companyName, approvalLine: await routing(user, db),
        canApproveDocuments: user.role === 'ADMIN' || user.documentApprovalGranted, documentApprovers,
        employeeDefaults: { nameKo: user.name || '', nameEn: '', birthDate: '', address: user.address || '',
          division: [divisionName, teamName].filter(Boolean).join(' / '), position: '', startDate: user.joinDate || '', endDate: '',
          purpose: '', department: '', contactName: '', contactPhone: settings?.phone || '' },
      };
    }
    if (['list', 'approvals', 'mine'].includes(action)) {
      const user = await actor(request);
      if (action === 'approvals' && !['ADMIN', 'SUB_ADMIN'].includes(user.role)) fail('permission-denied', '결재함 접근 권한이 없습니다.');
      let query = db.collection('officialLetters').where('companyId', '==', user.companyId);
      if (user.role !== 'ADMIN' && !user.documentApprovalGranted) query = query.where('participantIds', 'array-contains', user.uid);
      // The membership query uses the dedicated officialLetters composite index.
      const snapshots = await query.get();
      return { letters: snapshots.docs.filter(snapshot => {
        const d = snapshot.data();
        const visible = user.role === 'ADMIN' || d.participantIds.includes(user.uid) || delegated(user, d);
        if (action === 'mine') return d.creatorId === user.uid && d.status === 'ISSUED' && d.approvedRevision === d.revision;
        if (action === 'approvals') return visible && d.status !== 'DRAFT';
        return visible;
      }).map(snapshot => summary(snapshot, user)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
    }
    if (['get', 'history', 'pdf'].includes(action)) {
      const user = await actor(request);
      const ref = letterRef(input.id);
      const snapshot = await ref.get();
      const letter = snapshot.data();
      access(user, letter);
      if (action === 'get') return { letter: { id: snapshot.id, ...letter, documentType: letter.documentType || 'OFFICIAL', permissions: permissions(user, letter),
        ...(letter.branding ? { branding: { ...letter.branding, logoData: await imageData(letter.branding.logoPath),
          sealData: user.role === 'ADMIN' ? await imageData(letter.branding.sealPath) : '' } } : {}),
      } };
      if (action === 'history') {
        admin(user);
        const history = await ref.collection('history').orderBy('revision', 'desc').get();
        return { history: history.docs.map(d => ({ historyId: d.id, ...d.data() })) };
      }
      const bytes = await ensurePdf(request, ref, input.revision);
      return { base64: bytes.toString('base64'), filename: `${letter.number}.pdf` };
    }
    if (action === 'saveSettings') {
      const user = await actor(request);
      admin(user);
      const data = input.settings || {};
      const values = {
        companyId: user.companyId, companyName: text(data.companyName ?? '', 120, false),
        companyNameEn: text(data.companyNameEn || '', 120, false),
        address: text(data.address ?? '', 300, false), representative: text(data.representative ?? '', 80, false),
        phone: text(data.phone || '', 80, false), email: text(data.email || '', 120, false),
      };
      const [logoPath, sealPath] = await Promise.all([
        uploadImage(data.logoData, user.companyId), uploadImage(data.sealData, user.companyId),
      ]);
      const saved = await db.runTransaction(async tx => {
        const currentUser = await actor(request, tx); admin(currentUser);
        if (currentUser.companyId !== user.companyId) fail('aborted', '소속 회사가 변경되었습니다. 다시 로그인해 주세요.');
        const ref = settingsRef(user.companyId);
        const existing = (await tx.get(ref)).data();
        if ((existing?.version || 0) !== input.expectedVersion) fail('aborted', '설정이 변경되었습니다. 다시 불러와 주세요.');
        const documentApproverIds = data.documentApproverIds ?? existing?.documentApproverIds ?? [];
        if (!Array.isArray(documentApproverIds) || documentApproverIds.length > 50 || new Set(documentApproverIds).size !== documentApproverIds.length) {
          fail('invalid-argument', '서류 승인 권한은 중복 없이 최대 50명에게 부여할 수 있습니다.');
        }
        for (const uid of documentApproverIds) {
          const person = (await tx.get(db.collection('UserProfile').doc(id(uid)))).data();
          if (!person || person.companyId !== user.companyId || person.role !== 'SUB_ADMIN' || !person.divisionId ||
              (person.status && person.status !== 'ACTIVE')) fail('invalid-argument', '본부가 지정된 소속 회사의 활성 SUB_ADMIN만 서류 승인자로 지정할 수 있습니다.');
        }
        const initial = !existing ? {
          lastFront: integer(data.lastFront ?? 0),
        } : {};
        const finalValues = { ...existing, ...values, ...initial, documentApproverIds, logoPath: logoPath || existing?.logoPath || '',
          sealPath: sealPath || existing?.sealPath || '',
          sealWidthMm: sealDimension(data.sealWidthMm ?? existing?.sealWidthMm ?? 23.3),
          sealHeightMm: sealDimension(data.sealHeightMm ?? existing?.sealHeightMm ?? 23.3), version: (existing?.version || 0) + 1,
        };
        requireTemplate(finalValues);
        tx.set(ref, { ...finalValues,
          updatedAt: now().toISOString(), updatedBy: user.uid });
        return { revoked: (existing?.documentApproverIds || []).filter(uid => !documentApproverIds.includes(uid)),
          version: finalValues.version, assets: { logoRegistered: Boolean(finalValues.logoPath), sealRegistered: Boolean(finalValues.sealPath) } };
      });
      // Content access is revoked by settings immediately. Clear generic inbox tasks
      // separately, rechecking each current item to preserve reassigned/new grants.
      for (const uid of saved.revoked) {
        const inbox = await db.collection('officialLetterNotifications').doc(uid).collection('items').where('companyId', '==', user.companyId).get();
        const refs = inbox.docs.filter(d => d.data().delegatedApproval).map(d => d.ref);
        for (let offset = 0; offset < refs.length; offset += 200) {
          await db.runTransaction(async tx => {
            const currentUser = await actor(request, tx); admin(currentUser);
            if (currentUser.companyId !== user.companyId) fail('aborted', '소속 회사가 변경되었습니다.');
            const settings = (await tx.get(settingsRef(user.companyId))).data();
            if ((settings?.documentApproverIds || []).includes(uid)) return;
            const items = await tx.getAll(...refs.slice(offset, offset + 200));
            for (const item of items) {
              if (item.exists && item.data().companyId === user.companyId && item.data().delegatedApproval) tx.delete(item.ref);
            }
          });
        }
      }
      return { success: true, version: saved.version, assets: saved.assets };
    }
    if (action === 'save') {
      const ref = input.id ? letterRef(input.id) : db.collection('officialLetters').doc();
      await db.runTransaction(async tx => {
        const user = await actor(request, tx);
        const timestamp = now().toISOString();
        const current = input.id ? (await tx.get(ref)).data() : null;
        if (input.id) { access(user, current); expected(current, input.revision); }
        const documentType = documentTypeInput(input.documentType ?? current?.documentType ?? 'OFFICIAL');
        if (current && documentType !== (current.documentType || 'OFFICIAL')) fail('invalid-argument', '저장한 서류의 종류는 변경할 수 없습니다. 새로 신청해 주세요.');
        const content = contentInput(input.content || {}, documentType, koreaDate(now()));
        if (!input.id) {
          const approvalLine = await routing(user, tx);
          tx.create(ref, { companyId: user.companyId, creatorId: user.uid, creatorName: user.name || '',
            participantIds: [...new Set([user.uid, ...approvalLine.map(step => step.uid)])],
            approvalLine, content, documentType, divisionId: user.divisionId || '', teamId: user.teamId || '',
            revision: 1, status: 'DRAFT', everIssued: false, pdfReady: false,
            createdAt: timestamp, updatedAt: timestamp, updatedBy: user.uid });
        } else {
          if (user.role !== 'ADMIN' && !current.participantIds.includes(user.uid)) fail('permission-denied', '작성자와 지정 결재자만 내용을 수정할 수 있습니다.');
          if (current.everIssued) admin(user);
          const changed = { ...current, content, documentType, revision: current.revision + 1, status: 'DRAFT', approvedRevision: null,
            pdf: null, pdfReady: false, automaticApproval: false,
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
      if (action === 'deleteHistory') {
        const user = await actor(request); admin(user);
        const current = (await ref.get()).data(); access(user, current); expected(current, input.revision);
        const history = (await ref.collection('history').doc(id(input.historyId)).get()).data();
        if (!history) fail('not-found', '보관 이력이 없습니다.');
        // Delete content before removing its retryable archive entry. The number
        // reservation stays permanent, and no caller-supplied storage path is used.
        if (Number.isInteger(history.revision) && history.revision > 0 &&
            /^\d{3}-\d{6}(?:-\d{3})?$/.test(history.number || '')) {
          await bucket.file(`companies/${user.companyId}/official-pdfs/${ref.id}/${history.revision}-${history.number}.pdf`)
            .delete({ ignoreNotFound: true });
        }
      }
      const result = await db.runTransaction(async tx => {
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
            pdf: null, pdfReady: false, automaticApproval: false,
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
          if (user.role !== 'ADMIN' && !current.participantIds.includes(user.uid)) fail('permission-denied', '작성자와 지정 결재자만 결재 요청할 수 있습니다.');
          if (!['DRAFT', 'REJECTED'].includes(current.status)) fail('failed-precondition', '작성 또는 반려 상태에서 결재 요청할 수 있습니다.');
          // Revalidate stored certificate dates against the actual submission date.
          contentInput(current.content, current.documentType || 'OFFICIAL', koreaDate(now()));
          const settings = (await tx.get(settingsRef(user.companyId))).data();
          requireTemplate(settings);
          const { companyName, address, representative, phone, email, logoPath, sealPath } = settings;
          const sealSize = settings.sealWidthMm != null && settings.sealHeightMm != null ?
            { sealWidthMm: sealDimension(settings.sealWidthMm), sealHeightMm: sealDimension(settings.sealHeightMm) } : {};
          const changed = { ...current, status: 'PENDING', branding: { companyName, companyNameEn: settings.companyNameEn || '', address, representative, phone, email, logoPath, sealPath, ...sealSize },
            approvalLine: current.approvalLine.map(step => ({ ...step, approvedAt: null })),
            updatedAt: timestamp, updatedBy: user.uid, rejectionReason: '' };
          if (user.role === 'ADMIN' && current.creatorId === user.uid) {
            return issue(tx, user, { ...changed, automaticApproval: true,
              automaticApprovalLine: changed.approvalLine, approvalLine: [] }, ref, {}, timestamp);
          }
          const plan = await notifications(tx, ref, current, changed, 'SUBMITTED', user, timestamp);
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
        if (current.status !== 'PENDING') fail('failed-precondition', '결재 대기 중인 공문만 승인·반려할 수 있습니다.');
        const nextStep = current.approvalLine.find(step => !step.approvedAt);
        if (!permissions(user, current).canReview) fail('permission-denied', '현재 결재 순서가 아닙니다.');
        if (input.decision === 'reject') {
          const changed = { ...current, status: 'REJECTED', rejectionReason: text(input.reason, 1000),
            updatedAt: timestamp, updatedBy: user.uid, rejectedBy: user.uid };
          const plan = await notifications(tx, ref, current, changed, 'REJECTED', user, timestamp);
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
        if (input.decision !== 'approve') fail('invalid-argument', '승인 또는 반려를 선택해 주세요.');
        if (user.role !== 'ADMIN' && nextStep?.uid === user.uid) {
          const changed = { ...current, approvalLine: current.approvalLine.map(step => step.uid === user.uid ? { ...step, approvedAt: timestamp } : step),
            updatedAt: timestamp, updatedBy: user.uid };
          const plan = await notifications(tx, ref, current, changed, 'STEP_APPROVED', user, timestamp);
          tx.update(ref, { ...changed, notificationRecipientIds: plan.recipientIds });
          writeNotifications(tx, ref, plan);
          return { success: true };
        }
        if (nextStep) fail('failed-precondition', '팀장·본부장 결재가 완료된 후 최종 승인할 수 있습니다.');
        return issue(tx, user, current, ref, input, timestamp);
      });
      if (result.issued) {
        try {
          await ensurePdf(request, ref, result.revision);
          return { success: true, number: result.number, pdfReady: true };
        } catch (error) {
          if (error instanceof HttpsError) throw error;
          // Issuance and its number remain committed; a private PDF can be retried.
          return { success: true, number: result.number, pdfReady: false };
        }
      }
      return result;
    }
    fail('invalid-argument', '지원하지 않는 공문 작업입니다.');
  };
}

module.exports = { createOfficialLetterService, koreaDate, numberLabel };
