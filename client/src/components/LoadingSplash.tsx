import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';

export const LoadingSplash: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[999] bg-white flex flex-col items-center justify-center">
      {/* 배경 그라데이션 효과 */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 opacity-70" />
      
      <div className="relative flex flex-col items-center gap-8 animate-in fade-in duration-700">
        {/* 로고 영역 */}
        <div className="relative">
          <div className="w-24 h-24 bg-indigo-600 rounded-3xl shadow-2xl shadow-indigo-200 flex items-center justify-center animate-bounce duration-[2000ms] ease-in-out">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          {/* 장식용 링 */}
          <div className="absolute -inset-4 border-2 border-indigo-100 rounded-[2.5rem] animate-pulse" />
        </div>

        {/* 텍스트 영역 */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">
            HR <span className="text-indigo-600">Flow</span>
          </h1>
          <p className="text-gray-400 font-medium tracking-wide uppercase text-xs">
            Revolutionizing Workplace Dynamic
          </p>
        </div>

        {/* 로딩 바/스피너 */}
        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100 shadow-sm transition-all animate-pulse">
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
            <span className="text-sm font-bold text-gray-600">애플리케이션을 불러오는 중...</span>
          </div>
          <p className="text-[10px] text-gray-300 font-medium">인증 정보를 확인하고 있습니다</p>
        </div>
      </div>

      {/* 하단 카피라이트 */}
      <div className="absolute bottom-10 text-gray-300 text-[10px] font-medium tracking-widest uppercase">
        © 2026 HR Flow System
      </div>
    </div>
  );
};
