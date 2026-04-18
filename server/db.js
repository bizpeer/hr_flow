"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.initDB = void 0;
const firebaseAdmin_1 = require("./firebaseAdmin");
/**
 * Google Cloud Firestore 및 Auth 초기화
 * 초기 관리자(bizpeer) 정보를 생성합니다.
 */
const initDB = async () => {
    try {
        // 1. 도메인 정보 가져오기 (비즈니스 로직에 맞게 기본값 설정)
        let domain = 'internal.com';
        const configSnap = await firebaseAdmin_1.adminDb.collection('config').doc('system').get();
        if (configSnap.exists && configSnap.data()?.defaultDomain) {
            domain = configSnap.data()?.defaultDomain;
        }
        const adminEmail = `bizpeer@${domain}`;
        const adminPassword = '1234';
        const adminUid = 'bizpeer';
        // 2. Firebase Auth 유저 확인 및 생성
        try {
            // 기존에는 이메일로 찾았으나, UID(bizpeer)로 찾는 것이 더 정확하고 도메인 변경에 강인함
            await firebaseAdmin_1.adminAuth.getUser(adminUid);
            console.log('Firebase Auth: master admin already exists (UID: bizpeer).');
        }
        catch (error) {
            if (error.code === 'auth/user-not-found') {
                // 만약 UID가 없는데 이메일로 이미 존재하는 경우를 대비
                try {
                    await firebaseAdmin_1.adminAuth.getUserByEmail(adminEmail);
                    console.log(`Firebase Auth: admin already exists with email ${adminEmail}`);
                }
                catch (emailErr) {
                    if (emailErr.code === 'auth/user-not-found') {
                        await firebaseAdmin_1.adminAuth.createUser({
                            uid: adminUid,
                            email: adminEmail,
                            password: adminPassword,
                            displayName: '최고 관리자',
                        });
                        console.log(`Firebase Auth: master admin (${adminEmail}) created.`);
                    }
                }
            }
            else {
                throw error;
            }
        }
        // 3. Firestore 문서 확인 및 생성
        const adminRef = firebaseAdmin_1.adminDb.collection('UserProfile').doc(adminUid);
        const docSnap = await adminRef.get();
        if (!docSnap.exists) {
            await adminRef.set({
                uid: adminUid,
                email: adminEmail,
                name: '최고 관리자',
                role: 'ADMIN',
                teamHistory: [],
                createdAt: new Date().toISOString()
            });
            console.log('Firebase Firestore: master profile seeded in UserProfile.');
        }
    }
    catch (error) {
        console.error('Migration Seeding Error:', error);
    }
};
exports.initDB = initDB;
// 기존 PostgreSQL pool 대신 Firestore adminDb 인스턴스를 직접 사용하도록 내보냅니다.
exports.db = firebaseAdmin_1.adminDb;
//# sourceMappingURL=db.js.map