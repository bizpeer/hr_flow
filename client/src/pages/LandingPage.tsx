import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, CheckCircle2, Clock, FileText, Users, 
  ShieldCheck, Smartphone, Zap,
  Globe, LayoutDashboard, Database
} from 'lucide-react';
import { ProductManual, ProductOverview } from '../components/ProductGuide';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = React.useState<'preview' | 'manual'>('preview');

  const handleGuideKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'preview' : event.key === 'End' ? 'manual' :
      event.currentTarget.id === 'guide-tab-preview' ? 'manual' : 'preview';
    setViewMode(next);
    document.getElementById('guide-tab-' + next)?.focus();
  };

  const features = [
    {
      icon: <Clock className="w-6 h-6" />,
      title: "실시간 근태 관리",
      description: "출근·퇴근 기록과 개인·관리자 조회로 근태 현황을 확인합니다."
    },
    {
      icon: <CheckCircle2 className="w-6 h-6" />,
      title: "휴가·연차 관리",
      description: "잔여 연차와 휴가 신청, 권한에 따른 승인·반려를 한곳에서 관리합니다."
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "투명한 지출결의",
      description: "영수증 첨부와 전자결재로 비용 신청 및 승인 내역을 관리합니다."
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "조직 및 인사 인사이트",
      description: "회사·본부·팀 구조와 사용자 권한에 따라 직원 정보를 관리합니다."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div 
              onClick={() => navigate('/')}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <div className="w-8 h-8 shrink-0 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg shadow-indigo-600/20 group-hover:scale-110 transition-transform sm:h-10 sm:w-10">HF</div>
              <span className="whitespace-nowrap text-lg font-black tracking-tighter text-slate-900 group-hover:text-indigo-600 transition-colors sm:text-2xl">HR <span className="text-indigo-600">FLOW</span></span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <button 
                onClick={() => navigate('/login')}
                className="whitespace-nowrap text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors sm:text-sm"
              >
                로그인
              </button>
              <button 
                onClick={() => navigate('/login')}
                className="whitespace-nowrap px-3 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 active:scale-95 sm:px-5 sm:text-sm"
              >
                무료로 시작하기
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-x-clip">
        {/* Background Decor */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-indigo-50/50 to-transparent rounded-full blur-3xl -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <Zap className="w-4 h-4 fill-current" />
            <span className="text-xs font-black uppercase tracking-widest">SaaS Cloud HR Platform</span>
          </div>
          
          <h1 className="break-keep text-4xl sm:text-5xl md:text-7xl font-black text-slate-900 tracking-tighter leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
            기업의 성장을 가속화하는<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">스마트 HR 솔루션</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-lg text-slate-500 font-medium leading-relaxed mb-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            근태·휴가·경비부터 서류 발급까지. 일상적인 인사·행정 업무를<br className="hidden md:block" />{' '}
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

          {/* Toggle Switch */}
          <div className="mt-16 mb-8 flex justify-center">
            <div role="tablist" aria-label="제품 기능 안내" className="bg-white/60 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 inline-flex shadow-sm">
              <button 
                id="guide-tab-preview"
                role="tab"
                aria-selected={viewMode === 'preview'}
                aria-controls="guide-panel-preview"
                tabIndex={viewMode === 'preview' ? 0 : -1}
                onKeyDown={handleGuideKey}
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:gap-2 sm:px-5 sm:text-sm ${
                  viewMode === 'preview' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                기능 한눈에 보기
              </button>
              <button 
                id="guide-tab-manual"
                role="tab"
                aria-selected={viewMode === 'manual'}
                aria-controls="guide-panel-manual"
                tabIndex={viewMode === 'manual' ? 0 : -1}
                onKeyDown={handleGuideKey}
                onClick={() => setViewMode('manual')}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:gap-2 sm:px-5 sm:text-sm ${
                  viewMode === 'manual' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                기능요약 설명서
              </button>
            </div>
          </div>

          {/* Product guidance uses the current service descriptions. */}
          <div className="relative mx-auto max-w-6xl">
            <div className="absolute inset-0 -z-10 rounded-[40px] bg-indigo-600/5 blur-3xl" />
            <div className="relative rounded-[32px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-8">
              <div id="guide-panel-preview" role="tabpanel" aria-labelledby="guide-tab-preview" tabIndex={0} hidden={viewMode !== 'preview'} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <ProductOverview />
              </div>
              <div id="guide-panel-manual" role="tabpanel" aria-labelledby="guide-tab-manual" tabIndex={0} hidden={viewMode !== 'manual'} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <ProductManual />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter mb-4">하나의 플랫폼, 연결된 HR 업무</h2>
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
                  { icon: <Database />, title: "회사별 접근 권한", desc: "회사별 권한과 서버 접근 검사로 업무정보의 조회·변경 범위를 관리합니다." },
                  { icon: <Smartphone />, title: "모바일 최적화", desc: "화면 크기에 맞춘 웹 화면에서 개인 업무와 관리자 업무를 확인합니다." },
                  { icon: <Globe />, title: "로그인 ID 도메인 관리", desc: "이메일 도메인 확인 후 기존 계정의 로그인 ID 변경을 관리합니다." },
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
                
                <h3 className="text-3xl font-black mb-4 relative">지금 가입하고<br />90일간 무료로 체험하세요</h3>
                <p className="text-indigo-100 font-medium mb-8 relative">회사 설정부터 일상 업무까지 권한에 맞는 기능을 체험할 수 있습니다.</p>
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
              <span className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">이용약관</span>
              <span className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">개인정보처리방침</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
