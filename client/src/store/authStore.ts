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

// SUPER_ADMIN 이메일 (플랫폼 최고 관리자)
const SUPER_ADMIN_EMAIL = 'bizpeer@gmail.com';

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
        set({ 
          companyData: { ...data, id: companyDoc.id },
          systemDomain: data.domain || 'company.com'
        });
        console.log("[System] Company Domain:", data.domain);
      }
    } catch (err) {
      console.error("[System] Failed to fetch company domain:", err);
    }
  },

  initAuth: () => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log("[Auth] State Change:", user ? `Logged in (${user.email})` : "Logged out");
      
      // 기존 프로필 구독 해제
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        set({ user, loading: true });
        const isSuperAdmin = user.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
        
        // 프로필 실시간 감시 시작
        unsubscribeProfile = onSnapshot(doc(db, 'UserProfile', user.uid), async (profileSnap) => {
          let currentData: UserData | null = profileSnap.exists() ? (profileSnap.data() as UserData) : null;

          // 1. 임시 문서(temp) 마이그레이션 로직 (최초 로그인 시 1회성)
          if (!currentData && user.email) {
            console.log("[Auth] UID document not found. Checking by email for temporary profile...");
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
            }
          }

          // 2. [SUPER_ADMIN 권한 자동 보장] bizpeer@gmail.com은 항상 SUPER_ADMIN
          if (isSuperAdmin && (!currentData || currentData.role !== 'SUPER_ADMIN')) {
            currentData = {
              uid: user.uid,
              email: SUPER_ADMIN_EMAIL,
              name: currentData?.name || '플랫폼 관리자',
              role: 'SUPER_ADMIN',
              companyId: 'PLATFORM',
              mustChangePassword: false,
              teamHistory: currentData?.teamHistory || [],
              teamId: '',
              divisionId: ''
            };
            await setDoc(doc(db, 'UserProfile', user.uid), currentData);
            console.log("[Auth] SUPER_ADMIN profile ensured.");
          }

          // 3. [역할 정규화]
          if (currentData && !['SUPER_ADMIN', 'ADMIN', 'SUB_ADMIN', 'MEMBER'].includes(currentData.role)) {
            currentData = { ...currentData, role: 'MEMBER' };
            try { await setDoc(doc(db, 'UserProfile', user.uid), currentData); } catch (e) {}
          }

          // 4. 퇴직/업무정지 상태 확인
          if (currentData?.status === 'RESIGNED') {
            await auth.signOut();
            set({ user: null, userData: null, loading: false });
            alert("퇴사(업무정지) 처리된 계정입니다. 시스템에 접속할 수 없습니다.");
            return;
          }

          // 5. 회사 도메인 정보 로드
          if (currentData?.companyId && currentData.companyId !== 'PLATFORM') {
            await get().fetchCompanyDomain(currentData.companyId);
          }

          // 최종 상태 반영
          set({ 
            userData: currentData, 
            loading: false,
            isLoginModalOpen: (currentData?.mustChangePassword && !isSuperAdmin) || false 
          });
          console.log("[Auth] UserData Updated (Reactive):", currentData?.role);
        }, (err) => {
          console.error("[Auth] Profile Subscription Error:", err);
          set({ loading: false });
        });

      } else {
        set({ user: null, userData: null, companyData: null, loading: false });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }
}));
