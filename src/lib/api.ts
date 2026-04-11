import { supabase } from './supabase';

export interface Profile {
  id: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'sub_admin' | 'member';
  company_id: string;
  department?: string;
  position?: string;
  must_change_password?: boolean;
  annual_salary?: number;
  salary_type?: 'ANNUAL' | 'MONTHLY';
  is_severance_included?: boolean;
  dependents?: number;
  children_under_20?: number;
  non_taxable?: number;
  team_id?: string;
  companies?: {
    name: string;
  };
}

export interface Division {
  id: string;
  name: string;
  company_id: string;
}

export interface Team {
  id: string;
  name: string;
  division_id: string;
  company_id: string;
}

export interface Expense {
  id: string;
  created_at: string;
  amount: number;
  category: string;
  description: string;
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED';
  user_id: string;
  company_id: string;
  profiles?: {
    full_name: string;
  };
}

export interface Leave {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  type: string;
  reason: string;
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED';
  user_id: string;
  company_id: string;
  profiles?: {
    full_name: string;
  };
}

export interface PayrollRecord {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  base_salary: number;
  bonus: number;
  deductions: number;
  net_pay: number;
  status: string;
}

export const getLeaves = async (companyId: string): Promise<Leave[]> => {
  const { data, error } = await supabase
    .from('leaves')
    .select('*, profiles(full_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createLeave = async (leaveData: Partial<Leave>): Promise<Leave> => {
  const { data, error } = await supabase
    .from('leaves')
    .insert([leaveData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getPayrollHistory = async (userId: string): Promise<PayrollRecord[]> => {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('*')
    .eq('user_id', userId)
    .order('period_end', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const updateMemberProfile = async (userId: string, updates: Partial<Profile>): Promise<Profile> => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const registerStaff = async (staffData: {
  email: string;
  fullName: string;
  department: string;
  position: string;
  tempPassword: string;
  companyId: string;
  role: string;
}) => {
  // Edge Function 호출
  const { data, error } = await supabase.functions.invoke('register-staff', {
    body: staffData,
  });

  if (error) throw error;
  return data;
};

export const changePassword = async (newPassword: string) => {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  // 비밀번호 변경 성공 후 플래그 업데이트
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('profiles')
      .update({ must_change_password: false })
  }
};

export interface Company {
  id: string;
  name: string;
  registration_number: string;
  status: 'active' | 'suspended';
  plan: 'free' | 'paid';
  created_at: string;
  user_count?: number;
}

export const getAllCompaniesWithStats = async (): Promise<Company[]> => {
  const { data, error } = await supabase
    .from('companies')
    .select(`
      *,
      profiles:profiles(count)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  return (data || []).map((company: any) => ({
    ...company,
    user_count: company.profiles?.[0]?.count || 0
  }));
};

export const updateCompanySettings = async (companyId: string, updates: Partial<Company>) => {
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', companyId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const fetchCompanyUsers = async (companyId: string): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', companyId)
    .order('full_name');

  if (error) throw error;
  return data || [];
};

export const adminResetPassword = async (userId: string, tempPassword: string) => {
  // 실제 비밀번호 초기화는 관리자 권한이 있는 Edge Function을 통해 수행
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action: 'reset-password', userId, tempPassword },
  });

  if (error) throw error;
  return data;
};

export const getDivisions = async (companyId: string): Promise<Division[]> => {
  const { data, error } = await supabase
    .from('divisions')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw error;
  return data || [];
};

export const getTeams = async (companyId: string): Promise<Team[]> => {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw error;
  return data || [];
};

export const updateRequestStatus = async (
  type: 'expense' | 'leave',
  id: string,
  status: 'PENDING' | 'SUB_APPROVED' | 'APPROVED' | 'REJECTED'
) => {
  const table = type === 'expense' ? 'expense_requests' : 'leave_requests';
  const { data, error } = await supabase
    .from(table)
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

