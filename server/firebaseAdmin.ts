import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ESM 환경에서 __dirname 대체물 생성
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 서비스 계정 키 파일 경로 (상대 경로 또는 환경 변수)
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccount.json');

try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  console.warn('Proceeding without Firebase Admin authentication. Please check your serviceAccount.json file.');
}

// 데이터베이스 ID(weberp)를 상수로 정의하여 (default) 사용을 원천 차단합니다.
const DATABASE_ID = 'weberp';

// 데이터베이스 ID를 명시하여 기본(default) 데이터베이스가 아닌 특정 데이터베이스를 사용합니다.
export const adminDb = getFirestore(DATABASE_ID);
export const adminAuth: Auth = getAuth();
export default admin;
