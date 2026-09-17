import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateLoanDto, UpdateLoanDto } from './loan.dto';
import type { ClientDirectoryDto } from '../clients/dto/update-client.dto';
import { buildLoanPlan } from './loan-plan';

const include = {
  client: { select: { id: true, fullName: true, phone: true } },
  installments: { orderBy: { number: 'asc' as const }, include: { allocations: { select: { amountCents: true, payment:{select:{cancelledAt:true}} } } } },
} satisfies Prisma.LoanInclude;

function summarizeLoan(loan: Prisma.LoanGetPayload<{ include: typeof include }>) {
  const installments = loan.installments.map(({ allocations, ...i }) => {
    const paidCents = allocations.filter(a=>!a.payment.cancelledAt).reduce((sum, a) => sum + a.amountCents, 0);
    return { ...i, hasPaymentHistory:allocations.length>0, paidCents, balanceCents: i.amountCents - paidCents, status: paidCents === i.amountCents ? 'PAID' : paidCents > 0 ? 'PARTIAL' : 'PENDING' };
  });
  const paidCents = installments.reduce((sum, i) => sum + i.paidCents, 0);
  return { ...loan, installments, paidCents, balanceCents: loan.totalCents - paidCents, status: loan.deletedAt ? 'CANCELLED' : paidCents === loan.totalCents ? 'PAID' : 'ACTIVE' };
}
@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLoanDto, createdById: string) {
    const plan = buildLoanPlan(dto.principalCents, dto.firstPaymentDate, dto);
    const reuse = async () => {
      const existing = await this.prisma.loan.findUnique({ where: { requestId: dto.requestId }, include });
      if (existing?.deletedAt) throw new ConflictException('Esta solicitud corresponde a un préstamo eliminado.');
      if (existing && (existing.clientId !== dto.clientId || existing.principalCents !== dto.principalCents || existing.createdById !== createdById || existing.firstPaymentDate.toISOString().slice(0, 10) !== dto.firstPaymentDate)) {
        throw new ConflictException('La solicitud ya se utilizó con otros datos.');
      }
      if (existing && (existing.interestBps !== plan.interestBps || existing.installmentCount !== plan.installmentCount || existing.frequency !== plan.frequency || existing.intervalDays !== plan.intervalDays || existing.installments.length !== plan.installments.length || existing.installments.some((item, index) => item.amountCents !== plan.installments[index].amountCents || item.dueDate.toISOString().slice(0, 10) !== plan.installments[index].dueDate))) {
        throw new ConflictException('La solicitud ya se utilizó con otras condiciones o calendario.');
      }
      return existing;
    };
    const previous = await reuse();
    if (previous) return previous;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM clients WHERE id=${dto.clientId}::uuid FOR UPDATE`;
        const client = await tx.client.findUnique({ where: { id: dto.clientId }, select: { isActive: true, deletedAt: true } });
        if (!client) throw new NotFoundException('No se encontró el cliente.');
        if (!client.isActive || client.deletedAt) throw new BadRequestException('El cliente está inactivo.');
        return tx.loan.create({
          data: {
            requestId: dto.requestId, clientId: dto.clientId, createdById,
            principalCents: plan.principalCents, interestCents: plan.interestCents,
            totalCents: plan.totalCents, weeklyCents: plan.weeklyCents,
            interestBps: plan.interestBps, installmentCount: plan.installmentCount,
            frequency: plan.frequency, intervalDays: plan.intervalDays,
            firstPaymentDate: new Date(`${dto.firstPaymentDate}T00:00:00Z`),
            installments: { create: plan.installments.map((i) => ({ ...i, dueDate: new Date(`${i.dueDate}T00:00:00Z`) })) },
          }, include,
        });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const existing = await reuse();
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findAll(query: ClientDirectoryDto) {
    const { page, limit, search } = query;
    const where: Prisma.LoanWhereInput = search ? { client: { OR: [
      { fullName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ] } } : {};
    where.deletedAt = query.archived === "true" ? { not: null } : null;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.loan.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.loan.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items: items.map(summarizeLoan), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id }, include });
    if (!loan) throw new NotFoundException('No se encontró el préstamo.');
    return summarizeLoan(loan);
  }
  private async locked(tx: Prisma.TransactionClient, id:string, version:number) {
    await tx.$queryRaw`SELECT id FROM loans WHERE id=${id}::uuid FOR UPDATE`;
    const loan=await tx.loan.findUnique({where:{id},include});
    if(!loan)throw new NotFoundException('No se encontró el préstamo.');
    if(loan.version!==version)throw new ConflictException('El préstamo recibió cambios o pagos. Vuelve a abrirlo antes de continuar.');
    return loan;
  }
  async update(id:string,dto:UpdateLoanDto,actorId:string) {
    const plan=buildLoanPlan(dto.principalCents,dto.firstPaymentDate,dto);
    return this.prisma.$transaction(async tx=>{
      const loan=await this.locked(tx,id,dto.version);
      if(loan.deletedAt)throw new ConflictException('Restaura el préstamo antes de modificarlo.');
      for(const old of loan.installments) if(old.allocations.length) {
        const next=plan.installments.find(i=>i.number===old.number);
        if(!next||next.amountCents!==old.amountCents||next.dueDate!==old.dueDate.toISOString().slice(0,10))throw new BadRequestException('Las cuotas con historial de abonos, incluso cancelados, deben conservar su número, fecha e importe. Personaliza únicamente las cuotas sin abonos.');
      }
      await tx.loanRevision.create({data:{loanId:id,actorId,action:'EDIT',snapshot:JSON.parse(JSON.stringify(loan))}});
      await tx.loanInstallment.deleteMany({where:{loanId:id,number:{gt:plan.installmentCount}}});
      for(const item of plan.installments) {
        const data={dueDate:new Date(item.dueDate+'T00:00:00Z'),amountCents:item.amountCents};
        await tx.loanInstallment.upsert({where:{loanId_number:{loanId:id,number:item.number}},create:{loanId:id,number:item.number,...data},update:data});
      }
      const {installments:_installments,...terms}=plan;
      return summarizeLoan(await tx.loan.update({where:{id},data:{...terms,firstPaymentDate:new Date(dto.firstPaymentDate+'T00:00:00Z'),version:{increment:1}},include}));
    },{timeout:20000});
  }
  async archive(id:string,version:number,actorId:string,restore=false) {
    return this.prisma.$transaction(async tx=>{
      const loan=await this.locked(tx,id,version);
      if(restore){const client=await tx.client.findUnique({where:{id:loan.clientId}});if(client?.deletedAt)throw new BadRequestException('Restaura primero al cliente.');}
      await tx.loanRevision.create({data:{loanId:id,actorId,action:restore?'RESTORE':'DELETE',snapshot:JSON.parse(JSON.stringify(loan))}});
      await tx.$executeRaw`UPDATE loans SET deleted_at=CASE WHEN ${restore} THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=${id}::uuid`;
      return summarizeLoan(await tx.loan.update({where:{id},data:{version:{increment:1}},include}));
    });
  }

}
