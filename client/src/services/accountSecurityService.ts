import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { CompanyData, Role, UserData } from '../store/authStore';

export interface AccountSession { profile: UserData | null; company: CompanyData | null; businessAllowed: boolean }
export interface DirectoryUser { uid: string; name: string; role: Role; teamId?: string; divisionId?: string; annualLeaveTotal?: number; usedLeave?: number }
export interface CompanySignup { nameKo: string; nameEn: string; name: string }
const callable = httpsCallable<Record<string, unknown>, unknown>(functions, 'accountSecurity');
let changingPassword = false;
let signInAfter = 0;
export const passwordChangeWait = () => changingPassword ? Infinity : Math.max(0, signInAfter - Date.now());
async function call<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  return (await callable({ action, ...data })).data as T;
}
export const accountSecurity = {
  session: () => call<AccountSession>('session'),
  createCompany: (company: CompanySignup) => call<{ companyId: string }>('createCompany', { ...company }),
  changePassword: async (newPassword: string) => {
    changingPassword = true;
    try {
      const result = await call<{ success: true; signInAgain: true }>('changePassword', { newPassword });
      signInAfter = Date.now() + 1100;
      return result;
    } finally { changingPassword = false; }
  },
  directory: () => call<{ users: DirectoryUser[] }>('directory'),
};

// Only non-secret setup fields survive the verification-email round trip.
const draftKey = (email: string) => `hr-flow:company-setup:${email.trim().toLowerCase()}`;
export function saveCompanySignup(email: string, company: CompanySignup): void {
  try { sessionStorage.setItem(draftKey(email), JSON.stringify(company)); } catch { /* Setup can still be completed manually. */ }
}
export function readCompanySignup(email: string): CompanySignup {
  const empty = { nameKo: '', nameEn: '', name: '' };
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(draftKey(email)) || 'null');
    if (typeof value === 'object' && value !== null && 'nameKo' in value && 'nameEn' in value && 'name' in value &&
      typeof value.nameKo === 'string' && typeof value.nameEn === 'string' && typeof value.name === 'string') {
      return { nameKo: value.nameKo.slice(0, 120), nameEn: value.nameEn.slice(0, 120), name: value.name.slice(0, 100) };
    }
  } catch { /* Invalid or disabled storage is treated as an empty form. */ }
  return empty;
}
export function clearCompanySignup(email: string): void {
  try { sessionStorage.removeItem(draftKey(email)); } catch { /* No persistent credentials are stored. */ }
}
