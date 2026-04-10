/**
 * Salary Calculation Utilities
 * Based on 2025/2026 South Korea Tax Law and Insurance Rates
 */

export const MEAL_ALLOWANCE_DEFAULT = 200000;

export interface SalaryCalculationResult {
  monthlyGross: number;
  pension: number;
  health: number;
  longTerm: number;
  employment: number;
  totalInsurance: number;
  incomeTax: number;
  localTax: number;
  totalDeductions: number;
  netPay: number;
  nonTaxable: number;
  dependents: number;
  children: number;
  isSeveranceIncluded: boolean;
  salaryBasis: 'ANNUAL' | 'MONTHLY';
}

export const calculateNetPay = (params: {
  amount: number;
  type: 'ANNUAL' | 'MONTHLY';
  isSeveranceIncluded: boolean;
  dependents: number;
  childrenUnder20: number;
  nonTaxable?: number;
}): SalaryCalculationResult => {
  const { amount, type, isSeveranceIncluded, dependents, childrenUnder20 } = params;
  const nonTaxable = params.nonTaxable ?? MEAL_ALLOWANCE_DEFAULT;

  let monthlyGross = 0;
  if (type === 'ANNUAL') {
    monthlyGross = isSeveranceIncluded ? Math.floor(amount / 13) : Math.floor(amount / 12);
  } else {
    monthlyGross = amount;
  }

  const taxableIncome = Math.max(0, monthlyGross - nonTaxable);

  // 1. 국민연금 (4.75%, 상한액 265,500원, 하한액 17,550원)
  let pension = Math.floor(taxableIncome * 0.0475);
  if (pension > 265500) pension = 265500;
  if (taxableIncome > 0 && pension < 17550) pension = 17550;

  // 2. 건강보험 (3.595%)
  const health = Math.floor(taxableIncome * 0.03595);

  // 3. 장기요양보험 (건강보험의 13.14%)
  const longTerm = Math.floor(health * 0.1314);

  // 4. 고용보험 (0.9%)
  const employment = Math.floor(taxableIncome * 0.009);

  const totalInsurance = pension + health + longTerm + employment;

  // 5. 소득세 (간이세액표 근사치)
  let taxBase = taxableIncome - totalInsurance;
  const dependentDeduction = (dependents - 1) * 150000;
  taxBase = Math.max(0, taxBase - dependentDeduction);

  let incomeTax = 0;
  if (taxBase <= 1200000) {
    incomeTax = 0;
  } else if (taxBase <= 4600000) {
    incomeTax = Math.floor(taxBase * 0.06);
  } else if (taxBase <= 8800000) {
    incomeTax = Math.floor(taxBase * 0.15 - 108000);
  } else {
    incomeTax = Math.floor(taxBase * 0.24 - 522000);
  }

  if (childrenUnder20 > 0) {
    const childCredit = childrenUnder20 * 20000; 
    incomeTax = Math.max(0, incomeTax - childCredit);
  }

  // 6. 지방소득세 (소득세의 10%)
  const localTax = Math.floor(incomeTax * 0.1);

  const totalDeductions = totalInsurance + incomeTax + localTax;
  const netPay = monthlyGross - totalDeductions;

  return {
    monthlyGross,
    pension,
    health,
    longTerm,
    employment,
    totalInsurance,
    incomeTax,
    localTax,
    totalDeductions,
    netPay,
    nonTaxable,
    dependents,
    children: childrenUnder20,
    isSeveranceIncluded,
    salaryBasis: type
  };
};
