import React from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutDashboard, ShieldCheck, Zap } from 'lucide-react';

export const Landing: React.FC = () => {
  const { user, setLoginModalOpen } = useAuthStore();
  const navigate = useNavigate();

  const handleStart = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      setLoginModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
      {/* 내비게이션 바 */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between font-medium">
          <div className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 bg-clip-text text-transparent">
            HR Flow
          </div>
          <div className="flex gap-4">
            <button 
              onClick={handleStart}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 active:scale-95"
            >
              대시보드 시작하기
            </button>
          </div>
        </div>
      </nav>

      {/* 히어로 섹션 */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            조직의 성장을 가속화하는<br/>
            <span className="text-indigo-600">지능형 HR 솔루션</span>
          </h1>
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            출퇴근 관리부터 지출 결정까지, 복잡한 인사 관리를 하나의 플랫폼에서<br/>
            가장 직관적이고 효율적인 방법으로 해결하세요.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={handleStart}
              className="group flex items-center gap-3 px-10 py-5 bg-indigo-600 text-white rounded-2xl text-lg font-bold hover:bg-indigo-700 transition shadow-xl shadow-indigo-200 active:scale-[0.98]"
            >
              지금 시작하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* 특장점 섹션 */}
      <section className="py-24 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow group">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Zap className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold mb-4">실시간 근태 관리</h3>
            <p className="text-gray-500 leading-relaxed">디지털 출퇴근 기록과 휴가 신청 현황을 한눈에 파악하고 효율적인 인력 운영을 지원합니다.</p>
          </div>
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow group">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold mb-4">스마트 결재 시스템</h3>
            <p className="text-gray-500 leading-relaxed">지출결의부터 승인까지 2단계 워크플로우를 통해 불필요한 행정 소요를 줄이고 투명성을 높입니다.</p>
          </div>
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow group">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold mb-4">보안 중심 설계</h3>
            <p className="text-gray-500 leading-relaxed">강력한 권한 분리(ADMIN, SUB_ADMIN, MEMBER)를 통해 민감한 인사 데이터를 안전하게 보호합니다.</p>
          </div>
        </div>
      </section>

      {/* 하단 섹션 */}
      <footer className="py-20 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="text-2xl font-bold text-gray-400 mb-8 lowercase">HR Flow.</div>
          <p className="text-gray-400 text-sm">© 2026 HR Flow Management System. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
