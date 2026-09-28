import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-hr-flow',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  storage: { host: '127.0.0.1', port: 9199, rules: readFileSync('storage.rules', 'utf8') }
});

const alice = testEnv.authenticatedContext('alice', { email: 'alice@example.com' });
const bob = testEnv.authenticatedContext('bob', { email: 'bob@example.com' });
const manager = testEnv.authenticatedContext('manager', { email: 'manager@example.com' });
const outsider = testEnv.authenticatedContext('outsider', { email: 'outsider@other.com' });
const orphan = testEnv.authenticatedContext('orphan', { email: 'orphan@c.com' });
const root = testEnv.authenticatedContext('root', { email: 'root@platform.com' });
const db = context => context.firestore();
const profile = (context, uid) => doc(db(context), 'UserProfile', uid);
const company = (context, id) => doc(db(context), 'companies', id);

try {
  await assertSucceeds(setDoc(company(alice, 'a'), {
    nameKo: 'A', nameEn: 'A', domain: 'example.com', adminUid: 'alice',
    createdAt: '2026-09-28', status: 'ACTIVE', plan: 'FREE'
  }));
  await assertFails(setDoc(profile(outsider, 'outsider'), {
    uid: 'outsider', email: 'outsider@other.com', role: 'SUPER_ADMIN', companyId: 'PLATFORM'
  }));
  await assertSucceeds(setDoc(profile(alice, 'alice'), {
    uid: 'alice', email: 'alice@example.com', role: 'ADMIN', companyId: 'a', status: 'ACTIVE'
  }));

  await testEnv.withSecurityRulesDisabled(async context => {
    const seed = context.firestore();
    await setDoc(doc(seed, 'companies', 'b'), {
      adminUid: 'outsider', nameKo: 'B', nameEn: 'B', domain: 'other.com',
      createdAt: '2026-09-28', status: 'ACTIVE', plan: 'FREE'
    });
    await setDoc(doc(seed, 'companies', 'c'), {
      adminUid: 'orphan', nameKo: 'C', nameEn: 'C', domain: 'c.com',
      createdAt: '2026-09-28', status: 'ACTIVE', plan: 'FREE'
    });
    await setDoc(doc(seed, 'UserProfile', 'bob'), {
      uid: 'bob', email: 'bob@example.com', role: 'MEMBER', companyId: 'a',
      divisionId: 'div1', status: 'ACTIVE'
    });
    await setDoc(doc(seed, 'UserProfile', 'carol'), {
      uid: 'carol', email: 'carol@example.com', role: 'MEMBER', companyId: 'a',
      divisionId: 'div2', status: 'ACTIVE'
    });
    await setDoc(doc(seed, 'UserProfile', 'manager'), {
      uid: 'manager', email: 'manager@example.com', role: 'SUB_ADMIN', companyId: 'a',
      divisionId: 'div1', status: 'ACTIVE'
    });
    await setDoc(doc(seed, 'UserProfile', 'outsider'), {
      uid: 'outsider', email: 'outsider@other.com', role: 'ADMIN', companyId: 'b', status: 'ACTIVE'
    });
    await setDoc(doc(seed, 'UserProfile', 'root'), {
      uid: 'root', email: 'root@platform.com', role: 'SUPER_ADMIN', companyId: 'PLATFORM'
    });
    await setDoc(doc(seed, 'expenses', 'expense-a'), {
      userId: 'bob', companyId: 'a', divisionId: 'div1', status: 'PENDING', amount: 100
    });
    await setDoc(doc(seed, 'expenses', 'expense-other-division'), {
      userId: 'carol', companyId: 'a', divisionId: 'div2', status: 'PENDING', amount: 100
    });
    await setDoc(doc(seed, 'payroll_records', 'payroll-a'), { companyId: 'a', totalGross: 100 });
  });

  await assertFails(updateDoc(profile(bob, 'bob'), { role: 'SUPER_ADMIN' }));
  await assertSucceeds(updateDoc(company(orphan, 'c'), { nameKo: 'Recovered C' }));
  await assertSucceeds(setDoc(profile(orphan, 'orphan'), {
    uid: 'orphan', email: 'orphan@c.com', role: 'ADMIN', companyId: 'c', status: 'ACTIVE'
  }));
  await assertSucceeds(updateDoc(profile(bob, 'bob'), { name: 'Bob' }));
  await assertFails(updateDoc(profile(bob, 'bob'), { annualSalary: 999999999 }));
  await assertFails(updateDoc(profile(alice, 'outsider'), { role: 'MEMBER' }));
  await assertFails(updateDoc(company(alice, 'a'), { subscriptionStatus: 'ACTIVE' }));
  await assertSucceeds(updateDoc(company(root, 'a'), { subscriptionStatus: 'ACTIVE' }));
  await assertFails(getDoc(company(alice, 'b')));
  await assertFails(getDoc(profile(bob, 'alice')));
  await assertSucceeds(getDoc(profile(manager, 'bob')));
  await assertFails(getDoc(profile(manager, 'carol')));
  await assertFails(getDoc(doc(db(manager), 'expenses', 'expense-other-division')));
  const divisionQuery = query(collection(db(manager), 'expenses'),
    where('companyId', '==', 'a'), where('divisionId', '==', 'div1'));
  assert.equal((await assertSucceeds(getDocs(divisionQuery))).size, 1);
  await assertFails(getDoc(doc(db(bob), 'payroll_records', 'payroll-a')));
  await assertSucceeds(getDoc(doc(db(alice), 'payroll_records', 'payroll-a')));

  await assertFails(setDoc(doc(db(bob), 'expenses', 'spoof'), {
    companyId: 'a', userId: 'alice', status: 'PENDING'
  }));
  await assertFails(updateDoc(doc(db(bob), 'expenses', 'expense-a'), { status: 'APPROVED' }));
  await assertSucceeds(updateDoc(doc(db(manager), 'expenses', 'expense-a'), {
    status: 'SUB_APPROVED', updatedAt: '2026-09-28', updatedBy: 'manager'
  }));
  await assertFails(updateDoc(doc(db(outsider), 'expenses', 'expense-a'), {
    status: 'APPROVED', updatedAt: '2026-09-28', updatedBy: 'outsider'
  }));

  await assertSucceeds(setDoc(doc(db(alice), 'payment_claims', 'ORDER123'), {
    companyId: 'a', companyName: 'A', adminUid: 'alice', adminName: 'Alice',
    orderId: 'ORDER123', status: 'PENDING', createdAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db(bob), 'payment_claims', 'claim-b'), {
    companyId: 'a', adminUid: 'bob', orderId: 'ORDER456', status: 'PENDING'
  }));
  await assertFails(updateDoc(doc(db(alice), 'payment_claims', 'ORDER123'), { status: 'VERIFIED' }));

  const aliceStorage = alice.storage('test.appspot.com');
  const bobStorage = bob.storage('test.appspot.com');
  const png = new Uint8Array([137, 80, 78, 71]);
  await assertSucceeds(uploadBytes(ref(bobStorage, 'companies/a/expenses/bob/receipt.png'), png,
    { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(bobStorage, 'companies/b/expenses/bob/receipt.png'), png,
    { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(bobStorage, 'companies/a/expenses/bob/script.html'), png,
    { contentType: 'text/html' }));
  await assertFails(uploadBytes(ref(bobStorage, 'companies/a/notices/notice.png'), png,
    { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(aliceStorage, 'companies/a/notices/notice.png'), png,
    { contentType: 'image/png' }));

  assert.equal((await getDoc(profile(alice, 'bob'))).data().role, 'MEMBER');
  console.log('Security rules: authorization and upload checks passed.');
} finally {
  await testEnv.cleanup();
}
