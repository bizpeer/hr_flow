import officialTaxTable from '../data/withholdingTaxTable2026.json' with { type: 'json' };

export const MEAL_ALLOWANCE_DEFAULT = 200000;

type TaxBracket = { min: number; max: number | null; taxes: number[] };
export type TaxTable = { brackets?: TaxBracket[] } | null;

export type PayrollEmployee = {
  currentVal?: number;
  annualSalary?: number;
  salaryType?: 'ANNUAL' | 'MONTHLY';
  isSeveranceIncluded?: boolean;
  dependents?: number;
  childrenUnder20?: number;
  nonTaxable?: number;
};

const wholeCount = (value: number | undefined, minimum: number) =>
  Number.isFinite(value) ? Math.max(minimum, Math.trunc(value!)) : minimum;

export const getDeductionCounts = (employee: PayrollEmployee) => {
  // The stored childrenUnder20 field represents children aged 8–20 who qualify
  // for the withholding-table child credit. Each child also counts as a dependent.
  const children = wholeCount(employee.childrenUnder20, 0);
  const dependents = Math.max(wholeCount(employee.dependents, 1), children + 1);
  return { dependents, children };
};

const taxForDependents = (taxes: number[], dependents: number) => {
  if (dependents <= 11) return taxes[dependents - 1];
  // Income Tax Act Enforcement Decree, Appendix 2, note 4.
  return Math.max(0, taxes[10] - (taxes[9] - taxes[10]) * (dependents - 11));
};

const taxAboveTenMillion = (taxableIncome: number, dependents: number) => {
  const base = taxForDependents(officialTaxTable.taxAt10Million, dependents);
  if (taxableIncome === 10_000_000) return base;
  if (taxableIncome <= 14_000_000) return base + 25_000 + (taxableIncome - 10_000_000) * 0.98 * 0.35;
  if (taxableIncome <= 28_000_000) return base + 1_397_000 + (taxableIncome - 14_000_000) * 0.98 * 0.38;
  if (taxableIncome <= 30_000_000) return base + 6_610_600 + (taxableIncome - 28_000_000) * 0.98 * 0.4;
  if (taxableIncome <= 45_000_000) return base + 7_394_600 + (taxableIncome - 30_000_000) * 0.4;
  if (taxableIncome <= 87_000_000) return base + 13_394_600 + (taxableIncome - 45_000_000) * 0.42;
  return base + 31_034_600 + (taxableIncome - 87_000_000) * 0.45;
};

const findBracket = (brackets: TaxBracket[] | undefined, incomeInThousands: number) =>
  brackets?.find((bracket) =>
    Number.isFinite(bracket.min) && Number.isFinite(bracket.max) &&
    incomeInThousands >= bracket.min && incomeInThousands < bracket.max! &&
    bracket.taxes?.length === 11 && bracket.taxes.every((tax) => Number.isFinite(tax) && tax >= 0)
  );

export const calculateIncomeTax = (taxableIncome: number, dependents: number, children: number, taxTable?: TaxTable) => {
  if (taxableIncome < 770_000) return { incomeTax: 0, tableSource: 'official-2026' as const };

  let baseTax: number;
  let tableSource: 'official-2026' | 'uploaded' = 'official-2026';
  if (taxableIncome >= 10_000_000) {
    baseTax = taxAboveTenMillion(taxableIncome, dependents);
  } else {
    const incomeInThousands = taxableIncome / 1000;
    const uploaded = findBracket(taxTable?.brackets, incomeInThousands);
    const bracket = uploaded ?? findBracket(officialTaxTable.brackets, incomeInThousands);
    if (!bracket) throw new Error('공식 근로소득 간이세액표의 급여 구간을 찾을 수 없습니다.');
    baseTax = taxForDependents(bracket.taxes, dependents);
    if (uploaded) tableSource = 'uploaded';
  }

  // Appendix 2, note 3: child credit applies only to eligible children aged 8–20.
  const childCredit = children === 0 ? 0 : children === 1 ? 20_830 : 45_830 + (children - 2) * 33_330;
  return { incomeTax: Math.max(0, Math.floor(baseTax - childCredit)), tableSource };
};

export const calculateNetPay = (employee: PayrollEmployee, taxTable?: TaxTable) => {
  const salary = employee.currentVal ?? employee.annualSalary ?? 0;
  if (!Number.isFinite(salary) || salary <= 0) return null;

  const isSeveranceIncluded = employee.isSeveranceIncluded ?? false;
  const salaryBasis = employee.salaryType ?? 'ANNUAL';
  const { dependents, children } = getDeductionCounts(employee);
  const nonTaxable = Math.max(0, employee.nonTaxable ?? MEAL_ALLOWANCE_DEFAULT);
  const monthlyGross = Math.floor(salary / (isSeveranceIncluded ? 13 : 12));
  const taxableIncome = Math.max(0, monthlyGross - nonTaxable);

  let pension = Math.floor(taxableIncome * 0.0475 / 10) * 10;
  pension = Math.min(302_570, pension);
  if (taxableIncome > 0) pension = Math.max(19_000, pension);
  const health = Math.floor(taxableIncome * 0.03595 / 10) * 10;
  const longTerm = Math.floor(health * 0.1314 / 10) * 10;
  const employment = Math.floor(taxableIncome * 0.009 / 10) * 10;
  const totalInsurance = pension + health + longTerm + employment;

  const { incomeTax, tableSource } = calculateIncomeTax(taxableIncome, dependents, children, taxTable);
  const localTax = Math.floor(incomeTax * 0.1);
  const totalDeductions = totalInsurance + incomeTax + localTax;

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
    netPay: monthlyGross - totalDeductions,
    nonTaxable,
    dependents,
    children,
    isSeveranceIncluded,
    salaryBasis,
    metadata: { tableSource }
  };
};
