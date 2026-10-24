const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMemberService, INITIAL_MEMBER_PASSWORD } = require('../member-service');

function fixture(options = {}) {
  const records = new Map([
    ['UserProfile/admin', { role: 'ADMIN', companyId: 'a', status: 'ACTIVE' }],
    ['UserProfile/member', { role: 'MEMBER', companyId: 'a', status: 'ACTIVE' }],
    ['UserProfile/manager', { role: 'SUB_ADMIN', companyId: 'a', status: 'ACTIVE' }],
    ['UserProfile/platform', { role: 'SUPER_ADMIN', companyId: 'PLATFORM', status: 'ACTIVE' }],
    ['companies/a', { status: 'ACTIVE' }], ['companies/b', { status: 'ACTIVE' }],
    ['teams/own-team', { companyId: 'a', divisionId: 'division-a' }],
    ['teams/other-team', { companyId: 'b', divisionId: 'division-b' }],
  ]);
  const created = [];
  const deleted = [];
  const snapshot = path => ({ exists: records.has(path), data: () => records.has(path) ? structuredClone(records.get(path)) : undefined });
  const db = {
    collection: collection => ({ doc: id => ({ path: `${collection}/${id}`, get: async () => snapshot(`${collection}/${id}`) }) }),
    runTransaction: async callback => {
      const writes = [];
      const result = await callback({
        get: async ref => snapshot(ref.path),
        create: (ref, data) => {
          if (options.writeFailure) throw new Error('profile write unavailable');
          assert.equal(records.has(ref.path), false);
          writes.push([ref.path, data]);
        },
      });
      for (const [path, data] of writes) records.set(path, structuredClone(data));
      return result;
    },
  };
  const auth = {
    createUser: async values => {
      if (options.authError) throw Object.assign(new Error('auth unavailable'), { code: options.authError });
      created.push(values);
      options.afterAuthCreate?.(records);
      return { uid: 'new-member' };
    },
    deleteUser: async uid => { deleted.push(uid); },
  };
  const manage = createMemberService({ db, auth, now: () => new Date('2026-10-23T15:10:00.000Z') });
  const call = (uid = 'admin', data = {}) => manage({ ...(uid ? { auth: { uid, token: { role: 'SUPER_ADMIN' } } } : {}),
    data: { name: ' 직원 이름 ', email: ' Employee@Example.COM ', teamId: 'own-team', joinDate: '2026-10-01', ...data } });
  return { records, created, deleted, call };
}

test('new employee credentials use the server-owned temporary value and require first-login change', async () => {
  const { call, records, created } = fixture();
  const result = await call('admin', { password: 'caller-input-is-ignored', mustChangePassword: false, role: 'ADMIN', companyId: 'b' });
  assert.equal(result.success, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].password, INITIAL_MEMBER_PASSWORD);
  assert.equal(INITIAL_MEMBER_PASSWORD, '!123456');
  assert.equal(created[0].email, 'employee@example.com');
  assert.equal(created[0].displayName, '직원 이름');
  const profile = records.get('UserProfile/new-member');
  assert.equal(profile.uid, result.uid);
  assert.equal(profile.mustChangePassword, true);
  assert.equal(profile.role, 'MEMBER');
  assert.equal(profile.companyId, 'a');
  assert.equal(profile.divisionId, 'division-a');
  assert.equal(profile.status, 'ACTIVE');
  assert.equal('password' in profile, false);
  assert.equal('password' in result, false);
});

test('omitted temporary password is accepted and default join date uses Seoul day', async () => {
  const { call, records, created } = fixture();
  await call('admin', { joinDate: undefined, teamId: '' });
  assert.equal(created[0].password, INITIAL_MEMBER_PASSWORD);
  assert.equal(records.get('UserProfile/new-member').joinDate, '2026-10-24');
  assert.equal(records.get('UserProfile/new-member').divisionId, '');
});

test('employee creation uses current server permissions, not browser role claims', async () => {
  for (const [uid, code] of [[null, 'unauthenticated'], ['missing', 'permission-denied'], ['member', 'permission-denied'], ['manager', 'permission-denied']]) {
    const { call, created } = fixture();
    await assert.rejects(call(uid), error => error.code === code);
    assert.equal(created.length, 0);
  }
  const { call, records, created } = fixture();
  records.get('UserProfile/admin').status = 'RESIGNED';
  await assert.rejects(call(), error => error.code === 'permission-denied');
  assert.equal(created.length, 0);
});

test('inactive companies and foreign or missing teams fail before Auth creation', async () => {
  for (const teamId of ['other-team', 'missing-team', 'invalid/path']) {
    const { call, created } = fixture();
    await assert.rejects(call('admin', { teamId }), error => error.code === 'invalid-argument');
    assert.equal(created.length, 0);
  }
  const { call, records, created } = fixture();
  records.get('companies/a').status = 'SUSPENDED';
  await assert.rejects(call(), error => error.code === 'permission-denied');
  assert.equal(created.length, 0);
});

test('invalid registration fields are rejected without creating credentials', async () => {
  for (const values of [{ name: '' }, { name: 'a'.repeat(101) }, { email: 'bad@' }, { teamId: 3 }, { joinDate: '2026-02-30' }, { joinDate: {} }]) {
    const { call, created } = fixture();
    await assert.rejects(call('admin', values), error => error.code === 'invalid-argument');
    assert.equal(created.length, 0);
  }
});

test('profile failure rolls back the new Auth account', async () => {
  const { call, records, deleted } = fixture({ writeFailure: true });
  await assert.rejects(call(), error => error.code === 'internal');
  assert.deepEqual(deleted, ['new-member']);
  assert.equal(records.has('UserProfile/new-member'), false);
});

test('permission, company or team changes during Auth creation roll the new account back', async () => {
  for (const afterAuthCreate of [
    records => { records.get('UserProfile/admin').role = 'MEMBER'; },
    records => { records.get('UserProfile/admin').companyId = 'b'; },
    records => { records.get('teams/own-team').companyId = 'b'; },
  ]) {
    const { call, records, deleted } = fixture({ afterAuthCreate });
    await assert.rejects(call(), error => ['permission-denied', 'aborted', 'invalid-argument'].includes(error.code));
    assert.deepEqual(deleted, ['new-member']);
    assert.equal(records.has('UserProfile/new-member'), false);
  }
});

test('duplicate Auth email is reported without leaking credentials or creating a profile', async () => {
  const { call, records, deleted } = fixture({ authError: 'auth/email-already-exists' });
  await assert.rejects(call(), error => error.code === 'already-exists' && !error.message.includes(INITIAL_MEMBER_PASSWORD));
  assert.equal(records.has('UserProfile/new-member'), false);
  assert.deepEqual(deleted, []);
});

test('existing platform-admin employee creation remains separate from tenant companies', async () => {
  const { call, records } = fixture();
  await call('platform', { teamId: '' });
  assert.equal(records.get('UserProfile/new-member').companyId, 'PLATFORM');
  assert.equal(records.get('UserProfile/new-member').role, 'MEMBER');
  assert.equal(records.get('UserProfile/new-member').mustChangePassword, true);
});
