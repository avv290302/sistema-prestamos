import { request } from './auth';
export type ReportGroup = 'DAY' | 'WEEK' | 'MONTH';
export interface ReportTotals { principalCents: number; interestCents: number; loanCount: number; collectedCents: number; paymentCount: number }
export interface ReportSeries { date: string; principalCents: number; collectedCents: number; loanCount: number; paymentCount: number }
export interface ReportData {
  range: { from: string; to: string; days: number; previousFrom: string; previousTo: string; groupBy: ReportGroup };
  asOf: string; timeZone: string; generatedAt: string;
  current: ReportTotals; previous: ReportTotals; series: ReportSeries[];
  portfolio: { outstandingCents: number; overdueCents: number; dueTodayCents: number; upcomingCents: number; activeLoans: number; overdueLoans: number; paidLoans: number; clientsWithBalance: number };
  aging: { bucket: string; amountCents: number; installmentCount: number }[];
  methods: { method: string; amountCents: number; count: number }[];
  responsibles: { id: string; fullName: string; amountCents: number; count: number }[];
  debtors: { id: string; fullName: string; overdueCents: number; overdueInstallments: number; daysOverdue: number }[];
}
export async function getReport(from: string, to: string, groupBy: ReportGroup, signal: AbortSignal): Promise<ReportData> {
  return (await request(`/reports?${new URLSearchParams({ from, to, groupBy })}`, { signal })).json();
}
