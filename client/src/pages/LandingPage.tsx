import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, CheckCircle2, Clock, FileText, Users, 
  ShieldCheck, Smartphone, Zap, ChevronRight,
  Globe, LayoutDashboard, Database
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = React.useState<'preview' | 'video'>('preview');

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
            <div 
              onClick={() => navigate('/')}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg shadow-indigo-600/20 group-hover:scale-110 transition-transform">HF</div>
              <span className="text-2xl font-black tracking-tighter text-slate-900 group-hover:text-indigo-600 transition-colors">HR <span className="text-indigo-600">FLOW</span></span>
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

          {/* Toggle Switch */}
          <div className="mt-16 mb-8 flex justify-center">
            <div className="bg-white/60 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 inline-flex shadow-sm">
              <button 
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  viewMode === 'preview' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                기능 한눈에 보기
              </button>
              <button 
                onClick={() => setViewMode('video')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  viewMode === 'video' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                동영상 시연
              </button>
            </div>
          </div>

          {/* Feature Highlight Container */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-indigo-600/5 rounded-[40px] blur-3xl -z-10" />
            <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 p-4 relative overflow-hidden h-[450px] md:h-[550px] transition-all duration-500">
              
              {viewMode === 'preview' ? (
                /* Enhanced Abstract Dashboard Preview with Labels from Spec */
                <div className="bg-slate-50 rounded-[20px] w-full h-full p-6 md:p-10 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex flex-col h-full gap-4 md:gap-6">
                    {/* Header bar */}
                    <div className="h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center px-6 gap-4">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                      <div className="h-4 w-32 bg-slate-100 rounded-full ml-4" />
                    </div>
                    
                    <div className="flex-1 grid grid-cols-12 gap-4 md:gap-6">
                      {/* Sidebar abstract */}
                      <div className="hidden md:block col-span-3 space-y-4">
                        <div className="h-6 w-full bg-slate-200/50 rounded-lg" />
                        <div className="space-y-2">
                          {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-10 w-full bg-white rounded-xl border border-slate-100" />
                          ))}
                        </div>
                        <div className="pt-10 flex flex-col items-center">
                          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-indigo-200">
                            <Users className="w-8 h-8" />
                          </div>
                          <p className="text-[10px] font-black text-slate-300 mt-2 uppercase tracking-widest">Employee Org</p>
                        </div>
                      </div>
                      
                      {/* Main content Area */}
                      <div className="col-span-12 md:col-span-9 flex flex-col gap-4 md:gap-6">
                         {/* Highlight Cards */}
                         <div className="grid grid-cols-3 gap-3 md:gap-6">
                            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                               <div className="absolute top-0 right-0 p-2 opacity-10"><Clock /></div>
                               <h4 className="text-[10px] md:text-xs font-black text-indigo-500 uppercase tracking-tighter mb-1">Attendance</h4>
                               <p className="text-[12px] md:text-sm font-black text-slate-900 leading-tight">실시간 근태 및 연차 관리</p>
                               <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 w-2/3" />
                               </div>
                            </div>
                            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                               <div className="absolute top-0 right-0 p-2 opacity-10"><Database /></div>
                               <h4 className="text-[10px] md:text-xs font-black text-emerald-500 uppercase tracking-tighter mb-1">Payroll</h4>
                               <p className="text-[12px] md:text-sm font-black text-slate-900 leading-tight">2026 간이세액 자동 산출</p>
                               <div className="mt-4 h-6 w-full bg-emerald-50 border border-emerald-100 rounded-lg flex items-center px-2">
                                  <div className="w-full h-1.5 bg-emerald-200/50 rounded-full" />
                               </div>
                            </div>
                            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                               <div className="absolute top-0 right-0 p-2 opacity-10"><CheckCircle2 /></div>
                               <h4 className="text-[10px] md:text-xs font-black text-rose-500 uppercase tracking-tighter mb-1">Approvals</h4>
                               <p className="text-[12px] md:text-sm font-black text-slate-900 leading-tight">Fast-Track 승인 프로세스</p>
                               <div className="mt-4 flex gap-1">
                                  <div className="w-3 h-3 rounded-full bg-rose-200" />
                                  <div className="w-3 h-3 rounded-full bg-rose-200" />
                                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                               </div>
                            </div>
                         </div>

                         {/* Large Graph/Table Placeholder */}
                         <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 relative">
                            <div className="flex items-center justify-between mb-8">
                               <div className="space-y-1">
                                  <div className="h-4 w-40 bg-slate-100 rounded-full" />
                                  <div className="h-3 w-24 bg-slate-50 rounded-full" />
                               </div>
                               <div className="flex gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100" />
                                  <div className="w-24 h-8 rounded-lg bg-indigo-50 border border-indigo-100" />
                               </div>
                            </div>
                            
                            <div className="space-y-6">
                               {[1, 2, 3].map(i => (
                                 <div key={i} className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                                       <Users className="w-5 h-5 text-slate-300" />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                       <div className="h-3 w-full bg-slate-50 rounded-full max-w-[200px]" />
                                       <div className="h-2 w-full bg-slate-200/30 rounded-full" />
                                    </div>
                                    <div className="w-20 h-4 bg-indigo-50 rounded-full" />
                                 </div>
                               ))}
                            </div>
                            
                            {/* Watermark/Title */}
                            <div className="absolute right-10 bottom-10">
                               <div className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-2">
                                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                  Enterprise Secured
                               </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Video Player Area */
                <div className="w-full h-full bg-slate-900 rounded-[24px] relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-10 text-center">
                    <div className="w-24 h-24 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center group/play cursor-pointer hover:scale-110 transition-all duration-500 hover:bg-indigo-600/20 active:scale-95">
                      <ChevronRight className="w-10 h-10 text-white fill-current translate-x-1" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-black text-white tracking-tight">HR FLOW 시연 동영상</h3>
                      <p className="text-indigo-200/60 font-medium text-sm">스마트한 인사 관리를 직접 확인해보세요.</p>
                    </div>
                    
                    {/* Fake Video Controls UI */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg px-8">
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-4">
                         <div className="h-full bg-indigo-500 w-1/3" />
                      </div>
                      <div className="flex justify-between items-center text-white/50 text-[10px] font-black uppercase tracking-widest">
                         <div className="flex gap-4">
                            <span>02:15 / 06:40</span>
                            <span className="text-white">HD High Quality</span>
                         </div>
                         <div className="flex gap-4">
                            <span>Settings</span>
                            <span>Full Screen</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Decorative blurred spots */}
                  <div className="absolute top-1/4 -right-20 w-64 h-64 bg-indigo-600/30 rounded-full blur-[100px]" />
                  <div className="absolute bottom-1/4 -left-20 w-64 h-64 bg-violet-600/30 rounded-full blur-[100px]" />
                </div>
              )}
              
              {/* Common Status Link in Spec */}
              <div className="absolute top-6 right-10 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                 <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">Live Demo Available</span>
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
              <span className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">이용약관</span>
              <span className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">개인정보처리방침</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
