const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccount.json');
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

const db = getFirestore(app, 'weberp');
const defaultDb = getFirestore(app);

async function migrate() {
  try {
    console.log('--- Migration Started ---');
    
    // 1. 초기 회사 생성 (Aeterno)
    const companyId = 'aeterno_corp';
    await db.collection('companies').doc(companyId).set({
      nameKo: '에테르노 (Aeterno Corp)',
      nameEn: 'Aeterno Corp',
      domain: 'aeterno.co.kr',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    });
    console.log('Default company "aeterno_corp" created.');

    // 2. jwmaxum@gmail.com (SUPER_ADMIN) 정보 보강
    // 이전 스크립트에서 생성된 UID를 활용하거나 이메일로 검색
    const superAdminEmail = 'jwmaxum@gmail.com';
    const superAdminAuth = await admin.auth().getUserByEmail(superAdminEmail);
    await db.collection('UserProfile').doc(superAdminAuth.uid).set({
      email: superAdminEmail,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      companyId: 'PLATFORM', // App 규격 준수
      status: 'ACTIVE',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`SUPER_ADMIN (${superAdminEmail}) profile updated in weberp.`);

    // 3. 기존 ADMIN 계정 (bizpeer@aeterno.co.kr) 마이그레이션
    const adminEmail = 'bizpeer@aeterno.co.kr';
    try {
      const adminAuth = await admin.auth().getUserByEmail(adminEmail);
      await db.collection('UserProfile').doc(adminAuth.uid).set({
        email: adminEmail,
        name: '비즈피어 관리자',
        role: 'ADMIN',
        companyId: companyId,
        status: 'ACTIVE',
        joinDate: '2024-01-01',
        updatedAt: new Date().toISOString()
      });
      console.log(`ADMIN (${adminEmail}) migrated to weberp.`);
    } catch (e) {
      console.warn(`User ${adminEmail} not found in Auth, skipping.`);
    }

    console.log('--- Migration Completed ---');
    process.exit(0);
  } catch (err) {
    console.error('Migration Error:', err);
    process.exit(1);
  }
}

migrate();
