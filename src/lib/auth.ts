import { supabase } from './supabase';

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  companyName: string;
  registrationNumber: string;
}

/**
 * Enterprise Signup
 * 1. Creates a user in Supabase Auth
 * 2. Creates a company record
 * 3. Creates a profile record linked to the company as 'super_admin'
 */
export const enterpriseSignUp = async ({ 
  email, 
  password, 
  fullName, 
  phone, 
  companyName, 
  registrationNumber 
}: SignUpParams) => {
  // 1. Sign up user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) throw authError;

  const user = authData.user;
  if (!user) throw new Error('계정 생성은 완료되었으나 유저 정보를 확인할 수 없습니다. 이메일 인증을 확인하거나 잠시 후 다시 시도해 주세요.');

  // 2. Create Company (Skip if already exists for this user - though owner_id should be unique or handled)
  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .insert([
      {
        name: companyName,
        registration_number: registrationNumber,
        owner_id: user.id,
      },
    ])
    .select()
    .single();

  if (companyError) {
    console.error('Company creation error:', companyError);
    // Don't throw yet, check if profile exists
  }

  // 3. Create Profile
  if (user && companyData) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert([
        {
          id: user.id,
          company_id: companyData.id,
          email: email,
          full_name: fullName,
          phone_number: phone,
          role: 'super_admin',
        },
      ]);

    if (profileError) throw profileError;
  } else if (!companyData) {
    throw new Error('회사 정보를 생성하지 못했습니다. 관리자에게 문의해 주세요.');
  }

  return { user, company: companyData };
};

export const getSystemStats = async () => {
  const { count: companyCount, error: coError } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true });

  const { count: userCount, error: userError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (coError || userError) throw (coError || userError);

  return {
    totalCompanies: companyCount || 0,
    totalUsers: userCount || 0,
  };
};
