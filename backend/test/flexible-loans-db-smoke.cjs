/* Run from backend after building: node test/flexible-loans-db-smoke.cjs
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
const { businessDate } = require('../dist/payments/payment-allocation');

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
      const provider = { payment: tx.payment, $queryRaw: tx.$queryRaw.bind(tx), user: tx.user, client: tx.client, loan: tx.loan, session: tx.session, $transaction: async op => typeof op === 'function' ? op(tx) : Promise.all(op) };
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
        const post = (path, body) => api.post(path).set('Cookie', cookie).set('Origin', origin).send(body);
        for (const fields of [{ interestBps: null }, { installmentCount: 0 }, { frequency: 'BAD' }, { regularPaymentCents: 1.5 }, { customInstallments: null }]) {
          await post('/loans/preview', { principalCents: 100000, firstPaymentDate: '2026-09-22', ...fields }).expect(400); checks++;
        }
        const daily = await post('/loans', { ...input, requestId: randomUUID(), principalCents: 100000, interestBps: 0, installmentCount: 20, frequency: 'DAILY' }).expect(201);
        assert.equal(daily.body.installments.length, 20);
        assert.equal(daily.body.interestCents, 0);
        assert.ok(daily.body.installments.every(i => i.amountCents === 5000)); checks++;
        const today = businessDate();
        const getReport = () => api.get('/reports?from=' + today + '&to=' + today).set('Cookie', cookie).expect(200);
        const before = (await getReport()).body;
        const personalized = { ...input, requestId: randomUUID(), interestBps: 2500, installmentCount: 3, frequency: 'CUSTOM', firstPaymentDate: '2001-01-01',
          customInstallments: [{ dueDate: '2001-01-01', amountCents: 100000 }, { dueDate: '2001-01-15', amountCents: 300000 }, { dueDate: '2100-01-01', amountCents: 850000 }] };
        const loan = (await post('/loans', personalized).expect(201)).body;
        assert.equal(loan.totalCents, 1250000); assert.equal(loan.interestBps, 2500); assert.equal(loan.frequency, 'CUSTOM'); checks++;
        const retry = (await post('/loans', personalized).expect(201)).body;
        assert.equal(retry.id, loan.id); checks++;
        await post('/loans', { ...personalized, customInstallments: personalized.customInstallments.map((i,n) => ({ ...i, amountCents: i.amountCents + (n === 0 ? 1 : n === 1 ? -1 : 0) })) }).expect(409); checks++;
        await post('/loans/preview', { principalCents: 1000000, firstPaymentDate: personalized.firstPaymentDate, interestBps: 2500, installmentCount: 3, frequency: 'CUSTOM', customInstallments: personalized.customInstallments.map(i => ({ ...i, amountCents: 1 })) }).expect(400); checks++;
        await post('/payments', { loanId: loan.id, requestId: randomUUID(), amountCents: 150000, paidOn: today, method: 'CASH' }).expect(201); checks++;
        const state = (await api.get('/loans/' + loan.id).set('Cookie',cookie).expect(200)).body;
        assert.equal(state.balanceCents, 1100000);
        assert.deepEqual(state.installments.map(i => i.balanceCents), [0,250000,850000]); checks++;
        const collections = (await api.get('/collections?status=ALL&search=Cliente%20temporal%20de%20prueba&limit=100').set('Cookie',cookie).expect(200)).body;
        const pending = collections.items.filter(i => i.loanId === loan.id);
        assert.equal(pending.length,2); assert.ok(pending.every(i => i.installmentCount === 3));
        assert.equal(pending[0].balanceCents,250000); assert.equal(pending[0].status,'OVERDUE');
        assert.equal(pending[1].status,'UPCOMING'); checks++;
        const after = (await getReport()).body;
        assert.equal(after.portfolio.outstandingCents - before.portfolio.outstandingCents,1100000);
        assert.equal(after.portfolio.overdueCents - before.portfolio.overdueCents,250000);
        assert.equal(after.current.principalCents - before.current.principalCents,1000000);
        assert.equal(after.current.interestCents - before.current.interestCents,250000);
        assert.equal(after.current.collectedCents - before.current.collectedCents,150000); checks++;
        await post('/payments', { loanId: loan.id, requestId: randomUUID(), amountCents: 1100001, paidOn: today, method: 'CASH' }).expect(400); checks++;
        await post('/payments', { loanId: loan.id, requestId: randomUUID(), amountCents: 1100000, paidOn: today, method: 'CASH' }).expect(201);
        const paid = (await api.get('/loans/' + loan.id).set('Cookie',cookie).expect(200)).body;
        assert.equal(paid.status,'PAID'); assert.equal(paid.balanceCents,0); checks++;
        await tx.client.update({ where: { id: client.id }, data: { isActive: false } });
        await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send({ ...input, requestId: randomUUID() }).expect(400); checks++;
        assert.equal(await tx.loan.count({ where: { clientId: client.id } }), 3);
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
