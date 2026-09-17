/* Run from backend after building: node test/reports-db-smoke.cjs
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
      const provider = { $queryRaw: tx.$queryRaw.bind(tx), payment: tx.payment, user: tx.user, client: tx.client, loan: tx.loan, session: tx.session, $transaction: async op => typeof op === 'function' ? op(tx) : Promise.all(op) };
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
        const reportUrl='/reports?from=2001-02-01&to=2001-02-07';
        const getReport = group => api.get(`${reportUrl}&groupBy=${group}`).set('Cookie',cookie);
        await api.get('/reports').expect(401); checks++;
        for (const suffix of ['from=2026-02-30&to=2026-03-01','from=2001-02-07&to=2001-02-01','from=2001-01-01&to=2003-01-01','from=2999-01-01&to=2999-01-02','groupBy=UNKNOWN']) {
          await api.get(`/reports?${suffix}`).set('Cookie',cookie).expect(400); checks++;
        }
        const baseline=(await getReport('DAY').expect(200)).body;
        const extraLoans=[];
        for (const [principalCents,createdAt] of [[1000000,'2001-02-01T05:30:00Z'],[500000,'2001-02-01T06:30:00Z'],[2000000,'2001-02-08T05:30:00Z']]) {
          const result=await api.post('/loans').set('Cookie',cookie).set('Origin',origin).send({...input,principalCents,firstPaymentDate:'2001-02-01',requestId:randomUUID()}).expect(201);
          // Explicit timestamptz literal: tests the actual UTC boundary independently of ORM Date serialization.
          await tx.$executeRaw`UPDATE loans SET created_at=${createdAt}::timestamptz WHERE id=${result.body.id}::uuid`;
          extraLoans.push(result.body.id);
        }
        for (const [loanIndex,amountCents,paidOn,method] of [[0,100000,'2001-01-31','CASH'],[1,50000,'2001-02-01','TRANSFER'],[2,70000,'2001-02-07','CASH'],[0,20000,'2001-02-08','OTHER']]) {
          await api.post('/payments').set('Cookie',cookie).set('Origin',origin).send({loanId:extraLoans[loanIndex],amountCents,paidOn,method,requestId:randomUUID()}).expect(201);
        }
        const report=(await getReport('DAY').expect(200)).body;
        assert.equal(report.current.principalCents-baseline.current.principalCents,2500000);
        assert.equal(report.previous.principalCents-baseline.previous.principalCents,1000000);
        assert.equal(report.current.interestCents-baseline.current.interestCents,1000000);
        assert.equal(report.current.loanCount-baseline.current.loanCount,2); checks++;
        assert.equal(report.current.collectedCents-baseline.current.collectedCents,120000);
        assert.equal(report.previous.collectedCents-baseline.previous.collectedCents,100000);
        assert.equal(report.current.paymentCount-baseline.current.paymentCount,2); checks++;
        assert.equal(report.range.previousFrom,'2001-01-25');
        assert.equal(report.range.previousTo,'2001-01-31');
        assert.equal(report.series.length,7); checks++;
        assert.equal(report.portfolio.outstandingCents-baseline.portfolio.outstandingCents,4660000);
        assert.equal(report.portfolio.overdueCents-baseline.portfolio.overdueCents,4660000); checks++;
        assert.equal(report.portfolio.outstandingCents,report.portfolio.overdueCents+report.portfolio.dueTodayCents+report.portfolio.upcomingCents);
        assert.equal(report.aging.reduce((sum,row)=>sum+row.amountCents,0),report.portfolio.overdueCents); checks++;
        assert.equal(report.methods.reduce((sum,row)=>sum+row.amountCents,0),report.current.collectedCents);
        assert.equal(report.methods.find(r=>r.method==='TRANSFER').amountCents-baseline.methods.find(r=>r.method==='TRANSFER').amountCents,50000); checks++;
        const responsible=report.responsibles.find(row=>row.id===user.id);
        assert.equal(responsible.amountCents,120000); assert.equal(responsible.count,2); checks++;
        for (const group of ['WEEK','MONTH']) {
          const grouped=(await getReport(group).expect(200)).body;
          assert.deepEqual(grouped.current,report.current);
          assert.equal(grouped.series.reduce((sum,row)=>sum+row.principalCents,0),report.current.principalCents);
          assert.equal(grouped.series.reduce((sum,row)=>sum+row.collectedCents,0),report.current.collectedCents); checks++;
        }
        const currentReport=(await api.get('/reports').set('Cookie',cookie).expect(200)).body;
        assert.deepEqual(currentReport.portfolio,report.portfolio); checks++;
        const collections=(await api.get('/collections?status=ALL').set('Cookie',cookie).expect(200)).body;
        assert.equal(collections.summary.overdueCents,report.portfolio.overdueCents);
        assert.equal(collections.summary.outstandingCents,report.portfolio.outstandingCents); checks++;
        for (const role of ['COLLECTOR','VIEWER']) {
          await tx.user.update({where:{id:user.id},data:{role}});
          await getReport('DAY').expect(200); checks++;
        }
        await tx.user.update({where:{id:user.id},data:{role:'ADMIN'}});
        await tx.client.update({ where: { id: client.id }, data: { isActive: false } });
        await api.post('/loans').set('Cookie', cookie).set('Origin', origin).send({ ...input, requestId: randomUUID() }).expect(400); checks++;
        assert.equal(await tx.loan.count({ where: { clientId: client.id } }), 4);
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
