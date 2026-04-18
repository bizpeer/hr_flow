import { initializeApp } from "firebase/app"; // Firebase 인증 및 설정 전체 복구 완료 (마스터 설정 작동 준비)
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Vite 환경 변수에서 구성을 읽어옵니다.
// 배포 시 GitHub Secrets에 해당 값들이 반드시 등록되어 있어야 합니다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 필수 설정값 누락 여부 확인 (디버깅 용도)
const missingKeys = Object.entries(firebaseConfig)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(`Firebase 설정 오류: 다음 환경 변수가 누락되었습니다: ${missingKeys.join(", ")}`);
  console.warn("GitHub 레포지토리의 Settings > Secrets에 해당 값들을 등록해 주세요.");
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
// 환경 변수에 따라 weberp 또는 특정 테넌트 DB로 연결합니다.
const dbId = import.meta.env.VITE_FIREBASE_DATABASE_ID || "weberp";
export const db = getFirestore(app, dbId);

// Initialize Cloud Storage and get a reference to the service
export const storage = getStorage(app);

// Initialize Cloud Functions
export const functions = getFunctions(app);
