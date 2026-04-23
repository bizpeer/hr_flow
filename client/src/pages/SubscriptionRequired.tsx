import React from 'react';
import { AlertTriangle, CreditCard, LogOut, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const SubscriptionRequired: React.FC = () => {
  const { userData, companyData, logout } = useAuthStore();

  const isAdmin = userData?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[3rem] p-12 text-center space-y-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16"></div>
        
        <div className="w-20 h-20 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mx-auto">
          <AlertTriangle className="w-10 h-10" />
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">구독 기간 만료</h1>
          <p className="text-slate-500 font-medium leading-relaxed">
            죄송합니다. <span className="text-indigo-600 font-black">{companyData?.nameKo}</span> 조직의 서비스 무료 체험 기간 또는 구독 기간이 만료되었습니다.
          </p>
        </div>

        <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 text-left">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Next Steps</p>
          {isAdmin ? (
            <p className="text-sm font-bold text-slate-600">
              최고 관리자(ADMIN) 권한으로 로그인 중입니다. 아래 버튼을 클릭하여 구독 플랜을 갱신하고 서비스를 계속 이용하세요.
            </p>
          ) : (
            <p className="text-sm font-bold text-slate-600">
              귀하의 조직 관리자에게 연락하여 서비스 구독 갱신을 요청해 주세요. 결제가 완료되면 즉시 서비스 이용이 가능합니다.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {isAdmin ? (
            <a 
              href="#/subscription"
              className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              <CreditCard className="w-5 h-5" />
              결제 및 구독 갱신하기
              <ArrowRight className="w-5 h-5" />
            </a>
          ) : (
             <div className="py-4 text-rose-500 font-black text-sm animate-pulse">
                관리자의 결제가 필요합니다.
             </div>
          )}
          
          <button 
            onClick={() => logout()}
            className="w-full py-4 text-slate-400 font-black text-sm hover:bg-slate-50 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            로그아웃 후 초기화면으로
          </button>
        </div>

        <p className="text-[10px] text-slate-300 font-medium">
          HR FLOW SaaS Platform • © 2026
        </p>
      </div>
    </div>
  );
};
