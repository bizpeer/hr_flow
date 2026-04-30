import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, limit, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SUB_ADMIN' | 'MEMBER';

export interface TeamHistory {
  teamId: string;
  teamName: string;
  joinedAt: string;
  leftAt: string;
}

export interface CompanyData {
  id: string;
  nameKo: string;
  nameEn: string;
  domain: string;
  adminUid: string;
  createdAt: string;
  status: 'ACTIVE' | 'SUSPENDED';
  subscriptionStatus?: 'ACTIVE' | 'EXPIRED' | 'TRIAL';
  subscriptionEndDate?: string;
  planType?: 'MONTHLY' | 'YEARLY';
  lastPaymentDate?: string;
  lastBackupAt?: string;
}

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: Role;
  companyId: string; // 소속 회사 ID (SUPER_ADMIN은 'PLATFORM')
  teamId?: string;
  divisionId?: string;
  teamHistory?: TeamHistory[];
  joinDate?: string; // 입사일 (YYYY-MM-DD)
  annualLeaveTotal?: number; // 총 발생 연차
  usedLeave?: number; // 사용한 연차
  mustChangePassword?: boolean; // 최초 로그인 시 비밀번호 변경 여부
  status?: 'ACTIVE' | 'RESIGNED'; // 계정 상태
  annualSalary?: number; // 연봉/월급 (원)
  salaryType?: 'ANNUAL' | 'MONTHLY'; // 연봉 혹은 월급
  isSeveranceIncluded?: boolean; // 퇴직금 포함 여부
  dependents?: number; // 부양가족 수 (본인 포함)
  childrenUnder20?: number; // 20세 이하 자녀 수
  nonTaxable?: number; // 비과세액 (기본 200,000원)
  additionalLeave?: number; // 관리자가 부여한 추가 연차
}

interface AuthState {
  user: User | null;
  userData: UserData | null;
  companyData: CompanyData | null; // 현재 소속 회사 정보
  systemDomain: string; // 현재 회사의 도메인
  loading: boolean;
  isLoginModalOpen: boolean;
  isManualChangeMode: boolean;
  initAuth: () => (() => void);
  fetchCompanyDomain: (companyId: string) => Promise<void>;
  setUserData: (userData: UserData | null) => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  openPasswordChange: () => void;
  logout: () => Promise<void>;
  getDisplayEmail: (email?: string | null) => string;
}


export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userData: null,
  companyData: null,
  systemDomain: 'company.com', // 기본값
  loading: true,
  isLoginModalOpen: false,
  isManualChangeMode: false,
  setUserData: (userData) => set({ userData }),
  setLoginModalOpen: (isOpen) => set({ 
    isLoginModalOpen: isOpen,
    isManualChangeMode: isOpen ? get().isManualChangeMode : false 
  }),
  openPasswordChange: () => set({ isLoginModalOpen: true, isManualChangeMode: true }),
  getDisplayEmail: (email?: string | null) => {
    if (!email) return 'ID 미표기';
    return email; // SaaS 모드에서는 이메일을 그대로 표시
  },

  logout: async () => {
    try {
      await auth.signOut();
      set({ user: null, userData: null, companyData: null, systemDomain: 'company.com' });
    } catch (error) {
      console.error("Logout failed", error);
    }
  },

  fetchCompanyDomain: async (companyId: string) => {
    if (!companyId || companyId === 'PLATFORM') return;
    try {
      const companyDoc = await getDoc(doc(db, 'companies', companyId));
      if (companyDoc.exists()) {
        const data = companyDoc.data() as CompanyData;
        
        // 구독 상태 자동 계산 (실시간 반영을 위해 클라이언트 사이드에서 체크)
        const trialDays = 90;
        const createdDate = new Date(data.createdAt);
        const expiryDate = new Date(createdDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const isTrialActive = new Date() < expiryDate;
        
        let subStatus = data.subscriptionStatus || 'TRIAL';
        
        // 체험 기간이 끝났는데 유효한 구독 종료일이 없거나 지난 경우 EXPIRED
        if (!isTrialActive) {
          if (!data.subscriptionEndDate || new Date() > new Date(data.subscriptionEndDate)) {
            subStatus = 'EXPIRED';
          } else {
            subStatus = 'ACTIVE';
          }
        } else if (!data.subscriptionEndDate) {
          subStatus = 'TRIAL';
        } else if (new Date() < new Date(data.subscriptionEndDate)) {
          subStatus = 'ACTIVE';
        }

        set({ 
          companyData: { ...data, id: companyDoc.id, subscriptionStatus: subStatus as any },
          systemDomain: data.domain || 'company.com'
        });
        console.log("[System] Company Domain:", data.domain, "| Sub Status:", subStatus);
      }
    } catch (err) {
      console.error("[System] Failed to fetch company domain:", err);
    }
  },

  initAuth: (() => {
    let initialized = false;
    let unsubscribeAuth: (() => void) | null = null;
    let unsubscribeProfile: (() => void) | null = null;

    return () => {
      // 이미 초기화된 경우 중복 실행 방지
      if (initialized) return () => {};
      initialized = true;

      unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        console.log("[Auth] State Change:", user ? `Logged in (${user.email})` : "Logged out");
        
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        if (user) {
          set({ user, loading: true });
          
          unsubscribeProfile = onSnapshot(doc(db, 'UserProfile', user.uid), async (profileSnap) => {
            const data = profileSnap.data();
            let currentData: UserData | null = profileSnap.exists() ? (data as UserData) : null;

            // 1. 데이터가 아직 불완전한 경우 (예: 가입 중 가입 정보 누락)
            if (currentData && !currentData.role) {
              console.log("[Auth] Profile exists but incomplete (no role). Waiting...");
              return; 
            }

            // 2. 임시 문서(temp) 마이그레이션 및 미생성 프로필 대기 로직
            if (!currentData) {
              if (user.email) {
                try {
                  const q = query(collection(db, 'UserProfile'), where('email', '==', user.email.toLowerCase().trim()), limit(1));
                  const fallbackSnap = await getDocs(q);
                  if (!fallbackSnap.empty) {
                    const tempDoc = fallbackSnap.docs[0];
                    const tempData = tempDoc.data() as UserData;
                    currentData = { ...tempData, uid: user.uid, mustChangePassword: true };
                    await setDoc(doc(db, 'UserProfile', user.uid), currentData);
                    if (tempDoc.id.startsWith('temp_')) {
                      try { await deleteDoc(tempDoc.ref); } catch (e) {}
                    }
                    console.log("[Auth] Temp profile migrated.");
                    return; // setDoc will trigger onSnapshot again
                  }
                } catch (err) {
                  console.error("[Auth] Fallback query error:", err);
                }
              }
              // [중요 가드] fallback도 없고 currentData도 없는 경우 -> 가입 직후 프로필 생성 전!
              // [해결] 찌꺼기 계정 방어 로직 (DB Profile 누락된 고스트 세션)
              // 7초 대기 후에도 userData가 채워지지 않으면 무한 로딩을 막기 위해 강제 로그아웃 처리 검토
              setTimeout(() => {
                if (get().loading && !get().userData && auth.currentUser) {
                  console.warn("[Auth] WARNING: No profile found after 7s timeout. Please check 'weberp' database.");
                  // 강제 로그아웃은 사용자 경험을 해칠 수 있으므로, 로딩 상태만 해제하고 로그인 페이지에서 처리하도록 유도
                  set({ loading: false });
                }
              }, 7000);

              return; 
            }


            // 4. 역할 정규화 (변경 있을 때만 setDoc)
            if (currentData && currentData.role && !['SUPER_ADMIN', 'ADMIN', 'SUB_ADMIN', 'MEMBER'].includes(currentData.role)) {
              currentData = { ...currentData, role: 'MEMBER' };
              await setDoc(doc(db, 'UserProfile', user.uid), currentData);
            }

            // 5. 상태 확인
            if (currentData?.status === 'RESIGNED') {
              await auth.signOut();
              set({ user: null, userData: null, loading: false });
              alert("퇴사 처리된 계정입니다.");
              return;
            }

            // 6. 회사 도메인 로드 (이미 로드된 상태면 건너뜀)
            if (currentData?.companyId && currentData.companyId !== 'PLATFORM') {
              const currentCompanyId = get().companyData?.id;
              if (currentCompanyId !== currentData.companyId) {
                await get().fetchCompanyDomain(currentData.companyId);
              }
            }

            // [최종 상태 업데이트] 데이터가 실제로 다를 때만 set() 호출하여 무한 렌더링 방지
            const prevUserData = get().userData;
            const isDifferent = JSON.stringify(prevUserData) !== JSON.stringify(currentData);
            
            if (isDifferent || get().loading) {
              set({ 
                userData: currentData, 
                loading: false,
                isLoginModalOpen: (currentData?.mustChangePassword && currentData.role !== 'SUPER_ADMIN') || false 
              });
              console.log("[Auth] UserData Updated (Loop-Safe):", currentData?.role);
            }
          }, (err) => {
            console.error("[Auth] Snapshot Error:", err);
            set({ loading: false });
          });
        } else {
          set({ user: null, userData: null, companyData: null, loading: false });
        }
      });

      return () => {
        if (unsubscribeAuth) unsubscribeAuth();
        if (unsubscribeProfile) unsubscribeProfile();
        initialized = false; // 클린업 시 플래그 초기화
      };
    };
  })() as () => (() => void),
}));
