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
        if (error.code === 'PGRST116') { // No rows found
          setProfile(null);
        } else {
          throw error;
        }
      } else {
        // 데이터 구조가 중첩되어 올 수 있으므로 정규화 처리
        const formattedProfile = {
          ...data,
          companies: data.companies || { name: '회사 정보 없음' }
        };
        setProfile(formattedProfile as any);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
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

    // 3. Safety Timeout (로딩이 너무 오래 걸릴 경우 강제 해제)
    const timeoutId = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth initialization timed out, forcing loading to false');
        setLoading(false);
      }
    }, 5000);

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        await fetchProfile(currentUser.id, currentUser.email);
      } else {
        setProfile(null);
      }
      
      // onAuthStateChange에서 발생하는 이벤트를 통해 로딩 상태 해제
      setLoading(false);
      clearTimeout(timeoutId);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

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
