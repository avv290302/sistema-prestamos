import 'reflect-metadata';
import { buildLoanPlan } from './loan-plan';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { REQUIRED_ROLES_KEY } from '../auth/auth.decorators';

jest.mock('../database/prisma.service', () => ({ PrismaService: jest.fn() }));

describe('LoansService', () => {
  const dto = { principalCents: 1000000, firstPaymentDate: '2026-09-22', clientId: 'client', requestId: 'request' };
  const plan = buildLoanPlan(dto.principalCents, dto.firstPaymentDate);
  const previous = { ...dto, ...plan, installments: plan.installments.map(i => ({ ...i, dueDate: new Date(i.dueDate) })), createdById: 'admin', firstPaymentDate: new Date('2026-09-22T00:00:00Z') };
  const lookup = jest.fn();
  const findClient = jest.fn();
  const create = jest.fn();
  const transaction = jest.fn();
  let service: LoansService;
  beforeEach(() => {
    jest.resetAllMocks();
    lookup.mockResolvedValue(null);
    findClient.mockResolvedValue({ isActive: true });
    create.mockResolvedValue({ id: 'new-loan' });
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ $queryRaw: jest.fn(async () => []), client: { findUnique: findClient }, loan: { create } }));
    service = new LoansService({ loan: { findUnique: lookup }, $transaction: transaction } as unknown as PrismaService);
  });
  it('creates the loan and all fourteen installments in one transaction', async () => {
    await service.create(dto, 'admin');
    const data = create.mock.calls[0][0].data;
    expect(data.createdById).toBe('admin');
    expect(data.totalCents).toBe(1400000);
    expect(data.installments.create).toHaveLength(14);
    expect(data.installments.create.reduce((sum: number, i: { amountCents: number }) => sum + i.amountCents, 0)).toBe(data.totalCents);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('returns the previous loan on retries without duplicating it', async () => {
    lookup.mockResolvedValue(previous);
    expect(await service.create(dto, 'admin')).toBe(previous);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects reusing a request with different data or another user', async () => {
    lookup.mockResolvedValue(previous);
    await expect(service.create({ ...dto, principalCents: 2000000 }, 'admin')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create(dto, 'other-user')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create({ ...dto, interestBps: 2500 }, 'admin')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create({ ...dto, installmentCount: 20 }, 'admin')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create({ ...dto, frequency: 'MONTHLY' }, 'admin')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create({ ...dto, regularPaymentCents: 90000 }, 'admin')).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects missing and inactive clients', async () => {
    findClient.mockResolvedValue(null);
    await expect(service.create(dto, 'admin')).rejects.toBeInstanceOf(NotFoundException);
    findClient.mockResolvedValue({ isActive: false });
    await expect(service.create(dto, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
  it('recovers a simultaneous retry that hits the unique constraint', async () => {
    lookup.mockResolvedValueOnce(null).mockResolvedValueOnce(previous);
    create.mockRejectedValue({ code: 'P2002' });
    expect(await service.create(dto, 'admin')).toBe(previous);
  });
  it('propagates a database failure', async () => {
    create.mockRejectedValue(new Error('db failure'));
    await expect(service.create(dto, 'admin')).rejects.toThrow('db failure');
  });
});

describe('Loan route permissions', () => {
  it('restricts creation and preview to administrators', () => {
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, LoansController.prototype.create)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, LoansController.prototype.preview)).toEqual(['ADMIN']);
  });
  it('allows all three roles to read', () => {
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, LoansController.prototype.list)).toEqual(['ADMIN', 'COLLECTOR', 'VIEWER']);
  });
});
