import { BadRequestException } from '@nestjs/common';
import { businessDate } from '../payments/payment-allocation';
export function offsetDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function reportRange(from?: string, to?: string, today = businessDate()) {
  const start = from ?? `${today.slice(0, 7)}-01`; const end = to ?? today;
  for (const value of [start, end]) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '2000-01-01') throw new BadRequestException('Selecciona fechas válidas a partir del año 2000.');
  }
  if (start > end) throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
  if (end > today) throw new BadRequestException('El reporte solo admite fechas hasta hoy.');
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (days > 366) throw new BadRequestException('Selecciona un periodo de hasta 366 días.');
  return { from: start, to: end, days, previousFrom: offsetDate(start, -days), previousTo: offsetDate(start, -1) };
}
export interface LoanDay { date: string; principalCents: number; interestCents: number; count: number }
export interface PaymentDay { date: string; collectedCents: number; count: number }
export function buildPeriodReport(range: ReturnType<typeof reportRange>, loans: LoanDay[], payments: PaymentDay[], groupBy: 'DAY' | 'WEEK' | 'MONTH') {
  function totals(from: string, to: string) {
    const l = loans.filter(row => row.date >= from && row.date <= to);
    const p = payments.filter(row => row.date >= from && row.date <= to);
    return { principalCents: l.reduce((s,r) => s+r.principalCents,0), interestCents: l.reduce((s,r) => s+r.interestCents,0), loanCount: l.reduce((s,r) => s+r.count,0), collectedCents: p.reduce((s,r) => s+r.collectedCents,0), paymentCount: p.reduce((s,r) => s+r.count,0) };
  }
  const byLoan = new Map(loans.map(row => [row.date, row]));
  const byPayment = new Map(payments.map(row => [row.date, row]));
  const series = new Map<string, { date: string; principalCents: number; collectedCents: number; loanCount: number; paymentCount: number }>();
  for (let date = range.from; date <= range.to; date = offsetDate(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const key = groupBy === 'MONTH' ? `${date.slice(0,7)}-01` : groupBy === 'WEEK' ? offsetDate(date, -((weekday+6)%7)) : date;
    const bucket = series.get(key) ?? { date: key, principalCents: 0, collectedCents: 0, loanCount: 0, paymentCount: 0 };
    const l = byLoan.get(date); const p = byPayment.get(date);
    bucket.principalCents += l?.principalCents ?? 0; bucket.collectedCents += p?.collectedCents ?? 0;
    bucket.loanCount += l?.count ?? 0; bucket.paymentCount += p?.count ?? 0;
    series.set(key, bucket);
  }
  return { current: totals(range.from, range.to), previous: totals(range.previousFrom, range.previousTo), series: [...series.values()] };
}
