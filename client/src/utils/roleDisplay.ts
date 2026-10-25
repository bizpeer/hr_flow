export interface RoleDisplayProfile {
  uid: string;
  role: string;
  companyId: string;
}

export interface RoleDisplayCompany {
  id: string;
  adminUid: string;
}

export type DisplayedRole = 'SYSTEM_ADMIN' | 'SUPER_ADMIN' | 'ADMIN' | 'SUB_ADMIN' | 'MEMBER' | '권한 확인 필요';

/** Presentation only: never use these names to authorize requests or write roles. */
export function getRoleDisplayName(profile: RoleDisplayProfile, company?: RoleDisplayCompany | null): DisplayedRole {
  if (profile.role === 'SUPER_ADMIN') {
    return profile.companyId === 'PLATFORM' ? 'SYSTEM_ADMIN' : '권한 확인 필요';
  }
  if (profile.role === 'ADMIN') {
    return profile.companyId !== 'PLATFORM' && company?.id === profile.companyId &&
      !!profile.uid && company.adminUid === profile.uid ? 'SUPER_ADMIN' : 'ADMIN';
  }
  return profile.role === 'SUB_ADMIN' || profile.role === 'MEMBER' ? profile.role : '권한 확인 필요';
}
