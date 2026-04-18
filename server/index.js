const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Firebase Admin 초기화
// 프로젝트 루트 또는 server 폴더에 serviceAccount.json 파일이 있어야 합니다.
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
  console.warn('서비스 계정 파일(serviceAccount.json)을 확인해 주세요.');
}

const adminAuth = admin.auth();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 비밀번호 초기화 API
app.post('/api/reset-password', async (req, res) => {
  const { uid, password } = req.body;
  if (!uid || !password) {
    return res.status(400).json({ error: 'UID와 비밀번호가 누락되었습니다.' });
  }

  try {
    // 실제 Firebase Auth의 비밀번호를 업데이트합니다.
    await adminAuth.updateUser(uid, { password: password });
    console.log(`[Success] Password reset for user: ${uid} to ${password}`);
    res.json({ success: true, message: '비밀번호가 성공적으로 초기화되었습니다.' });
  } catch (error) {
    console.error(`[Error] Failed to reset password for ${uid}:`, error);
    res.status(500).json({ error: error.message || '인증 서버 오류' });
  }
});

app.listen(port, () => {
  console.log('==================================================');
  console.log(`🚀 HR Management Admin Server is Active!`);
  console.log(`📡 URL: http://localhost:${port}`);
  console.log('==================================================');
});