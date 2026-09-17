import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { businessDate } from '../payments/payment-allocation';
import type { ListCollectionsDto } from './collections.dto';
import { collectionDateRange, collectionSearchPattern } from './collections.helpers';

interface CollectionRow {
  id: string; loanId: string; number: number; installmentCount: number; dueDate: Date;
  amountCents: number; paidCents: number; balanceCents: number; daysOverdue: number;
  clientId: string; fullName: string; phone: string; address: string; isActive: boolean;
}
interface Totals {
  overdueCents: number; overdueCount: number;
  todayCents: number; todayCount: number;
  nextSevenDaysCents: number; nextSevenDaysCount: number;
  outstandingCents: number; pendingCount: number; loanCount: number; filteredCount: number;
}

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListCollectionsDto) {
    const dates = collectionDateRange(businessDate());
    const pattern = collectionSearchPattern(query.search);
    const base = Prisma.sql`
      WITH pending AS (
        SELECT i.id, i.loan_id, i.number, l.installment_count, i.due_date, i.amount_cents,
          COALESCE(SUM(a.amount_cents), 0)::integer AS paid_cents,
          (i.amount_cents - COALESCE(SUM(a.amount_cents), 0))::integer AS balance_cents,
          c.id AS client_id, c.full_name, c.phone, c.address, c.is_active
        FROM loan_installments i
        JOIN loans l ON l.id = i.loan_id
        JOIN clients c ON c.id = l.client_id
        LEFT JOIN payment_allocations a ON a.installment_id = i.id AND EXISTS (SELECT 1 FROM payments valid WHERE valid.id=a.payment_id AND valid.cancelled_at IS NULL)
        WHERE l.deleted_at IS NULL AND (c.full_name ILIKE ${pattern} OR c.phone ILIKE ${pattern})
        GROUP BY i.id, c.id, l.id
        HAVING i.amount_cents - COALESCE(SUM(a.amount_cents), 0) > 0
      )`;
    const condition = query.status === 'OVERDUE' ? Prisma.sql`due_date < ${dates.today}::date`
      : query.status === 'TODAY' ? Prisma.sql`due_date = ${dates.today}::date`
      : query.status === 'NEXT_7' ? Prisma.sql`due_date > ${dates.today}::date AND due_date <= ${dates.nextSevenDays}::date`
      : Prisma.sql`TRUE`;
    return this.prisma.$transaction(async tx => {
      const [summary] = await tx.$queryRaw<Totals[]>(Prisma.sql`${base}
        SELECT
          COALESCE(SUM(balance_cents) FILTER (WHERE due_date < ${dates.today}::date), 0)::float8 AS "overdueCents",
          COUNT(*) FILTER (WHERE due_date < ${dates.today}::date)::integer AS "overdueCount",
          COALESCE(SUM(balance_cents) FILTER (WHERE due_date = ${dates.today}::date), 0)::float8 AS "todayCents",
          COUNT(*) FILTER (WHERE due_date = ${dates.today}::date)::integer AS "todayCount",
          COALESCE(SUM(balance_cents) FILTER (WHERE due_date > ${dates.today}::date AND due_date <= ${dates.nextSevenDays}::date), 0)::float8 AS "nextSevenDaysCents",
          COUNT(*) FILTER (WHERE due_date > ${dates.today}::date AND due_date <= ${dates.nextSevenDays}::date)::integer AS "nextSevenDaysCount",
          COALESCE(SUM(balance_cents), 0)::float8 AS "outstandingCents",
          COUNT(*)::integer AS "pendingCount", COUNT(DISTINCT loan_id)::integer AS "loanCount",
          COUNT(*) FILTER (WHERE ${condition})::integer AS "filteredCount"
        FROM pending`);
      const rows = await tx.$queryRaw<CollectionRow[]>(Prisma.sql`${base}
        SELECT id, loan_id AS "loanId", number, installment_count AS "installmentCount", due_date AS "dueDate", amount_cents AS "amountCents",
          paid_cents AS "paidCents", balance_cents AS "balanceCents",
          GREATEST(${dates.today}::date - due_date, 0)::integer AS "daysOverdue",
          client_id AS "clientId", full_name AS "fullName", phone, address, is_active AS "isActive"
        FROM pending WHERE ${condition}
        ORDER BY due_date ASC, loan_id ASC, number ASC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
      const items = rows.map(({ clientId, fullName, phone, address, isActive, ...row }) => ({
        ...row, dueDate: row.dueDate.toISOString().slice(0, 10),
        status: row.daysOverdue > 0 ? 'OVERDUE' : row.dueDate.toISOString().slice(0, 10) === dates.today ? 'TODAY' : 'UPCOMING',
        client: { id: clientId, fullName, phone, address, isActive },
      }));
      const { filteredCount, ...totals } = summary;
      return {
        asOf: dates.today, timeZone: 'America/Mexico_City', nextSevenDaysThrough: dates.nextSevenDays,
        summary: totals, items,
        pagination: { page: query.page, limit: query.limit, total: filteredCount, totalPages: Math.ceil(filteredCount / query.limit) },
      };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
