import { supabase } from './supabase';

export interface Profile {
  id: string;
  full_name: string;
  role: 'system_admin' | 'super_admin' | 'admin' | 'sub_admin' | 'member';
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
  resident_number?: string;
  address?: string;
  family_data?: { name: string; birth: string }[];
  is_division_head?: boolean;
  is_team_leader?: boolean;
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

export const getLeaves = async (companyId?: string): Promise<Leave[]> => {
  let query = supabase
    .from('leaves')
    .select('*, profiles(full_name)');
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

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
  residentNumber?: string;
  address?: string;
  familyData?: { name: string; birth: string }[];
  teamId?: string;
}) => {
  // Edge Function 호출
  const { data, error } = await supabase.functions.invoke('register-staff', {
    body: staffData,
  });

  if (error) {
    console.error('Edge Function Error:', error);
    throw new Error(`${error.message || 'Unknown error occurred during registration'}`);
  }
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
  // 1. 기업 목록 가져오기
  const { data: companies, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });

  if (companyError) throw companyError;
  if (!companies) return [];

  // 2. 각 기업별 사용자 수 가져오기 (조인 방식 대신 명시적 쿼리로 안정성 확보)
  const { data: profileStats, error: profilesError } = await supabase
    .from('profiles')
    .select('company_id');

  if (profilesError) {
    console.error('Failed to fetch profile stats:', profilesError);
    return companies.map(c => ({ ...c, user_count: 0 }));
  }

  // 기업별 카운트 계산
  const countMap = (profileStats || []).reduce((acc: any, curr: any) => {
    if (curr.company_id) {
      acc[curr.company_id] = (acc[curr.company_id] || 0) + 1;
    }
    return acc;
  }, {});

  return companies.map(company => ({
    ...company,
    user_count: countMap[company.id] || 0
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

export const fetchCompanyUsers = async (companyId?: string): Promise<Profile[]> => {
  let query = supabase
    .from('profiles')
    .select('*');
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.order('full_name');

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

export const adminDeleteCompany = async (companyId: string, adminPassword?: string) => {
  // 1. 보안을 위해 클라이언트 사이드에서 직접 삭제 시도
  // 주의: 이 작업을 위해선 SQL에서 'System Admin can delete companies' RLS 정책이 설정되어 있어야 합니다.
  const { data, error } = await supabase
    .from('companies')
    .delete()
    .eq('id', companyId)
    .select();

  if (error) {
    console.error('Database delete failed:', error);
    throw new Error('데이터베이스 삭제에 실패했습니다: ' + error.message);
  }

  return data;
};

export const getDivisions = async (companyId?: string): Promise<Division[]> => {
  let query = supabase
    .from('divisions')
    .select('*');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.order('name');
  if (error) throw error;
  return data || [];
};

export const getTeams = async (companyId?: string): Promise<Team[]> => {
  let query = supabase
    .from('teams')
    .select('*');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.order('name');
  if (error) throw error;
  return data || [];
};

export const createDivision = async (name: string, companyId: string | null): Promise<Division> => {
  if (!companyId) throw new Error('조직을 생성할 회사 정보가 없습니다. 관리자에게 문의해 주세요.');
  const { data, error } = await supabase
    .from('divisions')
    .insert([{ name, company_id: companyId }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteDivision = async (id: string) => {
  const { error } = await supabase
    .from('divisions')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const createTeam = async (name: string, divisionId: string, companyId: string | null): Promise<Team> => {
  if (!companyId) throw new Error('팀을 생성할 회사 정보가 없습니다. 관리자에게 문의해 주세요.');
  const { data, error } = await supabase
    .from('teams')
    .insert([{ name, division_id: divisionId, company_id: companyId }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTeam = async (id: string) => {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const setLeader = async (userId: string, type: 'division' | 'team', status: boolean) => {
  const updates: Partial<Profile> = type === 'division' 
    ? { is_division_head: status } 
    : { is_team_leader: status };
  
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
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

export const updateRequestFields = async (
  type: 'expense' | 'leave',
  id: string,
  updates: any
) => {
  const table = type === 'expense' ? 'expense_requests' : 'leave_requests';
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

// --- Announcements API ---

export interface Announcement {
  id: string;
  created_at: string;
  title: string;
  content: string;
  user_id: string;
  author_name: string;
  company_id: string;
}

export const getAnnouncements = async (companyId: string): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50); // Get recent announcements

  if (error && error.code !== '42P01') { // Ignore relation does not exist before SQL is run
    console.error('getAnnouncements error:', error);
  }
  return data || [];
};

export const createAnnouncement = async (announcement: Partial<Announcement>): Promise<Announcement> => {
  const { data, error } = await supabase
    .from('announcements')
    .insert([announcement])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateAnnouncement = async (id: string, updates: Partial<Announcement>) => {
  const { data, error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteAnnouncement = async (id: string) => {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) throw error;
};
