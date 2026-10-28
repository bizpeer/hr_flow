import { Button, Input, PageTitle, Panel } from '../components/ui';
import React, { useRef, useState } from 'react';
import { CreditCard, CheckCircle, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getRoleDisplayName } from '../utils/roleDisplay';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import './SubscriptionManagement.css';

const HostedPayPalCheckout: React.FC<{ uid: string; companyId: string }> = ({ uid, companyId }) => {
  const submitting = useRef(false);
  const completed = useRef(new Set<string>());
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittedOrder, setSubmittedOrder] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const order = orderId.trim();
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(order)) {
      setError('PayPal 영수증의 거래 또는 주문번호를 6~80자의 영문, 숫자, 밑줄, 하이픈으로 입력해 주세요.');
      return;
    }
    const { userData, companyData } = useAuthStore.getState();
    if (userData?.uid !== uid || userData.role !== 'ADMIN' || userData.mustChangePassword ||
      (userData.status && userData.status !== 'ACTIVE') || companyData?.status !== 'ACTIVE' ||
      userData.companyId !== companyId || companyData?.id !== companyId) {
      setOrderId(''); setSubmittedOrder('');
      setError('회사 관리자 계정 정보를 다시 확인한 뒤 요청해 주세요.');
      return;
    }
    if (completed.current.has(order)) {
      setSubmittedOrder(order); setError('');
      return;
    }
    submitting.current = true;
    setLoading(true); setError(''); setSubmittedOrder('');
    try {
      // Transaction IDs are untrusted until the platform administrator verifies PayPal.
      await httpsCallable(functions, 'accountSecurity')({ action: 'submitPaymentClaim', orderId: order });
      completed.current.add(order);
      setSubmittedOrder(order);
    } catch {
      setError('결제 확인 요청을 보내지 못했습니다. 입력한 번호는 유지됩니다. 다시 결제하지 말고 확인 요청을 다시 보내 주세요.');
    } finally {
      submitting.current = false; setLoading(false);
    }
  };
  return <div className="subscription-checkout space-y-5">
    <a href="https://www.paypal.com/ncp/payment/36DMV6NKPEZYW" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      className="wf-btn wf-btn-primary block rounded-xl bg-indigo-600 px-5 py-3 text-center font-bold text-white hover:bg-indigo-700">PayPal에서 구독 결제 (새 탭)</a>
    <p className="text-xs text-slate-500 leading-relaxed">PayPal에서 월간 또는 연간 플랜을 선택해 결제한 뒤 이 화면으로 돌아와 주세요. 이미 결제했다면 다시 결제하지 마세요.</p>
    <form onSubmit={submit} className="subscription-claim-form space-y-3" aria-label="PayPal 결제 확인 요청">
      <label htmlFor="paypal-transaction-id" className="wf-field block text-sm font-bold text-slate-700">PayPal 거래 또는 주문번호</label>
      <Input id="paypal-transaction-id" value={orderId} onChange={event => { setOrderId(event.target.value); setError(''); setSubmittedOrder(''); }}
        minLength={6} maxLength={80} required disabled={loading} autoComplete="off" spellCheck={false}
        className="wf-input w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" placeholder="PayPal 영수증의 거래/주문번호" />
      <Button type="submit" disabled={loading || submittedOrder === orderId.trim()}
        className="wf-btn w-full rounded-xl border border-indigo-300 px-4 py-2 text-sm font-bold text-indigo-700 disabled:opacity-50">
        {loading ? '결제 확인 요청 중...' : error ? '결제 확인 요청 다시 보내기' : '결제 확인 요청 보내기'}
      </Button>
      {error && <p role="alert" className="subscription-message subscription-error text-xs text-rose-700">{error}</p>}
      {submittedOrder && <p role="status" className="subscription-message subscription-success text-xs text-emerald-700">결제 확인 요청이 접수되었습니다. 플랫폼 관리자의 거래 확인 후 이용 기간이 반영됩니다.</p>}
    </form>
  </div>;
};

export const SubscriptionManagement: React.FC = () => {
  const { userData, companyData } = useAuthStore();

  if (!companyData) return null;

  const trialDays = 90;
  const createdDate = new Date(companyData.createdAt);
  const expiryDate = new Date(createdDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  
  const isExpired = companyData.subscriptionStatus === 'EXPIRED';
  const isActive = companyData.subscriptionStatus === 'ACTIVE';

  return (
    <div className="subscription-screen wf-page flex-1 p-4 md:p-10 bg-slate-50 min-h-screen">
      <div className="subscription-content max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="subscription-page-head space-y-2">
          <div className="flex items-center gap-3">
            <div className="subscription-heading-icon p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
              <CreditCard className="w-6 h-6" />
            </div>
            <PageTitle className="wf-title text-3xl font-black text-slate-900 tracking-tight">구독 및 결제 관리</PageTitle>
          </div>
          <p className="text-slate-500 font-medium">서비스 구독 상태와 플랜을 확인하고 결제 확인을 요청합니다.</p>
        </header>

        {/* Status Card */}
        <div className="subscription-summary grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel className={`subscription-status-card wf-panel ${isActive ? 'is-active' : isExpired ? 'is-expired' : 'is-trial'} bg-white rounded-[2.5rem] p-8 shadow-xl border-2 transition-all ${
            isActive ? 'border-emerald-500 shadow-emerald-50' : 
            isExpired ? 'border-rose-500 shadow-rose-50' : 'border-indigo-100'
          }`}>
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">현재 구독 상태</h2>
            <div className="subscription-status-row flex items-center gap-4">
              <div className={`subscription-status-icon w-16 h-16 rounded-2xl flex items-center justify-center ${
                isActive ? 'bg-emerald-50 text-emerald-600' : 
                isExpired ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
              }`}>
                {isActive ? <Zap className="w-8 h-8 fill-current" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <div>
                <p className={`subscription-status-label text-2xl font-black ${
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
          </Panel>

          <Panel className="subscription-plan-card wf-panel bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl text-white relative overflow-hidden">
            <div className="subscription-decoration absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16"></div>
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
          </Panel>
        </div>

        {/* Payment Section */}
        <Panel className="subscription-payment wf-panel bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="subscription-payment-grid p-10 md:p-16 flex flex-col md:flex-row items-center gap-12">
            <div className="subscription-benefits flex-1 space-y-6">
              <div className="subscription-benefit-badge inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black uppercase tracking-widest">
                <Zap className="w-4 h-4 fill-current" /> Premium SaaS Benefits
              </div>
              <h3 className="subscription-payment-title text-4xl font-black text-slate-900 tracking-tight leading-tight">
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

            <div className="subscription-payment-column w-full md:w-[400px] space-y-6">
              <div className="subscription-price-card bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
                <div className="text-center mb-6">
                  <p className="text-slate-400 font-black text-xs uppercase tracking-widest mb-2">Subscription Fee</p>
                  <p className="subscription-price text-4xl font-black text-slate-900">$15<span className="text-lg text-slate-400">/mo</span></p>
                  <p className="text-sm font-bold text-indigo-600 mt-1">또는 연간 $150 (특별 할인 적용)</p>
                </div>
                
                {userData?.role === 'ADMIN' && !userData.mustChangePassword && userData.companyId === companyData.id ?
                  <HostedPayPalCheckout key={`${userData.uid}:${companyData.id}`} uid={userData.uid} companyId={companyData.id} /> :
                  <p className="text-sm text-slate-500">회사 관리자 계정으로 결제를 진행해 주세요.</p>}

                <p className="text-[10px] text-slate-400 text-center mt-6 font-medium leading-relaxed">
                  결제 후 거래 확인을 거쳐 서비스 이용 기간이 연장됩니다.<br />
                  연간 구독 시 더욱 저렴하게 이용하실 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        {/* Warning for Super Admin */}
        {userData?.role === 'SUPER_ADMIN' && (
          <div className="subscription-platform-mode p-6 bg-amber-50 border border-amber-200 rounded-3xl flex items-center gap-4">
            <ShieldCheck className="w-8 h-8 text-amber-500" />
            <div>
               <p className="font-black text-amber-900">{getRoleDisplayName(userData, companyData)} 접근 모드</p>
               <p className="text-sm font-bold text-amber-700">관리자 화면에서는 결제 버튼만 확인 가능하며, 실제 데이터 수정은 플랫폼 관리 센터에서 권장합니다.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
