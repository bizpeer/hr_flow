const { createHash } = require('node:crypto');
const { fail } = require('./security-context');

const key = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const identifier = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) fail('invalid-argument', '조직 식별자를 확인해 주세요.');
  return value;
};
const routeInput = value => {
  if (!value || Object.keys(value).some(field => !['teamLeader', 'divisionHead', 'cooperationDivisionIds', 'representative'].includes(field)) ||
      ['teamLeader', 'divisionHead', 'representative'].some(field => typeof value[field] !== 'boolean') ||
      !Array.isArray(value.cooperationDivisionIds) || value.cooperationDivisionIds.length > 5 ||
      new Set(value.cooperationDivisionIds).size !== value.cooperationDivisionIds.length ||
      (!value.representative && !value.divisionHead)) fail('invalid-argument', '본부장 전결 또는 대표 최종 결재를 선택해 주세요. 협조 본부는 중복 없이 최대 5개입니다.');
  return { teamLeader: value.teamLeader, divisionHead: value.divisionHead,
    cooperationDivisionIds: value.cooperationDivisionIds.map(identifier), representative: value.representative };
};

function createDraftingWorkflow({ db, now }) {
  const read = (reader, ref) => reader === db ? ref.get() : reader.get(ref);
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now());
  async function person(uid, companyId, reader) {
    if (!uid || typeof uid !== 'string' || uid.includes('/')) return null;
    const snapshot = await read(reader, db.collection('UserProfile').doc(uid));
    const profile = snapshot.data();
    return snapshot.exists && profile.companyId === companyId && ['ADMIN', 'SUB_ADMIN', 'MEMBER'].includes(profile.role) &&
      (!profile.status || profile.status === 'ACTIVE') && !profile.mustChangePassword ? { ...profile, uid } : null;
  }
  async function context(user, reader, letter) {
    const divisionId = identifier(letter ? letter.divisionId : user.divisionId);
    const division = (await read(reader, db.collection('divisions').doc(divisionId))).data();
    if (!division || division.companyId !== user.companyId || typeof division.name !== 'string' || !division.name.trim() || division.name.length > 120) {
      fail('failed-precondition', '기안자의 소속 본부 정보를 확인해 주세요.');
    }
    const teamId = (letter ? letter.teamId : user.teamId) || '';
    const team = teamId ? (await read(reader, db.collection('teams').doc(identifier(teamId)))).data() : null;
    if (teamId && (!team || team.companyId !== user.companyId || team.divisionId !== divisionId)) fail('failed-precondition', '기안자의 팀·본부 소속이 일치하지 않습니다.');
    const prefix = division.name.trim().replace(/\s*본부\s*$/, '').trim() || division.name.trim();
    return { division: { ...division, id: divisionId, prefix }, team: team ? { ...team, id: teamId } : null };
  }
  const candidate = (profile, kind, division) => profile ? { uid: profile.uid, name: profile.name || profile.uid,
    kind, roleLabel: { TEAM_LEADER: '팀장', DIVISION_HEAD: '본부장', COOPERATION: '협조본부장', REPRESENTATIVE: '대표이사' }[kind],
    divisionId: division?.id || '', divisionName: division?.name || '' } : null;
  async function bootstrap(user, letter) {
    const org = await context(user, db, letter);
    const divisions = await db.collection('divisions').where('companyId', '==', user.companyId).get();
    const cooperationHeads = [];
    for (const entry of divisions.docs) {
      if (entry.id === org.division.id) continue;
      const head = await person(entry.data().headId, user.companyId, db);
      if (head) cooperationHeads.push(candidate(head, 'COOPERATION', { id: entry.id, name: entry.data().name || '' }));
    }
    const owner = await person(user.company.adminUid, user.companyId, db);
    const candidates = {
      teamLeader: candidate(await person(org.team?.leaderId, user.companyId, db), 'TEAM_LEADER', org.division),
      divisionHead: candidate(await person(org.division.headId, user.companyId, db), 'DIVISION_HEAD', org.division),
      cooperationHeads: cooperationHeads.sort((a, b) => a.divisionName.localeCompare(b.divisionName, 'ko')),
      representative: candidate(owner?.role === 'ADMIN' ? owner : null, 'REPRESENTATIVE', null),
    };
    return { companyName: user.companyName, draftDate: letter?.drafting?.draftDate || today(),
      division: { id: org.division.id, name: org.division.name, prefix: org.division.prefix },
      team: org.team ? { id: org.team.id, name: org.team.name } : null, candidates,
      defaults: { teamLeader: Boolean(candidates.teamLeader), divisionHead: Boolean(candidates.divisionHead),
        cooperationDivisionIds: [], representative: !candidates.divisionHead && Boolean(candidates.representative) } };
  }
  async function resolve(user, input, reader, letter) {
    const route = routeInput(input);
    const org = await context(user, reader, letter);
    const line = [];
    const add = async (uid, kind, division) => {
      const profile = await person(uid, user.companyId, reader);
      if (!profile || (kind === 'REPRESENTATIVE' && (uid !== user.company.adminUid || profile.role !== 'ADMIN'))) {
        fail('failed-precondition', '선택한 조직 책임자가 없거나 퇴사·정지·초기 비밀번호 변경 대기 상태입니다. 조직도를 확인해 주세요.');
      }
      const step = candidate(profile, kind, division);
      const prior = line.findIndex(entry => entry.uid === uid);
      if (prior !== -1) step.roleLabel = `${line.splice(prior, 1)[0].roleLabel}·${step.roleLabel}`;
      line.push({ ...step, approvedAt: null });
    };
    if (route.teamLeader) {
      if (!org.team) fail('failed-precondition', '팀이 배정되어야 팀장을 선택할 수 있습니다.');
      await add(org.team.leaderId, 'TEAM_LEADER', org.division);
    }
    const cooperations = [];
    for (const divisionId of route.cooperationDivisionIds) {
      if (divisionId === org.division.id) fail('invalid-argument', '협조결재는 다른 본부를 선택해 주세요.');
      const division = (await read(reader, db.collection('divisions').doc(divisionId))).data();
      if (!division || division.companyId !== user.companyId) fail('invalid-argument', '소속 회사의 협조 본부만 선택할 수 있습니다.');
      cooperations.push({ ...division, id: divisionId });
    }
    if (route.representative && route.divisionHead) await add(org.division.headId, 'DIVISION_HEAD', org.division);
    for (const division of cooperations) await add(division.headId, 'COOPERATION', division);
    if (route.representative) await add(user.company.adminUid, 'REPRESENTATIVE', null);
    else await add(org.division.headId, 'DIVISION_HEAD', org.division);
    return { route, org, line, reference: cooperations.map(division => {
      const step = line.find(entry => entry.uid === division.headId);
      return `${division.name} ${step.name} 본부장`;
    }).join(', ') };
  }
  async function validateLine(user, letter, reader) {
    const resolved = await resolve(user, letter.drafting.route, reader, letter);
    if (resolved.line.map(step => step.uid).join('|') !== letter.approvalLine.map(step => step.uid).join('|')) {
      fail('failed-precondition', '조직도 결재 담당자가 변경되었습니다. 기안을 수정하고 다시 결재 요청해 주세요.');
    }
    return resolved;
  }
  function requestRef(user, requestId) {
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)) {
      fail('invalid-argument', '기안 생성 요청 식별자를 확인해 주세요.');
    }
    return db.collection('draftingRequests').doc(key([user.companyId, user.uid, requestId.toLowerCase()]));
  }
  function counterRef(user, divisionId, yearMonth) {
    return db.collection('draftingCounters').doc(key([user.companyId, divisionId, yearMonth]));
  }
  return { bootstrap, resolve, validateLine, requestRef, counterRef, today, hash: key };
}

module.exports = { createDraftingWorkflow };
