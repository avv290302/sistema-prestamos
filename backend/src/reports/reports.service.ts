import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { businessDate } from '../payments/payment-allocation';
import type { ReportQueryDto } from './reports.dto';
import { buildPeriodReport, reportRange } from './reports.helpers';
import type { LoanDay, PaymentDay } from './reports.helpers';
export interface Portfolio { outstandingCents: number; overdueCents: number; dueTodayCents: number; upcomingCents: number; activeLoans: number; overdueLoans: number; paidLoans: number; clientsWithBalance: number }
export interface Aging { bucket: string; amountCents: number; installmentCount: number }
export interface Method { method: string; amountCents: number; count: number }
export interface Responsible { id: string; fullName: string; amountCents: number; count: number }
export interface Debtor { id: string; fullName: string; overdueCents: number; overdueInstallments: number; daysOverdue: number }
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  async overview(query: ReportQueryDto) {
    const asOf = businessDate(); const range = reportRange(query.from, query.to, asOf);
    const pending = Prisma.sql`WITH balances AS (
      SELECT i.id, i.loan_id, l.client_id, i.due_date,
        (i.amount_cents - COALESCE(SUM(a.amount_cents),0))::integer AS balance_cents
      FROM loan_installments i JOIN loans l ON l.id = i.loan_id
      LEFT JOIN payment_allocations a ON a.installment_id = i.id AND EXISTS (SELECT 1 FROM payments valid WHERE valid.id=a.payment_id AND valid.cancelled_at IS NULL)
      WHERE l.deleted_at IS NULL
      GROUP BY i.id, l.client_id HAVING i.amount_cents - COALESCE(SUM(a.amount_cents),0) > 0
    )`;
    return this.prisma.$transaction(async tx => {
      const loans = await tx.$queryRaw<LoanDay[]>(Prisma.sql`
        SELECT to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS date,
        SUM(principal_cents)::float8 AS "principalCents", SUM(interest_cents)::float8 AS "interestCents", COUNT(*)::integer AS count
        FROM loans WHERE deleted_at IS NULL AND (created_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN ${range.previousFrom}::date AND ${range.to}::date
        GROUP BY 1 ORDER BY 1`);
      const payments = await tx.$queryRaw<PaymentDay[]>(Prisma.sql`
        SELECT to_char(paid_on, 'YYYY-MM-DD') AS date, SUM(amount_cents)::float8 AS "collectedCents", COUNT(*)::integer AS count
        FROM payments WHERE cancelled_at IS NULL AND paid_on BETWEEN ${range.previousFrom}::date AND ${range.to}::date GROUP BY 1 ORDER BY 1`);
      const [portfolio] = await tx.$queryRaw<Portfolio[]>(Prisma.sql`${pending}
        SELECT COALESCE(SUM(balance_cents),0)::float8 AS "outstandingCents",
        COALESCE(SUM(balance_cents) FILTER(WHERE due_date < ${asOf}::date),0)::float8 AS "overdueCents",
        COALESCE(SUM(balance_cents) FILTER(WHERE due_date = ${asOf}::date),0)::float8 AS "dueTodayCents",
        COALESCE(SUM(balance_cents) FILTER(WHERE due_date > ${asOf}::date),0)::float8 AS "upcomingCents",
        COUNT(DISTINCT loan_id)::integer AS "activeLoans",
        COUNT(DISTINCT loan_id) FILTER(WHERE due_date < ${asOf}::date)::integer AS "overdueLoans",
        ((SELECT COUNT(*) FROM loans WHERE deleted_at IS NULL) - COUNT(DISTINCT loan_id))::integer AS "paidLoans",
        COUNT(DISTINCT client_id)::integer AS "clientsWithBalance" FROM balances`);
      const aging = await tx.$queryRaw<Aging[]>(Prisma.sql`${pending}
        SELECT CASE WHEN ${asOf}::date - due_date <= 7 THEN '1_7' WHEN ${asOf}::date - due_date <= 14 THEN '8_14' WHEN ${asOf}::date - due_date <= 30 THEN '15_30' ELSE '31_PLUS' END AS bucket,
        SUM(balance_cents)::float8 AS "amountCents", COUNT(*)::integer AS "installmentCount"
        FROM balances WHERE due_date < ${asOf}::date GROUP BY 1`);
      const methods = await tx.$queryRaw<Method[]>(Prisma.sql`
        SELECT method::text AS method, SUM(amount_cents)::float8 AS "amountCents", COUNT(*)::integer AS count
        FROM payments WHERE cancelled_at IS NULL AND paid_on BETWEEN ${range.from}::date AND ${range.to}::date GROUP BY method ORDER BY method`);
      const responsibles = await tx.$queryRaw<Responsible[]>(Prisma.sql`
        SELECT u.id, u.full_name AS "fullName", SUM(p.amount_cents)::float8 AS "amountCents", COUNT(*)::integer AS count
        FROM payments p JOIN users u ON u.id = p.created_by_id
        WHERE p.cancelled_at IS NULL AND p.paid_on BETWEEN ${range.from}::date AND ${range.to}::date
        GROUP BY u.id ORDER BY SUM(p.amount_cents) DESC, u.id LIMIT 10`);
      const debtors = await tx.$queryRaw<Debtor[]>(Prisma.sql`${pending}
        SELECT c.id, c.full_name AS "fullName", SUM(b.balance_cents)::float8 AS "overdueCents", COUNT(*)::integer AS "overdueInstallments",
        MAX(${asOf}::date - b.due_date)::integer AS "daysOverdue"
        FROM balances b JOIN clients c ON c.id = b.client_id WHERE b.due_date < ${asOf}::date
        GROUP BY c.id ORDER BY SUM(b.balance_cents) DESC, c.id LIMIT 5`);
      return {
        range: { ...range, groupBy: query.groupBy }, asOf, timeZone: 'America/Mexico_City', generatedAt: new Date().toISOString(),
        ...buildPeriodReport(range, loans, payments, query.groupBy), portfolio,
        aging: ['1_7','8_14','15_30','31_PLUS'].map(bucket => aging.find(row => row.bucket === bucket) ?? { bucket, amountCents: 0, installmentCount: 0 }),
        methods: ['CASH','TRANSFER','OTHER'].map(method => methods.find(row => row.method === method) ?? { method, amountCents: 0, count: 0 }),
        responsibles, debtors,
      };
    }, { isolationLevel: 'RepeatableRead', timeout: 20000 });
  }
}
