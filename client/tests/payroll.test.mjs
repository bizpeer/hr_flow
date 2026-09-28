import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIncomeTax, calculateNetPay, getDeductionCounts } from '../src/utils/payroll.ts';

test('official 2026 table distinguishes dependents in the reported 2.3 million won bracket', () => {
  assert.equal(calculateIncomeTax(2_300_000, 1, 0).incomeTax, 29_160);
  assert.equal(calculateIncomeTax(2_300_000, 4, 0).incomeTax, 9_180);
  assert.equal(calculateIncomeTax(2_300_000, 4, 2).incomeTax, 0);
});

test('employees with the same gross pay receive different net pay when deductions differ', () => {
  const salary = { annualSalary: 30_000_000, nonTaxable: 200_000 };
  const single = calculateNetPay({ ...salary, dependents: 1, childrenUnder20: 0 });
  const family = calculateNetPay({ ...salary, dependents: 4, childrenUnder20: 2 });
  assert.ok(single && family);
  assert.equal(single.incomeTax, 29_160);
  assert.equal(family.incomeTax, 0);
  assert.equal(family.netPay - single.netPay, 32_076);
});

test('children are counted among dependents, including for existing inconsistent records', () => {
  assert.deepEqual(getDeductionCounts({ dependents: 1, childrenUnder20: 3 }), { dependents: 4, children: 3 });
});

test('an absent or malformed uploaded table uses the complete official table', () => {
  const malformed = { brackets: [{ min: 2300, max: 2310, taxes: [999] }] };
  assert.deepEqual(calculateIncomeTax(2_300_000, 1, 0, malformed), {
    incomeTax: 29_160,
    tableSource: 'official-2026'
  });
});

test('a valid uploaded table still overrides the bundled bracket', () => {
  const uploaded = { brackets: [{ min: 2300, max: 2310, taxes: Array(11).fill(5_000) }] };
  assert.deepEqual(calculateIncomeTax(2_300_000, 1, 0, uploaded), {
    incomeTax: 5_000,
    tableSource: 'uploaded'
  });
});

test('the legal formula handles incomes above the tabulated ten million won limit', () => {
  assert.equal(calculateIncomeTax(10_000_000, 1, 0).incomeTax, 1_507_400);
  assert.equal(calculateIncomeTax(12_000_000, 1, 0).incomeTax, 2_218_400);
  assert.equal(calculateIncomeTax(10_000_000, 12, 0).incomeTax, 930_840);
});
