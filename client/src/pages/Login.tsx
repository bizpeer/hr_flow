import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { systemDomain } = useAuthStore();

  const from = location.state?.from?.pathname || '/dashboard';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // bizpeer 아이디를 내부 이메일 형식으로 변환
    let loginEmail = email;
    if (email === 'bizpeer') {
      loginEmail = `bizpeer@${systemDomain}`;
    }

    try {
      await signInWithEmailAndPassword(auth, loginEmail, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError('아이디(이메일) 혹은 비밀번호가 틀렸거나 문제가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 마스터 어드민 시딩 (최초 1회용 자동생성)
  const handleSeedMasterAdmin = async () => {
    const adminId = "bizpeer";
    const adminEmail = `bizpeer@${systemDomain}`;
    const adminPassword = "123456";

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
      const uid = userCredential.user.uid;
      
      await setDoc(doc(db, 'UserProfile', uid), {
        uid,
        email: adminEmail,
        name: '최고 관리자',
        role: 'ADMIN',
        mustChangePassword: true,
        teamHistory: []
      });
      alert(`초기 마스터 관리자 계정이 생성되었습니다.\nID: ${adminId}\nPW: ${adminPassword}`);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        alert("이미 관리자 계정이 생성되어 있습니다.");
      } else {
        alert("생성 실패: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 border-b pb-4">
            <span className="text-indigo-600">HR Flow</span> 로그인
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">아이디 또는 이메일</label>
              <input
                type="text"
                required
                className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm mt-1"
                placeholder="bizpeer 또는 email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                required
                className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm mt-1"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </form>
      </div>
      
      {/* 개발 및 초기 운영 지원을 위한 숨겨진 마스터 생성 버튼 (실제 운영시 삭제) */}
      <button 
        onClick={handleSeedMasterAdmin}
        className="absolute bottom-4 right-4 text-xs text-gray-300 hover:text-gray-500 focus:outline-none"
      >
        마스터 설정
      </button>
    </div>
  );
};
