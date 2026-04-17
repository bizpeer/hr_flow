import { supabase } from './supabase';

export type ApprovalStatus = 'draft' | 'submitted' | 'approved_l1' | 'final_approved' | 'rejected';
export type ApprovalType = 'expense' | 'leave' | 'overtime';

export interface Profile {
  id: string;
  full_name: string;
  email?: string;
  role: 'system_admin' | 'super_admin' | 'admin' | 'sub_admin' | 'member';
  company_id: string;
  department?: string;
  position?: string;
  must_change_password?: boolean;
  division_id?: string;
  team_id?: string;
  hire_date?: string;
  status?: 'active' | 'suspended' | 'resigned';
  used_leave?: number; // 복구
  annual_salary?: number; // 복구
  salary_type?: 'ANNUAL' | 'MONTHLY'; // 복구
  family_data?: { name: string; birth: string }[]; // 복구
  companies?: {
    name: string;
  };
}

export interface Division {
  id: string;
  name: string;
  company_id: string;
  head_user_id?: string; // 리더 필드 추가
}

export interface Team {
  id: string;
  name: string;
  division_id: string;
  company_id: string;
  leader_user_id?: string; // 리더 필드 추가
}

export interface Approval {
  id: string;
  company_id: string;
  type: ApprovalType;
  requester_id: string;
  status: ApprovalStatus;
  approver_l1_id?: string;
  approver_final_id?: string;
  title: string;
  details?: any; // 통합 결재의 상세 데이터를 담는 필드 추가
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string;
  };
}

export interface ExpenseRequest {
  id?: string;
  user_id?: string;
  company_id?: string;
  approval_id?: string;
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  details?: any;
  attachment_url?: string;
  status?: string;
  created_at?: string;
  rejection_reason?: string;
  profiles?: {
    full_name: string;
  };
}

export interface LeaveRequest {
  id?: string;
  user_id?: string;
  company_id?: string;
  approval_id?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  details?: any;
  status?: string;
  created_at?: string;
  rejection_reason?: string;
  profiles?: {
    full_name: string;
    team_id?: string;
    hire_date?: string;
    additional_annual_leave?: number;
    used_leave?: number;
  };
}

export interface OvertimeRequest {
  id?: string;
  user_id?: string;
  company_id?: string;
  approval_id?: string;
  work_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  reason: string;
  details?: any;
  status?: string;
  created_at?: string;
  rejection_reason?: string;
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
    .from('leave_requests')
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
    .from('leave_requests')
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
  hireDate?: string;
}) => {
  // Edge Function 호출
  const { data, error } = await supabase.functions.invoke('register-staff', {
    body: staffData,
  });

  if (error) {
    console.error('Edge Function Error Full Details:', error);
    let displayMessage = '등록 실패: ';
    
    // FunctionsHttpError 등 context가 있는 경우 상세 메시지 추출 시도
    if (error instanceof Error && 'context' in error) {
      try {
        const context = (error as any).context;
        const responseData = await context.clone().json();
        displayMessage += responseData.error || responseData.message || error.message;
      } catch (e) {
        displayMessage += error.message;
      }
    } else {
      displayMessage += error.message;
    }
    
    throw new Error(displayMessage);
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

export const adminUpdateRole = async (userId: string, newRole: string) => {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action: 'update-role', userId, newRole },
  });

  if (error) throw error;
  return data;
};

export const adminResetPassword = async (userId: string, tempPassword: string) => {
  // 실제 비밀번호 초기화는 관리자 권한이 있는 Edge Function을 통해 수행
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action: 'reset-password', userId, tempPassword },
  });

  if (error) throw error;
  return data;
};

export const adminDeleteCompany = async (companyId: string) => {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action: 'delete-company', companyId },
  });

  if (error) throw error;
  return data;
};

export const adminDeleteUser = async (userId: string) => {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action: 'delete-user', userId },
  });

  if (error) throw error;
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

export const updateDivision = async (id: string, name: string) => {
  const { data, error } = await supabase
    .from('divisions')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
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

export const updateTeam = async (id: string, name: string) => {
  const { data, error } = await supabase
    .from('teams')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const setLeader = async (id: string, type: 'division' | 'team', leaderId: string | null) => {
  const table = type === 'division' ? 'divisions' : 'teams';
  const column = type === 'division' ? 'head_user_id' : 'leader_user_id';
  
  const { data, error } = await supabase
    .from(table)
    .update({ [column]: leaderId })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const submitApproval = async (
  companyId: string,
  type: ApprovalType,
  requesterId: string,
  title: string,
  details: ExpenseRequest | LeaveRequest | OvertimeRequest
) => {
  // 1. 공통 결재 테이블 저장
  const { data: approval, error: approvalError } = await supabase
    .from('approvals')
    .insert([{
      company_id: companyId,
      type,
      requester_id: requesterId,
      status: 'submitted',
      title,
      // 메타데이터로 상세 정보 일부 저장 (필요시)
      details: type === 'expense' ? { amount: (details as ExpenseRequest).amount } : 
               type === 'leave' ? { start_date: (details as LeaveRequest).start_date, end_date: (details as LeaveRequest).end_date } :
               { work_date: (details as OvertimeRequest).work_date }
    }])
    .select()
    .single();

  if (approvalError) throw approvalError;

  // 2. 타입별 상세 테이블 저장
  const detailTable = type === 'expense' ? 'expense_requests' : type === 'leave' ? 'leave_requests' : 'overtime_requests';
  const { error: detailError } = await supabase
    .from(detailTable)
    .insert([{ ...details, approval_id: approval.id }]);

  if (detailError) {
    // 상세 저장 실패 시 결재 테이블 롤백(삭제)
    await supabase.from('approvals').delete().eq('id', approval.id);
    throw detailError;
  }

  return approval;
};

export const updateApprovalStatus = async (
  approvalId: string,
  status: ApprovalStatus,
  approverId: string,
  level: 'l1' | 'final'
) => {
  const updates: any = { status, updated_at: new Date().toISOString() };
  if (level === 'l1') updates.approver_l1_id = approverId;
  else if (level === 'final') updates.approver_final_id = approverId;

  const { data, error } = await supabase
    .from('approvals')
    .update(updates)
    .eq('id', approvalId)
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

// --- Labor Law Utilities ---

/**
 * 한국 근로기준법에 따른 연차 산출
 * - 1년 미만: 1개월 개근 시 1일 (최대 11일)
 * - 1년 이상: 15일 기본 + 2년마다 1일 가산 (최대 25일)
 */
export const calculateLeaveEntitlement = (hireDateStr: string | null, additionalLeave: number = 0): number => {
  if (!hireDateStr) return 15; // 기본값

  const hireDate = new Date(hireDateStr);
  const now = new Date();
  
  // 총 근속 개월 수 계산
  const diffYears = now.getFullYear() - hireDate.getFullYear();
  const diffMonths = now.getMonth() - hireDate.getMonth();
  const totalMonths = diffYears * 12 + diffMonths;
  const yearsOfService = Math.floor(totalMonths / 12);

  if (yearsOfService < 1) {
    // 1년 미만: 만근 시 1일씩 발생 (최대 11일)
    return Math.min(Math.max(0, totalMonths), 11) + (additionalLeave || 0);
  } else {
    // 1년 이상: 15일 + (근속년수 - 1) / 2 가산
    const extraLeave = Math.floor((yearsOfService - 1) / 2);
    return Math.min(15 + extraLeave, 25) + (additionalLeave || 0);
  }
};

/**
 * 초과근무 시간 계산 (자정 경과 지원)
 */
export const calculateOvertimeDuration = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  let startTotalMinutes = startH * 60 + startM;
  let endTotalMinutes = endH * 60 + endM;

  if (endTotalMinutes <= startTotalMinutes) {
    // 종료 시간이 시작 시간보다 같거나 작으면 자정을 넘긴 것으로 간주
    endTotalMinutes += 24 * 60;
  }

  const diffMinutes = endTotalMinutes - startTotalMinutes;
  return Math.round((diffMinutes / 60) * 10) / 10; // 소수점 첫째자리까지
};

// --- Overtime API ---

export const getOvertimes = async (companyId?: string): Promise<Overtime[]> => {
  let query = supabase
    .from('overtime_requests')
    .select('*, profiles(full_name)');
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error && error.code !== '42P01') throw error;
  return data || [];
};

export const createOvertime = async (overtimeData: Partial<Overtime>): Promise<Overtime> => {
  const { data, error } = await supabase
    .from('overtime_requests')
    .insert([overtimeData])
    .select()
    .single();

  if (error) throw error;
  return data;
};
