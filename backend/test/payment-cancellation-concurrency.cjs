/* Concurrent payment transactions against disposable fixtures; exact IDs are cleaned up. */
require('dotenv/config');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaService } = require('../dist/database/prisma.service');
const { LoansService } = require('../dist/loans/loans.service');
const { PaymentsService } = require('../dist/payments/payments.service');
const { businessDate } = require('../dist/payments/payment-allocation');
async function main() {
  const db = new PrismaService();
  const userId = randomUUID(); const clientId = randomUUID(); let loanId;
  await db.$connect();
  try {
    await db.user.create({ data: { id: userId, fullName: 'Prueba concurrencia temporal', email: `${userId}@example.invalid`, passwordHash: 'not-a-login-account', role: 'ADMIN' } });
    await db.client.create({ data: { id: clientId, fullName: 'Prueba concurrencia temporal', phone: '0000000000', address: 'Ficticio', createdById: userId } });
    const loans = new LoansService(db); const payments = new PaymentsService(db);
    const loan = await loans.create({ requestId: randomUUID(), clientId, principalCents: 1000000, firstPaymentDate: businessDate() }, userId);
    loanId = loan.id;
    const base = { loanId, amountCents: 800000, paidOn: businessDate(), method: 'CASH' };
    const results = await Promise.allSettled([
      payments.create({ ...base, requestId: randomUUID() }, userId),
      payments.create({ ...base, requestId: randomUUID() }, userId),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.find(r => r.status === 'rejected');
    assert.equal(rejected.reason.getStatus(), 400);
    assert.equal((await loans.findOne(loanId)).balanceCents, 600000);
    const final = { ...base, requestId: randomUUID(), amountCents: 600000 };
    const retries = await Promise.all([payments.create(final, userId), payments.create(final, userId)]);
    assert.equal(retries[0].id, retries[1].id);
    const first=results.find(r=>r.status==='fulfilled').value.receiptSnapshot;
    assert.equal(first.balanceBeforeCents,1400000);assert.equal(first.balanceAfterCents,600000);
    assert.equal(retries[0].receiptSnapshot.balanceBeforeCents,600000);assert.equal(retries[0].receiptSnapshot.balanceAfterCents,0);
    assert.deepEqual(retries[0].receiptSnapshot,retries[1].receiptSnapshot);
    assert.equal(await db.payment.count({ where: { loanId } }), 2);
    assert.equal((await loans.findOne(loanId)).balanceCents, 0);
    const total = await db.paymentAllocation.aggregate({ where: { payment: { loanId } }, _sum: { amountCents: true } });
    assert.equal(total._sum.amountCents, 1400000);
    const original=results.find(r=>r.status==='fulfilled').value;
    const v=(await loans.findOne(loanId)).version;
    const concurrent=await Promise.allSettled([
      payments.cancel(original.id,'Pago duplicado',userId),
      payments.cancel(original.id,'Pago duplicado',userId),
      payments.create({...base,requestId:randomUUID(),amountCents:500000},userId),
    ]);
    assert.equal(concurrent[0].status,'fulfilled');assert.equal(concurrent[1].status,'fulfilled');
    assert.equal(concurrent[0].value.cancelledAt.toISOString(),concurrent[1].value.cancelledAt.toISOString());
    const newPaid=concurrent[2].status==='fulfilled';
    if(newPaid){assert.equal(concurrent[2].value.receiptSnapshot.balanceBeforeCents,800000);assert.equal(concurrent[2].value.receiptSnapshot.balanceAfterCents,300000);}else assert.equal(concurrent[2].reason.getStatus(),400);
    const actual=await loans.findOne(loanId);assert.equal(actual.balanceCents,newPaid?300000:800000);assert.equal(actual.version,v+1+(newPaid?1:0));
    assert.equal(await db.payment.count({where:{loanId,cancelledAt:{not:null}}}),1);
    console.log('Concurrent cancellation retries applied once; concurrent new payment and balances remain consistent.');
  } finally {
    await db.$transaction(async tx => {
      if (loanId) {
        await tx.paymentAllocation.deleteMany({ where: { payment: { loanId } } });
        await tx.payment.deleteMany({ where: { loanId } });
        await tx.loanInstallment.deleteMany({ where: { loanId } });
        await tx.loan.deleteMany({ where: { id: loanId, createdById: userId } });
      }
      await tx.client.deleteMany({ where: { id: clientId, createdById: userId } });
      await tx.user.deleteMany({ where: { id: userId } });
    });
    assert.equal(await db.user.count({ where: { id: userId } }), 0);
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
