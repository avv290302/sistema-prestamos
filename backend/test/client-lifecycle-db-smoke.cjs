/* Run from backend after building: node test/client-lifecycle-db-smoke.cjs
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
      const token = randomBytes(32).toString('hex');
      await tx.session.create({ data: { tokenHash: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: new Date(Date.now() + 600000) } });
      const provider = { clientDocument:tx.clientDocument, user: tx.user, client: tx.client, loan: tx.loan, session: tx.session, $transaction: async op => typeof op === 'function' ? op(tx) : Promise.all(op) };
      const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(provider).compile();
      const app = module.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
      const api = request(app.getHttpServer());
      const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
      const cookie = `prestamos_session=${token}`;

      try {
        const today=businessDate();const day=n=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
        const post=(path,body)=>api.post(path).set('Cookie',cookie).set('Origin',origin).send(body);
        const patch=(path,body)=>api.patch(path).set('Cookie',cookie).set('Origin',origin).send(body);
        const del=(path,version)=>api.delete(path).set('Cookie',cookie).set('Origin',origin).send({version});
        const get=path=>api.get(path).set('Cookie',cookie).expect(200);
        const details=c=>({fullName:c.fullName,phone:c.phone,address:c.address,notes:c.notes??'',referenceName:c.referenceName??'',referencePhone:c.referencePhone??'',isActive:c.isActive,version:c.version});
        let c=(await post('/clients',{fullName:'Expediente '+randomUUID(),phone:'5555555555',address:'Prueba',notes:'Nota inicial'}).expect(201)).body;
        const clientId=c.id;assert.equal(c.risk.color,'GRAY');checks++;
        c=(await patch('/clients/'+clientId,{...details(c),fullName:'Nombre actualizado',notes:''}).expect(200)).body;
        assert.equal(c.fullName,'Nombre actualizado');assert.equal(c.notes,null);checks++;
        await patch('/clients/'+clientId,{...details(c),version:1}).expect(409);checks++;
        const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
        const upload=(kind,buffer,type,version=c.version)=>api.post('/clients/'+clientId+'/documents/'+kind).set('Cookie',cookie).set('Origin',origin).field('version',String(version)).attach('file',buffer,{filename:'test-file',contentType:type});
        c=(await upload('PHOTO',png,'image/png').expect(201)).body;assert.equal(c.documents[0].kind,'PHOTO');assert.equal(c.documents[0].data,undefined);checks++;
        const photo=await get('/clients/'+clientId+'/documents/PHOTO');assert.equal(photo.headers['cache-control'],'no-store');assert.equal(photo.headers['x-content-type-options'],'nosniff');assert.deepEqual(photo.body,png);checks++;
        const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
        c=(await upload('INE',pdf,'application/pdf').expect(201)).body;assert.equal(c.documents.length,2);checks++;
        const ine=await get('/clients/'+clientId+'/documents/INE');assert.ok(ine.headers['content-disposition'].startsWith('attachment'));checks++;
        await upload('PHOTO',pdf,'application/pdf').expect(400);await upload('PHOTO',Buffer.from('<svg/>'),'image/png').expect(400);await upload('PHOTO',png,'image/png',1).expect(409);checks+=3;
        await upload('INE',Buffer.alloc(5242881),'application/pdf').expect(413);checks++;
        await api.get('/clients/'+clientId+'/documents/INE').expect(401);checks++;
        const input={clientId,requestId:randomUUID(),principalCents:10000,interestBps:0,installmentCount:2,frequency:'CUSTOM',firstPaymentDate:day(-5),customInstallments:[{dueDate:day(-5),amountCents:5000},{dueDate:day(2),amountCents:5000}]};
        let loan=(await post('/loans',input).expect(201)).body;
        const pay=amount=>post('/payments',{loanId:loan.id,requestId:randomUUID(),amountCents:amount,paidOn:today,method:'CASH'});
        c=(await get('/clients/'+clientId)).body;assert.equal(c.risk.color,'YELLOW');assert.equal(c.risk.currentDays,5);checks++;
        await pay(2500).expect(201);c=(await get('/clients/'+clientId)).body;assert.equal(c.risk.overdueCents,2500);assert.equal(c.risk.currentDays,5);checks++;
        await pay(2500).expect(201);c=(await get('/clients/'+clientId)).body;assert.equal(c.risk.currentDays,0);assert.equal(c.risk.historyDays,5);assert.equal(c.risk.color,'YELLOW');checks++;
        const {clientId:ignoredClient,requestId:ignoredRequest,...plan}=input;assert.ok(ignoredClient&&ignoredRequest);
        await patch('/loans/'+loan.id,{...plan,version:loan.version}).expect(409);checks++;
        loan=(await get('/loans/'+loan.id)).body;
        const version=loan.version;const paidId=loan.installments[0].id;
        const changed={...plan,interestBps:2000,customInstallments:[plan.customInstallments[0],{dueDate:day(10),amountCents:7000}],version};
        loan=(await patch('/loans/'+loan.id,changed).expect(200)).body;assert.equal(loan.totalCents,12000);assert.equal(loan.balanceCents,7000);assert.equal(loan.installments[0].id,paidId);assert.equal(loan.installments[0].paidCents,5000);checks++;
        await patch('/loans/'+loan.id,{...changed,version:loan.version,firstPaymentDate:day(-4),customInstallments:[{dueDate:day(-4),amountCents:5000},changed.customInstallments[1]]}).expect(400);checks++;
        for(const role of ['VIEWER','COLLECTOR']){
          await tx.user.update({where:{id:user.id},data:{role}});
          await get('/clients/'+clientId+'/documents/PHOTO');
          await api.get('/clients/'+clientId+'/documents/INE').set('Cookie',cookie).expect(403);
          await patch('/clients/'+clientId,details(c)).expect(403);
          await del('/clients/'+clientId,c.version).expect(403);
          await patch('/loans/'+loan.id,{...changed,version:loan.version}).expect(403);
          await del('/loans/'+loan.id,loan.version).expect(403);checks+=6;
        }
        await tx.user.update({where:{id:user.id},data:{role:'ADMIN'}});
        const before=(await get('/reports?from='+today+'&to='+today)).body;
        loan=(await del('/loans/'+loan.id,loan.version).expect(200)).body;assert.equal(loan.status,'CANCELLED');checks++;
        await pay(1).expect(409);checks++;
        const after=(await get('/reports?from='+today+'&to='+today)).body;assert.equal(before.portfolio.outstandingCents-after.portfolio.outstandingCents,7000);assert.equal(before.current.collectedCents,after.current.collectedCents);checks++;
        const hidden=(await get('/loans?search=Nombre%20actualizado')).body;assert.ok(!hidden.items.some(l=>l.id===loan.id));
        const archived=(await get('/loans?archived=true&search=Nombre%20actualizado')).body;assert.ok(archived.items.some(l=>l.id===loan.id));checks++;
        const cancelledRisk=(await get('/clients/'+clientId)).body.risk;assert.equal(cancelledRisk.historyDays,5);checks++;
        c=(await del('/clients/'+clientId,c.version).expect(200)).body;
        const directory=(await get('/clients?search=Nombre%20actualizado')).body;assert.ok(!directory.items.some(x=>x.id===clientId));
        const archivedClients=(await get('/clients?archived=true&search=Nombre%20actualizado')).body;assert.ok(archivedClients.items.some(x=>x.id===clientId));checks++;
        await post('/loans',{...input,requestId:randomUUID()}).expect(400);
        await post('/loans/'+loan.id+'/restore',{version:loan.version}).expect(400);checks+=2;
        c=(await post('/clients/'+clientId+'/restore',{version:c.version}).expect(201)).body;
        loan=(await post('/loans/'+loan.id+'/restore',{version:loan.version}).expect(201)).body;assert.equal(loan.balanceCents,7000);assert.equal(loan.status,'ACTIVE');checks++;
        assert.equal(await tx.loanRevision.count({where:{loanId:loan.id}}),3);checks++;
        c=(await del('/clients/'+clientId+'/documents/INE',c.version).expect(200)).body;assert.equal(c.documents.length,1);checks++;
        for(const [offset,paidOffset,expected] of [[-7,null,'YELLOW'],[-8,null,'RED'],[-5,-5,'GREEN'],[-10,-2,'RED'],[2,0,'GREEN'],[0,null,'GRAY'],[-100,-91,'GRAY']]){
          const other=(await post('/clients',{fullName:'Semaforo '+randomUUID(),phone:'5555555555',address:'Prueba'}).expect(201)).body;
          const l=(await post('/loans',{clientId:other.id,requestId:randomUUID(),principalCents:10000,interestBps:0,installmentCount:1,firstPaymentDate:day(offset)}).expect(201)).body;
          if(paidOffset!==null)await post('/payments',{loanId:l.id,requestId:randomUUID(),amountCents:10000,paidOn:day(paidOffset),method:'CASH'}).expect(201);
          const state=(await get('/clients/'+other.id)).body;assert.equal(state.risk.color,expected,JSON.stringify({offset,paidOffset,risk:state.risk}));checks++;
          const filtered=(await get('/clients?traffic='+expected+'&search='+encodeURIComponent(other.fullName))).body;assert.equal(filtered.items[0].id,other.id);checks++;
        }
      } finally {await app.close();}
      throw rollback;
    }, { timeout: 120000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally {
    if (userId) assert.equal(await db.user.count({ where: { id: userId } }), 0, 'Fixtures must roll back');
    await db.$disconnect();
  }
  console.log(`${checks} API/database checks passed; all fixtures rolled back.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
