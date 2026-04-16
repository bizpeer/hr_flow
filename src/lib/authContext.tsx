'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Profile } from './api';

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, email?: string, retryCount = 0) => {
    try {
      console.log(`[Auth] Fetching profile for ${email} (Attempt ${retryCount + 1})`);
      
      // 시스템 관리자 예외 처리 (하드코딩된 슈퍼계정)
      if (email === 'bizpeer@gmail.com') {
        setProfile({
          id: userId,
          full_name: '시스템 관리자',
          email: email,
          role: 'system_admin',
          company_id: null,
          companies: { name: '시스템관리자' }
        } as any);
        return;
      }

      // 프로필 정보와 회사 이름을 함께 가져옴
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          companies:company_id (
            name
          )
        `)
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error(`[Auth] Profile fetch error (Attempt ${retryCount + 1}):`, error);
        
        // PGRST116 (No rows found) 에러의 경우, 회원가입 직후 데이터 생성 지연일 수 있으므로 재시도
        if (error.code === 'PGRST116' && retryCount < 3) {
          console.log('[Auth] Profile not found yet, retrying in 1.5s...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          return fetchProfile(userId, email, retryCount + 1);
        }
        
        // 재시도 끝에도 실패하거나 다른 치명적 에러인 경우
        setProfile(null); // 권한을 member로 낮추지 않고 차라리 null로 두어 로직에서 처리하게 함
      } else if (data) {
        let division_id = null;
        if (data.team_id) {
          try {
            const { data: teamData } = await supabase.from('teams').select('division_id').eq('id', data.team_id).single();
            if (teamData) division_id = teamData.division_id;
          } catch(e) {
            console.warn('[Auth] Team lookup failed', e);
          }
        }

        // DB에서 가져온 role을 소문자/공백제거하여 표준화
        const rawRole = (data.role || (user?.user_metadata?.role) || 'member').toString().trim().toLowerCase();

        const formattedProfile = {
          ...data,
          role: rawRole,
          companies: data.companies || { name: '회사 정보 없음' },
          division_id
        };
        
        console.log('[Auth] Profile loaded successfully:', { email, role: rawRole });
        setProfile(formattedProfile as any);
      } else {
        // 데이터는 없지만 사용자는 있는 경우 (회원가입 직후 등) 메타데이터 활용
        const metaRole = (user?.user_metadata?.role || 'member').toString().trim().toLowerCase();
        setProfile({
          id: userId,
          email: email,
          role: metaRole,
          full_name: user?.user_metadata?.full_name || '사용자',
          company_id: user?.user_metadata?.company_id
        } as any);
      }
    } catch (error) {
      console.error('[Auth] Critical crash in fetchProfile:', error);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      setLoading(true);
      await fetchProfile(user.id, user.email);
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 초기 세션 확인 로직
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          await fetchProfile(currentUser.id, currentUser.email);
        }
      } catch (error) {
        console.error('[Auth] Init error:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      const currentUser = session?.user ?? null;
      console.log(`[Auth] Event: ${event}, User: ${currentUser?.email}`);

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // 계정이 바뀌었거나 새로 로그인한 경우 프로필 로드
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || currentUser?.id !== user?.id) {
        setUser(currentUser);
        if (currentUser) {
          // 메타데이터만으로도 우선 권한을 설정하여 화면 전환이 즉시 일어나게 함
          const metaRole = (currentUser.user_metadata?.role || 'member').toString().trim().toLowerCase();
          setProfile(prev => ({
            ...prev,
            id: currentUser.id,
            email: currentUser.email,
            role: metaRole,
            full_name: currentUser.user_metadata?.full_name || '사용자',
            company_id: currentUser.user_metadata?.company_id || prev?.company_id || null
          } as any));

          // 백그라운드에서 DB 정보 업데이트 (비성능 저하 방지)
          fetchProfile(currentUser.id, currentUser.email);
        } else {
          setProfile(null);
        }
      }
      
      setLoading(false);
    });

    const timeoutId = setTimeout(() => {
      if (mounted && loading) {
        console.warn('[Auth] Timeout reached');
        setLoading(false);
      }
    }, 8000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []); // 의존성 배열 비움 (구독 중복 방지)

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
