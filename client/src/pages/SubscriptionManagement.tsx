import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, AlertTriangle, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

declare global {
  interface Window {
    paypal: any;
  }
}

export const SubscriptionManagement: React.FC = () => {
  const { userData, companyData } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);

  useEffect(() => {
    // PayPal SDK가 로드되었는지 확인
    const checkPaypal = setInterval(() => {
      if (window.paypal) {
        setPaypalLoaded(true);
        clearInterval(checkPaypal);
      }
    }, 500);

    return () => clearInterval(checkPaypal);
  }, []);

  useEffect(() => {
    if (paypalLoaded && companyData) {
      // 이전에 렌더링된 버튼이 있다면 제거 (재렌더링 방지)
      const container = document.getElementById('paypal-container-36DMV6NKPEZYW');
      if (container) container.innerHTML = '';

      window.paypal.HostedButtons({
        hostedButtonId: "36DMV6NKPEZYW",
        onApprove: async (data: any, _actions: any) => {
          setLoading(true);
          try {
            // 결제 정보 저장 및 회사 정보 업데이트
            const companyRef = doc(db, 'companies', companyData.id);
            
            // 기존 만료일 확인 및 연장 로직 개선
            const currentEndDate = companyData.subscriptionEndDate ? new Date(companyData.subscriptionEndDate) : new Date();
            const now = new Date();
            
            // 이미 만료되었다면 오늘부터 30일, 아니면 기존 날짜에 30일 추가
            const baseDate = currentEndDate.getTime() < now.getTime() ? now : currentEndDate;
            const newEndDate = new Date(baseDate);
            newEndDate.setDate(newEndDate.getDate() + 30);

            await updateDoc(companyRef, {
              subscriptionStatus: 'ACTIVE',
              subscriptionEndDate: newEndDate.toISOString(),
              lastPaymentDate: new Date().toISOString()
            });

            // 결제 기록 생성
            await addDoc(collection(db, 'payments'), {
              companyId: companyData.id,
              companyName: companyData.nameKo,
              adminUid: userData?.uid,
              adminName: userData?.name,
              amount: 15.00, // 월 $15 기준 (연간 구독일 경우 데이터 확인 필요)
              currency: 'USD',
              transactionId: data.orderID,
              createdAt: serverTimestamp(),
              status: 'COMPLETED'
            });

            alert('결제가 완료되었습니다. 서비스 구독이 갱신되었습니다.');
            window.location.reload(); // 상태 반영을 위해 새로고침
          } catch (err) {
            console.error('Payment Update Error:', err);
            alert('결제 정보 업데이트 중 오류가 발생했습니다. 관리자에게 문의하세요.');
          } finally {
            setLoading(false);
          }
        }
      }).render("#paypal-container-36DMV6NKPEZYW");
    }
  }, [paypalLoaded, companyData, userData]);

  if (!companyData) return null;

  const trialDays = 90;
  const createdDate = new Date(companyData.createdAt);
  const expiryDate = new Date(createdDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  
  const isExpired = companyData.subscriptionStatus === 'EXPIRED';
  const isActive = companyData.subscriptionStatus === 'ACTIVE';

  return (
    <div className="flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
              <CreditCard className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">구독 및 결제 관리</h1>
          </div>
          <p className="text-slate-500 font-medium">서비스 이용을 위한 구독 플랜을 관리하고 결제 내역을 확인합니다.</p>
        </div>

        {/* Status Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`bg-white rounded-[2.5rem] p-8 shadow-xl border-2 transition-all ${
            isActive ? 'border-emerald-500 shadow-emerald-50' : 
            isExpired ? 'border-rose-500 shadow-rose-50' : 'border-indigo-100'
          }`}>
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">현재 구독 상태</h2>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                isActive ? 'bg-emerald-50 text-emerald-600' : 
                isExpired ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
              }`}>
                {isActive ? <Zap className="w-8 h-8 fill-current" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <div>
                <p className={`text-2xl font-black ${
                  isActive ? 'text-emerald-600' : 
                  isExpired ? 'text-rose-600' : 'text-indigo-600'
                }`}>
                  {isActive ? '구독 중 (ACTIVE)' : 
                   isExpired ? '구독 만료 (EXPIRED)' : '무료 체험 중 (TRIAL)'}
                </p>
                <p className="text-slate-400 font-bold text-sm">
                  {isActive ? `만료일: ${new Date(companyData.subscriptionEndDate!).toLocaleDateString()}` :
                   isExpired ? '서비스 이용이 제한되었습니다.' : `체험 종료까지 ${daysLeft}일 남음`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16"></div>
            <h2 className="text-sm font-black text-indigo-300 uppercase tracking-widest mb-4">구독 플랜 정보</h2>
            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">플랜 종류</span>
                <span className="font-black text-lg">{companyData.planType || 'Standard Plan'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">마지막 결제일</span>
                <span className="font-black">{companyData.lastPaymentDate ? new Date(companyData.lastPaymentDate).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Section */}
        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="p-10 md:p-16 flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black uppercase tracking-widest">
                <Zap className="w-4 h-4 fill-current" /> Premium SaaS Benefits
              </div>
              <h3 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
                중단 없는 서비스를 위해<br />구독을 시작하세요.
              </h3>
              <ul className="space-y-3">
                {[
                  '무제한 직원 등록 및 인사 관리',
                  '실시간 근태 및 결재 시스템',
                  '자동 급여 계산 및 세액표 반영',
                  '강력한 데이터 보안 및 멀티테넌트 격리'
                ].map((text, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600 font-bold">
                    <CheckCircle className="w-5 h-5 text-emerald-500" /> {text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="w-full md:w-[400px] space-y-6">
              <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
                <div className="text-center mb-6">
                  <p className="text-slate-400 font-black text-xs uppercase tracking-widest mb-2">Subscription Fee</p>
                  <p className="text-4xl font-black text-slate-900">$15<span className="text-lg text-slate-400">/mo</span></p>
                  <p className="text-sm font-bold text-indigo-600 mt-1">또는 연간 $150 (특별 할인 적용)</p>
                </div>
                
                {/* PayPal Container */}
                <div id="paypal-container-36DMV6NKPEZYW" className="min-h-[150px] w-full overflow-hidden">
                  {!paypalLoaded && (
                    <div className="flex flex-col items-center justify-center gap-3 py-10">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                      <p className="text-xs font-bold text-slate-400">PayPal 결제 모듈 로딩 중...</p>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 text-center mt-6 font-medium leading-relaxed">
                  결제 즉시 서비스 이용 기간이 연장됩니다.<br />
                  연간 구독 시 더욱 저렴하게 이용하실 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning for Super Admin */}
        {userData?.role === 'SUPER_ADMIN' && (
          <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl flex items-center gap-4">
            <ShieldCheck className="w-8 h-8 text-amber-500" />
            <div>
               <p className="font-black text-amber-900">SUPER_ADMIN 접근 모드</p>
               <p className="text-sm font-bold text-amber-700">관리자 화면에서는 결제 버튼만 확인 가능하며, 실제 데이터 수정은 수퍼 어드민 대시보드에서 권장합니다.</p>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white p-8 rounded-[2rem] flex flex-col items-center gap-4 shadow-2xl">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <p className="text-lg font-black text-slate-800">결제 처리 중...</p>
          </div>
        </div>
      )}
    </div>
  );
};
