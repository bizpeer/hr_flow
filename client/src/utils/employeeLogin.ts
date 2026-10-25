export interface EmployeeLoginCompany {
  nameEn?: string | null;
  domain?: string | null;
}

const validDomain = (value: string) => value.length <= 253 &&
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);

export function getEmployeeLoginDomain(company?: EmployeeLoginCompany | null): string {
  const companyName = company?.nameEn?.trim().toLowerCase().replace(/\s+/g, '') || '';
  if (companyName) {
    const generated = `${companyName}.com`;
    if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(companyName) && validDomain(generated)) return generated;
    throw new Error('회사 영문명은 영문·숫자·하이픈으로 확인하거나 전체 로그인 주소를 입력해 주세요.');
  }
  const fallback = company?.domain?.trim().toLowerCase() || '';
  if (validDomain(fallback)) return fallback;
  throw new Error('회사 영문명 또는 로그인 도메인을 확인하거나 전체 로그인 주소를 입력해 주세요.');
}

export function getEmployeeLoginEmail(input: string, company?: EmployeeLoginCompany | null): string {
  const login = input.trim().toLowerCase();
  const email = login.includes('@') ? login : `${login}@${getEmployeeLoginDomain(company)}`;
  const pieces = email.split('@');
  if (email.length > 254 || pieces.length !== 2 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(pieces[0]) ||
      pieces[0].length > 64 || pieces[0].startsWith('.') || pieces[0].endsWith('.') || pieces[0].includes('..') || !validDomain(pieces[1])) {
    throw new Error('유효한 직원 아이디 또는 전체 로그인 주소를 입력해 주세요.');
  }
  return email;
}
