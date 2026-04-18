import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, limit, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type Role = 'ADMIN' | 'SUB_ADMIN' | 'EMPLOYEE';

export interface TeamHistory {
  teamId: string;
  teamName: string;
  joinedAt: string;
  leftAt: string;
}

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: Role;
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
  systemDomain: string; // 추가: 시스템 기본 도메인
  loading: boolean;
  isLoginModalOpen: boolean;
  isManualChangeMode: boolean; // 추가: 수동 비밀번호 변경 모드
  initAuth: () => (() => void);
  fetchSystemDomain: () => Promise<void>; 
  subscribeSystemDomain: () => (() => void); // 추가: 실시간 구독
  setUserData: (userData: UserData | null) => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  openPasswordChange: () => void; // 추가: 수동 비밀번호 변경 오픈
  logout: () => Promise<void>;
  getDisplayEmail: (email?: string | null) => string; 
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userData: null,
  systemDomain: 'internal.com', // 기본값
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
    const domain = get().systemDomain;
    const [id] = email.split('@');
    return `${id}@${domain}`;
  },

  logout: async () => {
    try {
      await auth.signOut();
      set({ user: null, userData: null });
    } catch (error) {
      console.error("Logout failed", error);
    }
  },

  fetchSystemDomain: async () => {
    try {
      const docRef = doc(db, 'config', 'system');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.defaultDomain) {
          const cleanDomain = data.defaultDomain.replace('@', '').trim();
          console.log("[System] Initial Domain Fetch:", cleanDomain);
          set({ systemDomain: cleanDomain });
        }
      }
    } catch (err) {
      console.error("[System] Failed to fetch system domain:", err);
      set({ systemDomain: 'internal.com' });
    }
  },
  
  subscribeSystemDomain: () => {
    console.log("[System] Starting Real-time Domain Sync...");
    const docRef = doc(db, 'config', 'system');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.defaultDomain) {
          const cleanDomain = data.defaultDomain.replace('@', '').trim();
          console.log("[System] Domain Synced (Live):", cleanDomain);
          set({ systemDomain: cleanDomain });
        }
      }
    }, (err) => {
      console.error("[System] Live Sync Error:", err);
    });
  },
  initAuth: () => {
    const store = useAuthStore.getState();
    
    // 0. 도메인 실시간 동기화 시작 (인증 전에도 가능하도록 규칙 수정됨)
    store.subscribeSystemDomain();

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log("[Auth] State Change:", user ? `Logged in (${user.email})` : "Logged out");
      
      if (user) {
        // bizpeer@ 로 시작하는 모든 도메인의 계정을 마스터로 인정
        const isMaster = user.email?.toLowerCase().trim().startsWith('bizpeer@');
        set({ user, loading: true });
        
        try {
          const profileDoc = await getDoc(doc(db, 'UserProfile', user.uid));
          let currentData: UserData | null = profileDoc.exists() ? (profileDoc.data() as UserData) : null;

          // 만약 쓰기 권한 에러 등으로 본인 UID 문서가 안 만들어졌다면 임시 문서(temp)를 찾아서 매핑 후 마이그레이션 합니다.
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
                mustChangePassword: true // 마이그레이션 대상은 항상 비밀번호 변경 강제
              };

              // 1. 실제 UID를 ID로 하는 영구 문서 생성
              await setDoc(doc(db, 'UserProfile', user.uid), currentData);
              console.log("[Auth] Migrated temporary doc to permanent UID doc.");
              
              // 2. 기존 임시 문서 삭제 (temp_... 형태의 문서)
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
          
          // [마스터 권한 강제 보장] 데이터가 없거나 역할이 ADMIN이 아니면 강제로 수정
          if (isMaster) {
            if (!currentData || currentData.role !== 'ADMIN') {
              currentData = {
                uid: user.uid,
                email: user.email || `bizpeer@${useAuthStore.getState().systemDomain}`,
                name: currentData?.name || '최고 관리자',
                role: 'ADMIN',
                mustChangePassword: currentData ? (currentData.mustChangePassword ?? false) : true,
                teamHistory: currentData?.teamHistory || [],
                teamId: currentData?.teamId || '',
                divisionId: currentData?.divisionId || ''
              };
              await setDoc(doc(db, 'UserProfile', user.uid), currentData);
              console.log("[Auth] Master profile FORCED/RECOVERED to ADMIN.");
            }
          }
          
          // [퇴사자 접속 차단]
          if (currentData?.status === 'RESIGNED') {
            await auth.signOut();
            set({ user: null, userData: null, loading: false });
            alert("퇴사(업무정지) 처리된 계정입니다. 시스템에 접속할 수 없습니다.");
            return;
          }
          
          set({ 
            userData: currentData, 
            loading: false,
            // 최고관리자(Master)가 아닌 일반 사용자의 경우에만 비밀번호 변경 필요 시 모달을 강제로 엽니다.
            isLoginModalOpen: (currentData?.mustChangePassword && !isMaster) || false 
          });
          if (currentData?.mustChangePassword && !isMaster) {
            console.log("[Auth] Password change REQUIRED for normal user. Opening modal.");
          }
          console.log("[Auth] Final UserData:", currentData);
        } catch (error) {
          console.error("[Auth] Error fetching doc:", error);
          set({ userData: null, loading: false });
        }
      } else {
        set({ user: null, userData: null, loading: false });
      }
    });

    return unsubscribeAuth;
  }
}));
