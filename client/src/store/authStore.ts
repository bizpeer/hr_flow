import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, limit, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SUB_ADMIN' | 'EMPLOYEE';

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
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log("[Auth] State Change:", user ? `Logged in (${user.email})` : "Logged out");
      
      if (user) {
        const isSuperAdmin = user.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL;
        set({ user, loading: true });
        
        try {
          const profileDoc = await getDoc(doc(db, 'UserProfile', user.uid));
          let currentData: UserData | null = profileDoc.exists() ? (profileDoc.data() as UserData) : null;

          // 임시 문서(temp) 마이그레이션 로직 유지
          if (!currentData && user.email) {
            console.log("[Auth] UID document not found. Searching by email for temporary profile...");
            const q = query(collection(db, 'UserProfile'), where('email', '==', user.email.toLowerCase().trim()), limit(1));
            const fallbackSnap = await getDocs(q);
            
            if (!fallbackSnap.empty) {
              const tempDoc = fallbackSnap.docs[0];
              const tempData = tempDoc.data() as UserData;
              console.log("[Auth] Temporary profile found:", tempData.name);
              
              currentData = {
                ...tempData,
                uid: user.uid,
                mustChangePassword: true
              };

              await setDoc(doc(db, 'UserProfile', user.uid), currentData);
              console.log("[Auth] Migrated temporary doc to permanent UID doc.");
              
              if (tempDoc.id.startsWith('temp_')) {
                try {
                  await deleteDoc(tempDoc.ref);
                  console.log("[Auth] Old temporary document deleted.");
                } catch (delErr) {
                  console.warn("[Auth] Failed to delete temp doc (likely rules):", delErr);
                }
              }
            }
          }
          
          // [SUPER_ADMIN 권한 자동 보장] bizpeer@gmail.com은 항상 SUPER_ADMIN
          if (isSuperAdmin) {
            if (!currentData || currentData.role !== 'SUPER_ADMIN') {
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
          }
          
          // [퇴사자 접속 차단]
          if (currentData?.status === 'RESIGNED') {
            await auth.signOut();
            set({ user: null, userData: null, loading: false });
            alert("퇴사(업무정지) 처리된 계정입니다. 시스템에 접속할 수 없습니다.");
            return;
          }

          // 회사 정보 로드
          if (currentData?.companyId && currentData.companyId !== 'PLATFORM') {
            await get().fetchCompanyDomain(currentData.companyId);
          }
          
          set({ 
            userData: currentData, 
            loading: false,
            isLoginModalOpen: (currentData?.mustChangePassword && !isSuperAdmin) || false 
          });
          if (currentData?.mustChangePassword && !isSuperAdmin) {
            console.log("[Auth] Password change REQUIRED for normal user. Opening modal.");
          }
          console.log("[Auth] Final UserData:", currentData);
        } catch (error) {
          console.error("[Auth] Error fetching doc:", error);
          set({ userData: null, loading: false });
        }
      } else {
        set({ user: null, userData: null, companyData: null, loading: false });
      }
    });

    return unsubscribeAuth;
  }
}));
