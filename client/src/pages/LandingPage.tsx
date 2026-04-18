import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, CheckCircle2, Clock, FileText, Users, 
  ShieldCheck, Smartphone, Zap, ChevronRight,
  Globe, LayoutDashboard, Database
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Clock className="w-6 h-6" />,
      title: "실시간 근태 관리",
      description: "위치 기반 체크인/아웃으로 정확하고 투명한 근태 기록을 보장합니다."
    },
    {
      icon: <CheckCircle2 className="w-6 h-6" />,
      title: "스마트 유가/휴가 신청",
      description: "잔여 연차 자동 계산부터 복잡한 승인 절차까지 한 번에 해결하세요."
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "투명한 지출결의",
      description: "영수증 첨부와 전자결재로 비용 처리를 빠르고 체계적으로 관리합니다."
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "조직 및 인사 인사이트",
      description: "직원 정보 및 조직도를 한눈에 파악하고 효율적인 인력 배치를 지원합니다."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg shadow-indigo-600/20">HF</div>
              <span className="text-2xl font-black tracking-tighter text-slate-900">HR <span className="text-indigo-600">FLOW</span></span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/login')}
                className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors"
              >
                로그인
              </button>
              <button 
                onClick={() => navigate('/login')}
                className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 active:scale-95"
              >
                무료로 시작하기
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Decor */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-indigo-50/50 to-transparent rounded-full blur-3xl -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <Zap className="w-4 h-4 fill-current" />
            <span className="text-xs font-black uppercase tracking-widest">SaaS Cloud HR Platform</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
            기업의 성장을 가속화하는<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">스마트 HR 솔루션</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-lg text-slate-500 font-medium leading-relaxed mb-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            근태 관리, 휴가 신청, 지출결의까지. 인사 업무의 모든 과정을<br className="hidden md:block" />
            하나의 플랫폼에서 가장 효율적으로 경험하세요.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-300">
            <button 
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-8 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-2 group"
            >
              지금 무료로 체험하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <div className="flex items-center gap-2 px-6 py-4">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-bold text-slate-400">신용카드 정보 불필요</span>
            </div>
          </div>

          {/* Abstract Dashboard Preview */}
          <div className="mt-20 relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-indigo-600/5 rounded-[40px] blur-3xl -z-10" />
            <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 p-4 relative overflow-hidden group">
              <div className="bg-slate-50 rounded-[20px] aspect-[16/9] flex items-center justify-center overflow-hidden">
                <div className="grid grid-cols-12 gap-4 w-full h-full p-8">
                  <div className="col-span-3 space-y-4">
                    <div className="h-10 bg-white rounded-xl shadow-sm border border-slate-200" />
                    <div className="h-64 bg-white rounded-xl shadow-sm border border-slate-200" />
                  </div>
                  <div className="col-span-9 space-y-4">
                    <div className="h-10 bg-white rounded-xl shadow-sm border border-slate-200" />
                    <div className="grid grid-cols-3 gap-4">
                      <div className="h-32 bg-indigo-50 rounded-xl border border-indigo-100" />
                      <div className="h-32 bg-emerald-50 rounded-xl border border-emerald-100" />
                      <div className="h-32 bg-rose-50 rounded-xl border border-rose-100" />
                    </div>
                    <div className="h-[250px] bg-white rounded-xl shadow-sm border border-slate-200" />
                  </div>
                </div>
              </div>
              {/* Play Overlay */}
              <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                  <ChevronRight className="w-8 h-8 text-indigo-600 fill-current" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter mb-4">하나의 플랫폼, 완벽한 HR 경험</h2>
            <p className="text-slate-500 font-medium">분산된 업무 툴은 이제 그만. HR Flow가 업무의 기준이 됩니다.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, idx) => (
              <div key={idx} className="p-8 rounded-[32px] bg-slate-50 border border-transparent hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm mb-6 group-hover:scale-110 transition-transform duration-500">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-3 tracking-tight">{feature.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SaaS Benefits */}
      <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] -mr-32 -mt-32" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-[1.1] mb-8">
                신뢰할 수 있는<br />
                <span className="text-indigo-400">클라우드 SaaS 아키텍처</span>
              </h2>
              <div className="space-y-6">
                {[
                  { icon: <Database />, title: "완벽한 테넌트 격리", desc: "각 기업의 데이터가 물리적으로 분리되어 안전하게 보호됩니다." },
                  { icon: <Smartphone />, title: "모바일 최적화", desc: "언제 어디서나 웹과 모바일로 간편하게 업무를 처리할 수 있습니다." },
                  { icon: <Globe />, title: "글로벌 도메인 관리", desc: "회사 고유의 도메인 연동으로 전문성을 높여줍니다." },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-indigo-400">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-lg font-black mb-1">{item.title}</h4>
                      <p className="text-slate-400 text-sm font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-indigo-600 rounded-[40px] p-8 md:p-12 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.2),transparent)]" />
                <LayoutDashboard className="w-16 h-16 text-white/20 absolute -right-4 -bottom-4" />
                
                <h3 className="text-3xl font-black mb-4 relative">지금 가입하고<br />30일간 무료로 체험하세요</h3>
                <p className="text-indigo-100 font-medium mb-8 relative">인원 제한 없이 플랫폼의 모든 기능을 경험해 볼 수 있습니다.</p>
                <button 
                  onClick={() => navigate('/login')}
                  className="w-full py-4 bg-white text-indigo-600 font-black rounded-2xl hover:bg-slate-50 transition-all shadow-xl relative active:scale-95"
                >
                  무료 시작하기
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center font-black text-white italic">HF</div>
              <span className="text-lg font-black tracking-tighter text-slate-900">HR FLOW</span>
            </div>
            <p className="text-slate-400 text-sm font-medium">© 2026 HR FLOW. All rights reserved.</p>
            <div className="flex gap-6">
              <span className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">개용약관</span>
              <span className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">개인정보처리방침</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
