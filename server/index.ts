import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { adminAuth } from './firebaseAdmin';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// CORS 설정: 클라이언트 개발 서버(5173)에서의 요청 허용
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 서버 상태 확인용
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// [핵심] 비밀번호 초기화 엔드포인트
// 클라이언트에서 보안상 처리할 수 없는 Firebase Auth 비밀번호 변경을 Admin SDK로 수행합니다.
app.post('/api/reset-password', async (req, res) => {
  const { uid, password } = req.body;

  if (!uid || !password) {
    return res.status(400).json({ error: '사용자 UID와 새 비밀번호가 필요합니다.' });
  }

  try {
    // Firebase Admin SDK를 통해 실제 인증 시스템의 비밀번호를 업데이트합니다.
    await adminAuth.updateUser(uid, { password: password });
    
    console.log(`[Admin API] User ${uid} password reset to: ${password}`);
    
    res.json({ 
      success: true, 
      message: '인증 시스템의 비밀번호가 성공적으로 업데이트되었습니다.' 
    });
  } catch (error: any) {
    console.error(`[Admin API] Reset failed for user ${uid}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message || '비밀번호 업데이트 중 오류가 발생했습니다.' 
    });
  }
});

app.listen(port, () => {
  console.log('--------------------------------------------------');
  console.log(`🚀 HR Management Admin Server is running!`);
  console.log(`📡 URL: http://localhost:${port}`);
  console.log(`🛠️ API: POST /api/reset-password`);
  console.log('--------------------------------------------------');
});
