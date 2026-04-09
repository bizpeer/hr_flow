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
  if (!user) throw new Error('유저를 생성할 수 없습니다.');

  // 2. Create Company
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

  if (companyError) throw companyError;

  // 3. Create Profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([
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
