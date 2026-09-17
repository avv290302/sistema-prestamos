import { buildLoanPlan } from './loan-plan';

describe('14 weekly installments', () => {
  it('repays 10,000 as fourteen weekly payments of 1,000', () => {
    const plan = buildLoanPlan(1_000_000, '2026-09-22');
    expect(plan.interestCents).toBe(400_000);
    expect(plan.totalCents).toBe(1_400_000);
    expect(plan.installments).toHaveLength(14);
    expect(plan.installments.every(i => i.amountCents === 100_000)).toBe(true);
    expect(plan.installments[13].dueDate).toBe('2026-12-22');
  });
  it('scales to other amounts', () => {
    expect(buildLoanPlan(500_000, '2026-09-22').weeklyCents).toBe(50_000);
  });
  it('keeps cent rounding balanced in the last installment', () => {
    for (const amount of [100, 101, 105, 109, 99999, 100000001 - 1]) {
      const plan = buildLoanPlan(amount, '2026-09-22');
      expect(plan.installments.reduce((sum, i) => sum + i.amountCents, 0)).toBe(plan.totalCents);
      expect(plan.installments.every(i => Number.isInteger(i.amountCents) && i.amountCents > 0)).toBe(true);
    }
  });
  it('handles leap years and calendar boundaries', () => {
    expect(buildLoanPlan(10000, '2028-02-29').installments[1].dueDate).toBe('2028-03-07');
    expect(buildLoanPlan(10000, '2026-12-29').installments[1].dueDate).toBe('2027-01-05');
  });
  it.each(['2026-02-29', '2026-04-31', 'invalid', '2026-9-1', '1999-12-31'])('rejects invalid date %s', date => {
    expect(() => buildLoanPlan(10000, date)).toThrow();
  });
  it.each([0, -100, 100.5, NaN, Infinity, 100000001])('rejects invalid amount %s', amount => {
    expect(() => buildLoanPlan(amount, '2026-09-22')).toThrow();
  });
});

describe('Personalized loan terms', () => {
  it('supports different rates, counts and zero interest', () => {
    const plan = buildLoanPlan(1_000_000, '2026-09-22', { interestBps: 2000, installmentCount: 12 });
    expect(plan.totalCents).toBe(1_200_000);
    expect(plan.installments.every(i => i.amountCents === 100_000)).toBe(true);
    expect(buildLoanPlan(1_000_000, '2026-09-22', { interestBps: 0, installmentCount: 20 }).weeklyCents).toBe(50_000);
    expect(buildLoanPlan(10000, '2026-09-22', { interestBps: 1234 }).interestCents).toBe(1234);
  });
  it('supports one payment, long schedules and exact cent conservation', () => {
    expect(buildLoanPlan(100, '2026-09-22', { installmentCount: 1 }).installments[0].amountCents).toBe(140);
    for (const principal of [100, 101, 9999, 100_000_000]) for (const interestBps of [0, 1, 1234, 100_000]) for (const count of [1, 14, 60, 100]) {
      const plan = buildLoanPlan(principal, '2026-09-22', { interestBps, installmentCount: count, frequency: 'DAILY' });
      expect(plan.installments.reduce((s,i) => s+i.amountCents,0)).toBe(plan.totalCents);
      expect(plan.installments.every(i => Number.isSafeInteger(i.amountCents) && i.amountCents > 0)).toBe(true);
    }
    expect(buildLoanPlan(10000, '2026-09-22', { installmentCount: 1000, frequency: 'DAILY' }).installments).toHaveLength(1000);
  });
  it('uses actual days and month anniversaries without end-of-month drift', () => {
    expect(buildLoanPlan(10000, '2026-12-31', { frequency: 'DAILY' }).installments[1].dueDate).toBe('2027-01-01');
    expect(buildLoanPlan(10000, '2026-12-31', { frequency: 'FORTNIGHTLY' }).installments[1].dueDate).toBe('2027-01-15');
    expect(buildLoanPlan(10000, '2026-12-31', { frequency: 'INTERVAL', intervalDays: 10 }).installments[1].dueDate).toBe('2027-01-10');
    const monthly = buildLoanPlan(10000, '2028-01-31', { frequency: 'MONTHLY', installmentCount: 3 });
    expect(monthly.installments.map(i => i.dueDate)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });
  it('allows an agreed regular payment and explicitly balances the final installment', () => {
    const plan = buildLoanPlan(1_000_000, '2026-09-22', { interestBps: 2000, installmentCount: 10, regularPaymentCents: 100000 });
    expect(plan.installments[9].amountCents).toBe(300000);
  });
  it('accepts irregular dates and amounts while enforcing the agreed total', () => {
    const customInstallments = [{ dueDate: '2026-09-22', amountCents: 10000 }, { dueDate: '2026-10-01', amountCents: 25000 }, { dueDate: '2026-12-31', amountCents: 85000 }];
    const options = { interestBps: 2000, installmentCount: 3, frequency: 'CUSTOM' as const, customInstallments };
    expect(buildLoanPlan(100000, '2026-09-22', options).installments.map(i => i.amountCents)).toEqual([10000, 25000, 85000]);
    expect(() => buildLoanPlan(100000, '2026-09-22', { ...options, customInstallments: customInstallments.map(i => ({ ...i, amountCents: 1 })) })).toThrow();
    expect(() => buildLoanPlan(100000, '2026-09-22', { ...options, customInstallments: customInstallments.map(i => ({ ...i, dueDate: '2026-09-22' })) })).toThrow();
    expect(() => buildLoanPlan(100000, '2026-09-23', options)).toThrow();
    expect(() => buildLoanPlan(100000, '2026-09-22', { ...options, installmentCount: 4 })).toThrow();
    expect(() => buildLoanPlan(100000, '2026-09-22', { ...options, frequency: 'WEEKLY' })).toThrow();
  });
  it('rejects invalid rates, counts, incompatible amounts and calendar overflow', () => {
    for (const interestBps of [-1, 100001, 0.5, NaN]) expect(() => buildLoanPlan(10000, '2026-09-22', { interestBps })).toThrow();
    for (const installmentCount of [0, 1001, 0.5]) expect(() => buildLoanPlan(10000, '2026-09-22', { installmentCount })).toThrow();
    expect(() => buildLoanPlan(100, '2026-09-22', { installmentCount: 1000 })).toThrow();
    expect(() => buildLoanPlan(10000, '2026-09-22', { regularPaymentCents: 2000 })).toThrow();
    expect(() => buildLoanPlan(10000, '2026-09-22', { installmentCount: 1, regularPaymentCents: 100 })).toThrow();
    expect(() => buildLoanPlan(10000, '2100-12-31')).toThrow();
    expect(() => buildLoanPlan(10000, '2026-09-22', { frequency: 'INTERVAL', intervalDays: 0 })).toThrow();
  });
});
