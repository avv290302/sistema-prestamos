import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreatePaymentDto, ListPaymentsDto } from './payment.dto';
import { renderReceipt, type ReceiptSnapshot } from './payment-receipt';
import { allocatePayment, validatePaymentDate } from './payment-allocation';

const include = {
  loan: {
    select: {
      id: true,
      client: { select: { id: true, fullName: true, phone: true } },
    },
  },
  createdBy: { select: { id: true, fullName: true } },
  allocations: { include: { installment: { select: { number: true } } } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto, createdById: string) {
    const paidOn = validatePaymentDate(dto.paidOn);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Serialize writes for the same loan. Recheck the balance after acquiring the lock.
          const rows = await tx.$queryRaw<
            { id: string; deleted_at: Date | null }[]
          >`SELECT id, deleted_at FROM loans WHERE id = ${dto.loanId}::uuid FOR UPDATE`;
          if (!rows.length)
            throw new NotFoundException('No se encontró el préstamo.');
          const existing = await tx.payment.findUnique({
            where: { requestId: dto.requestId },
            include,
          });
          if (existing) {
            if (
              existing.loanId !== dto.loanId ||
              existing.createdById !== createdById ||
              existing.amountCents !== dto.amountCents ||
              existing.paidOn.toISOString().slice(0, 10) !== dto.paidOn ||
              existing.method !== dto.method ||
              (existing.notes ?? '') !== (dto.notes ?? '')
            ) {
              throw new ConflictException(
                'Esta solicitud ya se utilizó con otros datos.',
              );
            }
            if (existing.cancelledAt)
              throw new ConflictException(
                'Este pago ya fue cancelado. No puede registrarse otra vez con la misma solicitud.',
              );
            return existing;
          }
          if (rows[0].deleted_at)
            throw new ConflictException(
              'No se pueden registrar pagos en un préstamo eliminado.',
            );
          const installments = await tx.loanInstallment.findMany({
            where: { loanId: dto.loanId },
            include: {
              allocations: {
                where: { payment: { cancelledAt: null } },
                select: { amountCents: true },
              },
            },
            orderBy: { number: 'asc' },
          });
          const allocations = allocatePayment(
            dto.amountCents,
            installments.map((i) => ({
              ...i,
              paidCents: i.allocations.reduce(
                (sum, a) => sum + a.amountCents,
                0,
              ),
            })),
          );
          const loan = await tx.loan.findUniqueOrThrow({
            where: { id: dto.loanId },
            include: { client: true },
          });
          const settings = await tx.appSettings.findUniqueOrThrow({
            where: { id: 1 },
          });
          const cashier = await tx.user.findUniqueOrThrow({
            where: { id: createdById },
          });
          const balanceBeforeCents = installments.reduce(
            (sum, i) =>
              sum +
              i.amountCents -
              i.allocations.reduce((n, a) => n + a.amountCents, 0),
            0,
          );
          const receiptSnapshot: ReceiptSnapshot = {
            version: 1,
            businessName: settings.businessName,
            businessPhone: settings.businessPhone,
            businessAddress: settings.businessAddress,
            footer: settings.receiptFooter,
            clientName: loan.client.fullName,
            clientPhone: loan.client.phone,
            cashierName: cashier.fullName,
            balanceBeforeCents,
            balanceAfterCents: balanceBeforeCents - dto.amountCents,
            installments: allocations.map((a) => {
              const i = installments.find((i) => i.id === a.installmentId)!;
              return {
                number: i.number,
                dueDate: i.dueDate.toISOString().slice(0, 10),
                amountCents: a.amountCents,
                remainingCents:
                  i.amountCents -
                  i.allocations.reduce((n, p) => n + p.amountCents, 0) -
                  a.amountCents,
              };
            }),
          };
          const payment = await tx.payment.create({
            data: {
              loanId: dto.loanId,
              requestId: dto.requestId,
              createdById,
              amountCents: dto.amountCents,
              paidOn,
              method: dto.method,
              notes: dto.notes,
              receiptSnapshot:
                receiptSnapshot as unknown as Prisma.InputJsonObject,
              allocations: { create: allocations },
            },
            include,
          });
          await tx.loan.update({
            where: { id: dto.loanId },
            data: { version: { increment: 1 } },
          });
          return payment;
        },
        { isolationLevel: 'ReadCommitted', timeout: 15000 },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Esta solicitud ya se utilizó. Actualiza el historial antes de registrar otro pago.',
        );
      }
      throw error;
    }
  }

  async cancel(id: string, reason: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(7162001)) AS access_lock`;
        const actor = await tx.user.findUnique({ where: { id: actorId } });
        if (!actor?.isActive || actor.deletedAt || actor.role !== 'ADMIN')
          throw new ForbiddenException(
            'Solo un administrador activo puede cancelar pagos.',
          );
        const target = await tx.payment.findUnique({
          where: { id },
          select: { loanId: true },
        });
        if (!target) throw new NotFoundException('No se encontró el pago.');
        await tx.$queryRaw`SELECT id FROM loans WHERE id=${target.loanId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id },
          include,
        });
        if (payment.cancelledAt) {
          if (payment.cancellationReason !== reason)
            throw new ConflictException(
              'El pago ya se canceló con otro motivo. Actualiza el historial.',
            );
          return payment;
        }
        await tx.$executeRaw`UPDATE payments SET cancelled_at=CURRENT_TIMESTAMP,cancelled_by_id=${actorId}::uuid,cancelled_by_name=${actor.fullName},cancellation_reason=${reason} WHERE id=${id}::uuid`;
        await tx.loan.update({
          where: { id: payment.loanId },
          data: { version: { increment: 1 } },
        });
        return tx.payment.findUniqueOrThrow({ where: { id }, include });
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000 },
    );
  }
  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include,
    });
    if (!payment) throw new NotFoundException('No se encontró el pago.');
    return payment;
  }
  async receipt(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include,
    });
    if (!payment) throw new NotFoundException('No se encontró el pago.');
    // Older payments deliberately have no invented historical balances.
    const snapshot =
      payment.receiptSnapshot as unknown as ReceiptSnapshot | null;
    const settings = snapshot
      ? null
      : await this.prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });
    return renderReceipt(payment, snapshot, settings?.businessName ?? '');
  }

  async findAll(query: ListPaymentsDto) {
    const { page, limit, search, loanId } = query;
    const from = query.from ? validatePaymentDate(query.from) : undefined;
    const to = query.to ? validatePaymentDate(query.to) : undefined;
    if (from && to && from > to)
      throw new BadRequestException(
        'La fecha inicial debe ser anterior o igual a la final.',
      );
    const where: Prisma.PaymentWhereInput = {
      ...(query.status === 'ACTIVE'
        ? { cancelledAt: null }
        : query.status === 'CANCELLED'
          ? { cancelledAt: { not: null } }
          : {}),
      ...(from || to ? { paidOn: { gte: from, lte: to } } : {}),
      ...(loanId ? { loanId } : {}),
      ...(search
        ? {
            OR: [
              {
                loan: {
                  client: {
                    OR: [
                      { fullName: { contains: search, mode: 'insensitive' } },
                      { phone: { contains: search } },
                    ],
                  },
                },
              },
              ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                search,
              )
                ? [{ id: search }]
                : []),
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.payment.findMany({
          where,
          include,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.payment.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
