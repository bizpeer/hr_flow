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

  const fetchProfile = async (userId: string, email?: string) => {
    try {
      // 시스템 관리자 예외 처리
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
      // fetchProfile은 중단되지 않도록 내부에서 모든 에러를 처리합니다.
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
        console.error('Profile fetch error details:', error);
        if (error.code === 'PGRST116') { // No rows found
          setProfile(null);
        } else {
          // 기타 에러 발생 시 세션 유저 정보만으로 최소 프로필 생성
          setProfile({
            id: userId,
            email: email || '',
            full_name: email?.split('@')[0] || '사용자',
            role: 'member',
            companies: { name: '회사 정보 조회 실패' }
          } as any);
        }
      } else if (data) {
        let division_id = null;
        if (data.team_id) {
          try {
            const { data: teamData } = await supabase.from('teams').select('division_id').eq('id', data.team_id).single();
            if (teamData) division_id = teamData.division_id;
          } catch(e) {
            console.warn('Team/Division lookup failed:', e);
          }
        }

        const formattedProfile = {
          ...data,
          companies: data.companies || { name: '회사 정보 없음' },
          division_id
        };
        setProfile(formattedProfile as any);
      }
    } catch (error) {
      console.error('Critical error in fetchProfile:', error);
      // 최소한의 profile 상태라도 유지하여 앱 크래시 방지
      setProfile({ id: userId, email: email || '', role: 'member' } as any);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Initial Session Check
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
        console.error('Auth initialization error:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      const currentUser = session?.user ?? null;
      
      // SIGNED_OUT 시 즉시 처리
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // 세션 정보가 변경되었을 때만 처리
      if (currentUser?.id !== user?.id || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(currentUser);
        if (currentUser) {
          await fetchProfile(currentUser.id, currentUser.email);
        } else {
          setProfile(null);
        }
      }
      
      setLoading(false);
    });

    // 3. Safety Timeout (로딩이 너무 오래 걸릴 경우 강제 해제)
    const timeoutId = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth initialization timed out');
        setLoading(false);
      }
    }, 6000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [user?.id]); // id가 바뀔 때만 재구독 방지

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
