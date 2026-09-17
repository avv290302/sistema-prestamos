/* API integration tests; every fixture and mutation rolls back. */
require('dotenv/config');require('reflect-metadata');
const assert=require('node:assert/strict');const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Test}=require('@nestjs/testing');const {ValidationPipe}=require('@nestjs/common');const cookieParser=require('cookie-parser');const request=require('supertest');
const {PrismaService}=require('../dist/database/prisma.service');const {AppModule}=require('../dist/app.module');const {businessDate}=require('../dist/payments/payment-allocation');
(async()=>{const db=new PrismaService();await db.$connect();const rollback=new Error('ROLLBACK');let count=0;
try{await db.$transaction(async tx=>{
 const actor=await tx.user.create({data:{fullName:'Administrador de prueba cancelación',email:randomUUID()+'@example.invalid',passwordHash:'not-login',role:'ADMIN'}});
 const client=await tx.client.create({data:{fullName:'Cancelación '+randomUUID(),phone:'0000000000',address:'Prueba temporal',createdById:actor.id}});
 const token=randomBytes(32).toString('hex');await tx.session.create({data:{tokenHash:createHash('sha256').update(token).digest('hex'),userId:actor.id,expiresAt:new Date(Date.now()+600000)}});
 const provider={user:tx.user,session:tx.session,client:tx.client,loan:tx.loan,payment:tx.payment,appSettings:tx.appSettings,$transaction:async op=>typeof op==='function'?op(tx):Promise.all(op)};
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PrismaService).useValue(provider).compile();const app=module.createNestApplication();app.use(cookieParser());app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.init();
 try{const api=request(app.getHttpServer());const cookie='prestamos_session='+token;const origin=process.env.FRONTEND_ORIGIN??'http://localhost:5173';
 const post=(path,data)=>api.post(path).set('Cookie',cookie).set('Origin',origin).send(data);const get=path=>api.get(path).set('Cookie',cookie);
 const today=businessDate();const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);const yesterday=d.toISOString().slice(0,10);
 const loan=(await post('/loans',{requestId:randomUUID(),clientId:client.id,principalCents:100000,interestBps:0,installmentCount:2,frequency:'DAILY',firstPaymentDate:yesterday}).expect(201)).body;
 const firstInput={requestId:randomUUID(),loanId:loan.id,amountCents:30000,paidOn:today,method:'CASH'};
 const first=(await post('/payments',firstInput).expect(201)).body;
 const second=(await post('/payments',{...firstInput,requestId:randomUUID(),amountCents:70000}).expect(201)).body;
 assert.equal((await get('/loans/'+loan.id).expect(200)).body.status,'PAID');count++;
 const before=(await get('/reports?from='+today+'&to='+today).expect(200)).body;
 await api.post('/payments/'+first.id+'/cancel').send({reason:'Duplicado'}).expect(401);count++;
 await api.post('/payments/'+first.id+'/cancel').set('Cookie',cookie).set('Origin','https://invalid.example').send({reason:'Duplicado'}).expect(403);count++;
 for(const role of ['COLLECTOR','VIEWER']){await tx.user.update({where:{id:actor.id},data:{role}});await post('/payments/'+first.id+'/cancel',{reason:'Duplicado'}).expect(403);await get('/payments/'+first.id).expect(200);count+=2;}
 await tx.user.update({where:{id:actor.id},data:{role:'ADMIN'}});
 for(const reason of ['',null,'  ','x'.repeat(501)]){await post('/payments/'+first.id+'/cancel',{reason}).expect(400);count++;}
 await post('/payments/'+randomUUID()+'/cancel',{reason:'Duplicado'}).expect(404);count++;
 const cancelled=(await post('/payments/'+first.id+'/cancel',{reason:'  Registro duplicado  '}).expect(201)).body;
 assert.ok(cancelled.cancelledAt);assert.equal(cancelled.cancelledById,actor.id);assert.equal(cancelled.cancelledByName,actor.fullName);assert.equal(cancelled.cancellationReason,'Registro duplicado');assert.deepEqual(cancelled.receiptSnapshot,first.receiptSnapshot);assert.deepEqual(cancelled.allocations,first.allocations);count++;
 const after=(await get('/loans/'+loan.id).expect(200)).body;
 assert.equal(after.balanceCents,30000);assert.equal(after.paidCents,70000);assert.equal(after.status,'ACTIVE');assert.equal(after.installments[0].paidCents,20000);assert.equal(after.installments[1].paidCents,50000);count++;
 await post('/payments/'+first.id+'/cancel',{reason:'Registro duplicado'}).expect(201);assert.equal((await get('/loans/'+loan.id)).body.version,after.version);count++;
 await post('/payments/'+first.id+'/cancel',{reason:'Otro motivo'}).expect(409);await post('/payments',firstInput).expect(409);count+=2;
 const reports=(await get('/reports?from='+today+'&to='+today).expect(200)).body;
 assert.equal(reports.methods.find(m=>m.method==='CASH').amountCents,before.methods.find(m=>m.method==='CASH').amountCents-30000);assert.equal(reports.portfolio.outstandingCents,before.portfolio.outstandingCents+30000);count++;
 const collections=(await get('/collections?search='+encodeURIComponent(client.fullName)).expect(200)).body;assert.equal(collections.summary.outstandingCents,30000);assert.equal(collections.items[0].balanceCents,30000);count++;
 const risk=(await get('/clients/'+client.id).expect(200)).body.risk;assert.equal(risk.overdueCents,30000);assert.equal(risk.currentDays,1);count++;
 assert.deepEqual((await get('/payments/'+second.id)).body.receiptSnapshot,second.receiptSnapshot);count++;
 assert.equal((await get('/payments?status=CANCELLED&search='+first.id+'&from='+today+'&to='+today).expect(200)).body.pagination.total,1);count++;
 assert.equal((await get('/payments?status=ACTIVE&loanId='+loan.id).expect(200)).body.pagination.total,1);count++;
 await get('/payments?from=2026-02-30').expect(400);await get('/payments?from='+today+'&to='+yesterday).expect(400);count+=2;
 const pdf=await get('/payments/'+first.id+'/receipt.pdf').expect(200);assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');count++;
 const replacement=(await post('/payments',{...firstInput,requestId:randomUUID()}).expect(201)).body;assert.equal(replacement.receiptSnapshot.balanceBeforeCents,30000);assert.equal(replacement.receiptSnapshot.balanceAfterCents,0);assert.equal(replacement.allocations[0].installment.number,1);count++;
 assert.equal((await get('/loans/'+loan.id)).body.status,'PAID');count++;
 await tx.loan.update({where:{id:loan.id},data:{deletedAt:new Date()}});await post('/payments/'+replacement.id+'/cancel',{reason:'Importe incorrecto'}).expect(201);assert.equal((await get('/loans/'+loan.id)).body.balanceCents,30000);count++;
 }finally{await app.close();}throw rollback;
},{timeout:90000});}catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}console.log(count+' cancellation/receipt API checks passed; all changes rolled back.');})().catch(e=>{console.error(e);process.exitCode=1;});
