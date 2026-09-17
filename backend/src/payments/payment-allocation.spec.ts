import { allocatePayment, businessDate, validatePaymentDate } from './payment-allocation';

const installments = [
  { id: 'first', number: 1, amountCents: 100000, paidCents: 0 },
  { id: 'second', number: 2, amountCents: 100000, paidCents: 0 },
  { id: 'third', number: 3, amountCents: 100000, paidCents: 0 },
];
describe('payment allocation', () => {
  it('applies a partial payment to the oldest installment', () => {
    expect(allocatePayment(50000, installments)).toEqual([{ installmentId: 'first', amountCents: 50000 }]);
  });
  it('finishes a partial installment before advancing', () => {
    expect(allocatePayment(100000, [{ ...installments[0], paidCents: 50000 }, ...installments.slice(1)])).toEqual([{ installmentId: 'first', amountCents: 50000 }, { installmentId: 'second', amountCents: 50000 }]);
  });
  it('sorts installments and accepts advance payments', () => {
    expect(allocatePayment(250000, [...installments].reverse())).toEqual([{ installmentId: 'first', amountCents: 100000 }, { installmentId: 'second', amountCents: 100000 }, { installmentId: 'third', amountCents: 50000 }]);
  });
  it('allows exact payoff and balances every cent', () => {
    const result = allocatePayment(300000, installments);
    expect(result.reduce((sum, a) => sum + a.amountCents, 0)).toBe(300000);
  });
  it('skips fully paid installments', () => {
    expect(allocatePayment(1, [{ ...installments[0], paidCents: 100000 }, ...installments.slice(1)])).toEqual([{ installmentId: 'second', amountCents: 1 }]);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 300001])('rejects invalid or excessive amount %s', amount => {
    expect(() => allocatePayment(amount, installments)).toThrow();
  });
  it('rejects payment on a paid-off loan', () => {
    expect(() => allocatePayment(1, installments.map(i => ({ ...i, paidCents: i.amountCents })))).toThrow();
  });
});
describe('payment dates', () => {
  it('uses the business date around UTC midnight', () => {
    expect(businessDate(new Date('2026-09-16T01:00:00Z'))).toBe('2026-09-15');
  });
  it.each(['2026-02-30', '2000-13-01', 'invalid', '2999-01-01'])('rejects invalid or future date %s', date => {
    expect(() => validatePaymentDate(date)).toThrow();
  });
  it('allows today and a leap-day date', () => {
    expect(validatePaymentDate(businessDate())).toBeInstanceOf(Date);
    expect(validatePaymentDate('2024-02-29').toISOString().slice(0, 10)).toBe('2024-02-29');
  });
});
