/* Run from backend after building: node test/payments-db-smoke.cjs
 * All fixtures and writes are rolled back in one database transaction.
 */
require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { PrismaService } = require('../dist/database/prisma.service');
const { AppModule } = require('../dist/app.module');

async function main() {
  const db = new PrismaService();
  const rollback = new Error('ROLLBACK_TEST_FIXTURES');
  let checks = 0;
  let userId;
  await db.$connect();
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { fullName: 'Prueba temporal préstamos', email: `${randomUUID()}@example.invalid`, passwordHash: 'not-a-login-account', role: 'ADMIN' } });
      userId = user.id;
      const client = await tx.client.create({ data: { fullName: 'Cliente temporal de prueba', phone: '0000000000', address: 'Ficticio', createdById: user.id } });
      const token = randomBytes(32).toString('hex');
      await tx.session.create({ data: { tokenHash: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: new Date(Date.now() + 600000) } });
      const provider = { appSettings: tx.appSettings, payment: tx.payment, loanInstallment: tx.loanInstallment, user: tx.user, client: tx.client, loan: tx.loan, session: tx.session, $transaction: async op => typeof op === 'function' ? op(tx) : Promise.all(op) };
      const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(provider).compile();
      const app = module.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
      const api = request(app.getHttpServer());
      const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
      const cookie = `prestamos_session=${token}`;
      const input = { principalCents: 1000000, firstPaymentDate: '2026-09-22', clientId: client.id, requestId: randomUUID() };
      try {
        await api.get('/loans').expect(401); checks++;
        const preview = await api.post('/loans/preview').set('Cookie', cookie).set('Origin', origin).send({ principalCents: input.principalCents, firstPaymentDate: input.firstPaymentDate }).expect(201);
        assert.equal(preview.body.totalCents, 1400000); assert.equal(preview.body.installments.length, 14); checks++;
        await api.post('/loans/preview').set('Cookie', cookie).set('Origin', origin).send({ principalCents: 1000000, firstPaymentDate: '2026-02-30' }).expect(400); checks++;
        await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send({ ...input, totalCents: 1 }).expect(400); checks++;
        const created = await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send(input).expect(201);
        assert.equal(created.body.installments.reduce((sum, i) => sum + i.amountCents, 0), 1400000);
        assert.equal(created.body.installments[13].dueDate.slice(0, 10), '2026-12-22'); checks++;
        const retried = await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send(input).expect(201);
        assert.equal(retried.body.id, created.body.id);
        assert.equal(await tx.loan.count({ where: { requestId: input.requestId } }), 1); checks++;
        await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send({ ...input, principalCents: 2000000 }).expect(409); checks++;
        const detail = await api.get(`/loans/${created.body.id}`).set('Cookie', cookie).expect(200);
        assert.equal(detail.body.client.id, client.id); checks++;
        const listed = await api.get('/loans?search=Cliente%20temporal%20de%20prueba&page=1&limit=20').set('Cookie', cookie).expect(200);
        assert.ok(listed.body.items.some(l => l.id === created.body.id)); checks++;
        await api.post('/loans').set('Cookie', cookie).set('Origin', 'https://invalid.example').send({ ...input, requestId: randomUUID() }).expect(403); checks++;
        for (const role of ['COLLECTOR', 'VIEWER']) {
          await tx.user.update({ where: { id: user.id }, data: { role } });
          await api.get('/loans').set('Cookie', cookie).expect(200);
          await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send({ ...input, requestId: randomUUID() }).expect(403);
          checks += 2;
        }
        await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
        const { businessDate } = require('../dist/payments/payment-allocation');
        const paymentInput = { loanId: created.body.id, requestId: randomUUID(), amountCents: 50000, paidOn: businessDate(), method: 'CASH', notes: 'Prueba temporal' };
        const pay = data => api.post('/payments').set('Cookie', cookie).set('Origin', origin).send(data);
        await api.get('/payments').expect(401); checks++;
        await api.post('/payments').send(paymentInput).expect(401); checks++;
        await api.post('/payments').set('Cookie', cookie).set('Origin', 'https://invalid.example').send(paymentInput).expect(403); checks++;
        await pay({ ...paymentInput, amountCents: 0 }).expect(400); checks++;
        await pay({ ...paymentInput, amountCents: 1.5 }).expect(400); checks++;
        await pay({ ...paymentInput, paidOn: '2999-01-01' }).expect(400); checks++;
        await pay({ ...paymentInput, paidOn: '2026-02-30' }).expect(400); checks++;
        await pay({ ...paymentInput, createdById: user.id }).expect(400); checks++;
        await pay({ ...paymentInput, loanId: randomUUID() }).expect(404); checks++;
        await tx.user.update({ where: { id: user.id }, data: { role: 'VIEWER' } });
        await api.get('/payments').set('Cookie', cookie).expect(200); checks++;
        await pay(paymentInput).expect(403); checks++;
        await tx.user.update({ where: { id: user.id }, data: { role: 'COLLECTOR' } });
        const partial = await pay(paymentInput).expect(201);
        assert.equal(partial.body.createdBy.id, user.id);
        assert.equal(partial.body.allocations.length, 1);
        assert.equal(partial.body.allocations[0].amountCents, 50000); checks++;
        const snapshot=partial.body.receiptSnapshot;
        assert.equal(snapshot.balanceBeforeCents,1400000);
        assert.equal(snapshot.balanceAfterCents,1350000);
        assert.equal(snapshot.installments[0].remainingCents,50000);checks++;
        await api.get('/payments/'+partial.body.id+'/receipt.pdf').expect(401);checks++;
        await api.get('/payments/not-a-uuid/receipt.pdf').set('Cookie',cookie).expect(400);checks++;
        await api.get('/payments/'+randomUUID()+'/receipt.pdf').set('Cookie',cookie).expect(404);checks++;
        const pdf=await api.get('/payments/'+partial.body.id+'/receipt.pdf').set('Cookie',cookie).expect(200);
        assert.match(pdf.headers['content-type'],/application\/pdf/);
        assert.equal(pdf.headers['cache-control'],'no-store');
        assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');checks++;
        // Historical data remains unchanged even if settings/client change afterward.
        await tx.client.update({where:{id:client.id},data:{fullName:'Nombre cambiado'}});
        await tx.appSettings.update({where:{id:1},data:{businessName:'Negocio cambiado',receiptFooter:'Otro mensaje'}});
        const stored=await tx.payment.findUniqueOrThrow({where:{id:partial.body.id}});
        assert.deepEqual(stored.receiptSnapshot,snapshot);checks++;
        await tx.user.update({where:{id:user.id},data:{role:'VIEWER'}});
        await api.get('/payments/'+partial.body.id+'/receipt.pdf').set('Cookie',cookie).expect(200);checks++;
        await tx.user.update({where:{id:user.id},data:{role:'COLLECTOR'}});
        await tx.$executeRaw`UPDATE payments SET receipt_snapshot = NULL WHERE id = ${partial.body.id}::uuid`;
        await api.get('/payments/'+partial.body.id+'/receipt.pdf').set('Cookie',cookie).expect(200);checks++;
        await tx.payment.update({where:{id:partial.body.id},data:{receiptSnapshot:snapshot}});
        const retry = await pay(paymentInput).expect(201);
        assert.equal(retry.body.id, partial.body.id);
        assert.deepEqual(retry.body.receiptSnapshot,snapshot);
        assert.equal(await tx.payment.count({ where: { loanId: created.body.id } }), 1); checks++;
        await pay({ ...paymentInput, amountCents: 60000 }).expect(409); checks++;
        let updated = await api.get(`/loans/${created.body.id}`).set('Cookie', cookie).expect(200);
        assert.equal(updated.body.balanceCents, 1350000);
        assert.equal(updated.body.installments[0].status, 'PARTIAL'); checks++;
        const second = await pay({ ...paymentInput, requestId: randomUUID(), amountCents: 150000, method: 'TRANSFER' }).expect(201);
        assert.equal(second.body.receiptSnapshot.balanceBeforeCents,1350000);assert.equal(second.body.receiptSnapshot.balanceAfterCents,1200000);checks++;
        assert.deepEqual(second.body.allocations.map(a => a.amountCents).sort((a,b) => a-b), [50000, 100000]); checks++;
        updated = await api.get(`/loans/${created.body.id}`).set('Cookie', cookie).expect(200);
        assert.equal(updated.body.paidCents, 200000);
        assert.equal(updated.body.balanceCents, 1200000);
        assert.equal(updated.body.installments[0].status, 'PAID');
        assert.equal(updated.body.installments[1].status, 'PAID'); checks++;
        await pay({ ...paymentInput, requestId: randomUUID(), amountCents: 1200001 }).expect(400);
        assert.equal(await tx.payment.count({ where: { loanId: created.body.id } }), 2); checks++;
        await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
        await pay({ ...paymentInput, requestId: randomUUID(), amountCents: 1200000 }).expect(201); checks++;
        updated = await api.get(`/loans/${created.body.id}`).set('Cookie', cookie).expect(200);
        assert.equal(updated.body.balanceCents, 0);
        assert.equal(updated.body.status, 'PAID');
        assert.ok(updated.body.installments.every(i => i.status === 'PAID')); checks++;
        await pay({ ...paymentInput, requestId: randomUUID(), amountCents: 1 }).expect(400); checks++;
        const history = await api.get(`/payments?loanId=${created.body.id}&limit=2&page=1`).set('Cookie', cookie).expect(200);
        assert.equal(history.body.pagination.total, 3);
        assert.equal(history.body.pagination.totalPages, 2);
        assert.equal(history.body.items.length, 2); checks++;
        const historyPage2 = await api.get(`/payments?loanId=${created.body.id}&limit=2&page=2`).set('Cookie', cookie).expect(200);
        assert.equal(historyPage2.body.items.length, 1);
        assert.ok(!history.body.items.some(p => p.id === historyPage2.body.items[0].id)); checks++;
        const amounts = await tx.payment.aggregate({ where: { loanId: created.body.id }, _sum: { amountCents: true } });
        const allocated = await tx.paymentAllocation.aggregate({ where: { payment: { loanId: created.body.id } }, _sum: { amountCents: true } });
        assert.equal(amounts._sum.amountCents, allocated._sum.amountCents); checks++;
        await tx.client.update({ where: { id: client.id }, data: { isActive: false } });
        await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send({ ...input, requestId: randomUUID() }).expect(400); checks++;
        assert.equal(await tx.loan.count({ where: { clientId: client.id } }), 1);
      } finally { await app.close(); }
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally {
    if (userId) assert.equal(await db.user.count({ where: { id: userId } }), 0, 'Fixtures must roll back');
    await db.$disconnect();
  }
  console.log(`${checks} API/database checks passed; all fixtures rolled back.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
