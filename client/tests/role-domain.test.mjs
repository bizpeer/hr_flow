import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoleDisplayName } from '../src/utils/roleDisplay.ts';
import { getEmployeeLoginDomain, getEmployeeLoginEmail } from '../src/utils/employeeLogin.ts';

const company = Object.freeze({ id: 'company-a', adminUid: 'owner' });
const profile = (uid, role, companyId = 'company-a') => Object.freeze({ uid, role, companyId });

test('platform administrators display SYSTEM_ADMIN while their stored authorization code stays SUPER_ADMIN', () => {
  const platform = profile('platform', 'SUPER_ADMIN', 'PLATFORM');
  assert.equal(getRoleDisplayName(platform), 'SYSTEM_ADMIN');
  assert.deepEqual(platform, { uid: 'platform', role: 'SUPER_ADMIN', companyId: 'PLATFORM' });
  assert.equal(getRoleDisplayName(profile('platform', 'SUPER_ADMIN', 'company-a'), company), '권한 확인 필요');
});

test('only the matching company owner displays SUPER_ADMIN; additional administrators remain ADMIN', () => {
  const owner = profile('owner', 'ADMIN');
  assert.equal(getRoleDisplayName(owner, company), 'SUPER_ADMIN');
  assert.equal(owner.role, 'ADMIN');
  assert.equal(getRoleDisplayName(profile('additional-admin', 'ADMIN'), company), 'ADMIN');
  assert.equal(getRoleDisplayName(profile('owner', 'ADMIN', 'PLATFORM'), { id: 'PLATFORM', adminUid: 'owner' }), 'ADMIN');
});

test('a foreign company, absent owner metadata or an empty UID cannot confer the owner display', () => {
  const owner = profile('owner', 'ADMIN');
  for (const metadata of [undefined, null, { id: 'company-b', adminUid: 'owner' },
    { id: '', adminUid: 'owner' }, { id: 'company-a', adminUid: '' }]) {
    assert.equal(getRoleDisplayName(owner, metadata), 'ADMIN');
  }
  assert.equal(getRoleDisplayName(profile('', 'ADMIN'), { id: 'company-a', adminUid: '' }), 'ADMIN');
});

test('display labels cannot elevate a member or manager and never mutate profiles or company ownership', () => {
  for (const role of ['MEMBER', 'SUB_ADMIN']) {
    const user = Object.freeze({ ...profile('owner', role), displayRole: 'SUPER_ADMIN', roleName: 'SYSTEM_ADMIN' });
    const before = structuredClone(user);
    assert.equal(getRoleDisplayName(user, company), role);
    assert.deepEqual(user, before);
  }
  assert.deepEqual(company, { id: 'company-a', adminUid: 'owner' });
  const unknown = profile('owner', 'SYSTEM_ADMIN', 'PLATFORM');
  assert.equal(getRoleDisplayName(unknown, company), '권한 확인 필요', 'a presentation label is not a recognized authorization code');
  assert.equal(getRoleDisplayName(profile('owner', 'OWNER'), company), '권한 확인 필요');
  assert.equal(getRoleDisplayName(profile('owner', 'admin'), company), '권한 확인 필요');
});

test('English company names produce lowercase whitespace-free .com employee IDs', () => {
  for (const nameEn of ['Biz Peer', '  BIZ  PEER  ', '\tBiz\nPeer\r\n']) {
    const data = Object.freeze({ nameEn });
    assert.equal(getEmployeeLoginDomain(data), 'bizpeer.com');
    assert.equal(getEmployeeLoginEmail('  Hong  ', data), 'hong@bizpeer.com');
    assert.equal(data.nameEn, nameEn);
  }
  assert.equal(getEmployeeLoginDomain({ nameEn: 'Biz-Peer 26' }), 'biz-peer26.com');
  assert.equal(getEmployeeLoginDomain({ nameEn: 'A' }), 'a.com');
  assert.equal(getEmployeeLoginDomain({ nameEn: 'a'.repeat(63) }), `${'a'.repeat(63)}.com`);
});

test('legacy explicit domain remains a fallback when the company English name is absent', () => {
  for (const nameEn of [undefined, null, '', '   ']) {
    const data = Object.freeze({ nameEn, domain: '  Login.Example.COM  ' });
    assert.equal(getEmployeeLoginDomain(data), 'login.example.com');
    assert.equal(getEmployeeLoginEmail('employee', data), 'employee@login.example.com');
  }
  assert.throws(() => getEmployeeLoginDomain());
  assert.throws(() => getEmployeeLoginDomain(null));
  for (const domain of ['', 'localhost', 'bad_domain.com', '-bad.com', 'bad-.com', 'bad..com', 'example.com/path', 'example.com:443']) {
    assert.throws(() => getEmployeeLoginDomain({ domain }));
  }
});

test('full email input preserves its explicit domain independently of invalid or missing English company names', () => {
  const emails = ['Hong@Other.Example.COM', 'First.Last+Payroll@Example.ORG'];
  for (const input of emails) {
    for (const data of [undefined, null, { nameEn: '한글회사' }, { nameEn: 'bad/name', domain: 'bad domain' }]) {
      assert.equal(getEmployeeLoginEmail(`  ${input}  `, data), input.toLowerCase());
    }
  }
});

test('invalid English names fail instead of silently producing malformed or alternate employee domains', () => {
  for (const nameEn of ['한글회사', 'Biz&Peer', 'Biz_Peer', 'Biz.Peer', '-bizpeer', 'bizpeer-', 'biz/peer',
    'bizpeer.com', 'a'.repeat(64), 'name@example.com']) {
    assert.throws(() => getEmployeeLoginDomain({ nameEn, domain: 'fallback.example.com' }));
    assert.throws(() => getEmployeeLoginEmail('employee', { nameEn, domain: 'fallback.example.com' }));
  }
});

test('employee ID validation rejects empty, ambiguous, oversized or unsafe login addresses', () => {
  for (const input of ['', ' ', '.employee', 'employee.', 'two..dots', 'white space', '한글아이디',
    'a'.repeat(65), '@example.com', 'employee@', 'two@@example.com', 'employee@localhost',
    'employee@-example.com', 'employee@example.com/path', 'employee@example.com\nother@example.com']) {
    assert.throws(() => getEmployeeLoginEmail(input, { nameEn: 'Biz Peer' }));
  }
  const longDomain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  assert.throws(() => getEmployeeLoginEmail(`employee@${longDomain}`));
  assert.equal(getEmployeeLoginEmail('a'.repeat(64), { nameEn: 'Biz Peer' }), `${'a'.repeat(64)}@bizpeer.com`);
});
