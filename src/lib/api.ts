import { supabase } from './supabase';

export interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'member';
  company_id: string;
  department?: string;
  position?: string;
  must_change_password?: boolean;
}

export interface Expense {
  id: string;
  created_at: string;
  amount: number;
  category: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
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
  status: 'pending' | 'approved' | 'rejected';
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

export const getExpenses = async (companyId: string): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, profiles(full_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createExpense = async (expenseData: Partial<Expense>): Promise<Expense> => {
  const { data, error } = await supabase
    .from('expenses')
    .insert([expenseData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

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

export const updateMemberRole = async (userId: string, newRole: string): Promise<Profile> => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)
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

export const fetchSeveranceEstimate = async (userId: string) => {
  const { data, error } = await supabase
    .rpc('calculate_severance', { p_user_id: userId });

  if (error) throw error;
  return data;
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

export const getProfile = async (userId: string): Promise<Profile> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
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
      .eq('id', user.id);
  }
};
