/* Run from backend after building: node test/administration-db-smoke.cjs
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
      const provider = { appSettings: tx.appSettings, user: tx.user, client: tx.client, loan: tx.loan, session: tx.session, $transaction: async op => typeof op === 'function' ? op(tx) : Promise.all(op) };
      const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(provider).compile();
      const app = module.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
      const api = request(app.getHttpServer());
      const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
      const cookie = `prestamos_session=${token}`;

      try {
        const password = randomBytes(24).toString('hex');
        const email = randomUUID()+'@example.invalid';
        const post = (path,body) => api.post(path).set('Cookie',cookie).set('Origin',origin).send(body);
        const patch = (target,body) => api.patch('/users/'+target).set('Cookie',cookie).set('Origin',origin).send(body);
        const getSettings = () => api.get('/settings').set('Cookie',cookie).expect(200);
        const putSettings = body => api.put('/settings').set('Cookie',cookie).set('Origin',origin).send(body);
        const login = async (mail,pass) => { const r=await api.post('/auth/login').set('Origin',origin).send({email:mail,password:pass}).expect(200);return r.headers['set-cookie'][0].split(';')[0]; };
        const edit = (u,extra={}) => ({fullName:u.fullName,email:u.email,role:u.role,isActive:u.isActive,version:u.version,...extra});
        await api.get('/users').expect(401);await api.get('/settings').expect(401);checks+=2;
        await post('/users',{fullName:'Prueba',email,role:'VIEWER',password:'short'}).expect(400);checks++;
        await post('/users',{fullName:'Prueba',email,role:'OWNER',password}).expect(400);checks++;
        let created=(await post('/users',{fullName:'Operador de prueba',email:email.toUpperCase(),role:'COLLECTOR',password}).expect(201)).body;
        assert.equal(created.email,email);assert.equal(created.role,'COLLECTOR');assert.equal(created.isActive,true);assert.equal(created.passwordHash,undefined);assert.equal(created.password,undefined);checks++;
        const stored=await tx.user.findUnique({where:{id:created.id}});assert.notEqual(stored.passwordHash,password);assert.ok(stored.passwordHash.startsWith('$argon2id$'));checks++;
        const listing=(await api.get('/users?search='+encodeURIComponent(email)).set('Cookie',cookie).expect(200)).body;
        assert.equal(listing.items.length,1);assert.equal(listing.items[0].passwordHash,undefined);checks++;
        let guestCookie=await login(email,password);checks++;
        for(const path of ['/users','/settings']) {await api.get(path).set('Cookie',guestCookie).expect(403);checks++;}
        await api.get('/settings/branding').set('Cookie',guestCookie).expect(200);checks++;
        await api.put('/settings').set('Cookie',guestCookie).set('Origin',origin).send({}).expect(403);checks++;
        await api.post('/users').set('Cookie',guestCookie).set('Origin',origin).send({}).expect(403);checks++;
        await api.delete('/users/'+created.id).set('Cookie',guestCookie).set('Origin',origin).send({version:created.version}).expect(403);checks++;
        await api.patch('/users/'+created.id).set('Cookie',guestCookie).set('Origin',origin).send({}).expect(403);checks++;
        await api.patch('/users/'+created.id).set('Cookie',cookie).set('Origin','https://invalid.example').send(edit(created)).expect(403);checks++;
        created=(await patch(created.id,edit(created,{role:'VIEWER'})).expect(200)).body;
        await api.get('/auth/me').set('Cookie',guestCookie).expect(401);checks++;
        guestCookie=await login(email,password);
        await api.delete('/users/'+created.id).set('Cookie',guestCookie).set('Origin',origin).send({version:created.version}).expect(403);checks++;
        await api.post('/payments').set('Cookie',guestCookie).set('Origin',origin).send({}).expect(403);checks++;
        await patch(created.id,edit(created,{version:created.version-1})).expect(409);checks++;
        const newPassword=randomBytes(24).toString('hex');
        created=(await patch(created.id,edit(created,{password:newPassword})).expect(200)).body;
        await api.get('/auth/me').set('Cookie',guestCookie).expect(401);
        await api.post('/auth/login').set('Origin',origin).send({email,password}).expect(401);checks++;
        guestCookie=await login(email,newPassword);checks++;
        created=(await patch(created.id,edit(created,{isActive:false})).expect(200)).body;
        await api.get('/auth/me').set('Cookie',guestCookie).expect(401);
        await api.post('/auth/login').set('Origin',origin).send({email,password:newPassword}).expect(401);checks++;
        created=(await patch(created.id,edit(created,{isActive:true,role:'ADMIN'})).expect(200)).body;
        const restored=await login(email,newPassword);
        await api.get('/users').set('Cookie',restored).expect(200);checks++;
        const self={fullName:user.fullName,email:user.email,role:'ADMIN',isActive:true,version:1};
        await patch(user.id,{...self,role:'VIEWER'}).expect(400);
        await patch(user.id,{...self,isActive:false}).expect(400);checks+=2;
        const originalLoan=(await post('/loans',{principalCents:1000000,firstPaymentDate:'2026-09-22',interestBps:4000,installmentCount:14,clientId:client.id,requestId:randomUUID()}).expect(201)).body;
        const originalSettings=(await getSettings()).body;
        const {id:settingsId,...values}=originalSettings;assert.equal(settingsId,1);
        await putSettings({...values,businessPhone:null}).expect(400);checks++;
        await putSettings({...values,receiptFooter:'x'.repeat(301)}).expect(400);checks++;
        await putSettings({...values,interestBps:-1}).expect(400);checks++;
        await putSettings({...values,frequency:'CUSTOM'}).expect(400);checks++;
        await putSettings({...values,firstPaymentAfterDays:null}).expect(400);checks++;
        const wanted={...values,businessName:'Negocio de prueba temporal',businessPhone:'5555555555',businessAddress:'Dirección de prueba',receiptFooter:'Gracias por su puntualidad.',interestBps:2000,installmentCount:12,frequency:'MONTHLY',firstPaymentAfterDays:15};
        const updated=(await putSettings(wanted).expect(200)).body;
        assert.equal(updated.businessPhone,wanted.businessPhone);assert.equal(updated.businessAddress,wanted.businessAddress);assert.equal(updated.receiptFooter,wanted.receiptFooter);checks++;
        assert.equal(updated.version,values.version+1);assert.equal(updated.interestBps,2000);assert.equal((await getSettings()).body.businessName,wanted.businessName);checks++;
        await putSettings(wanted).expect(409);checks++;
        assert.equal((await api.get('/settings/branding').set('Cookie',cookie).expect(200)).body.businessName,wanted.businessName);checks++;
        const preview=(await post('/loans/preview',{principalCents:1000000,firstPaymentDate:'2026-09-22',interestBps:updated.interestBps,installmentCount:updated.installmentCount,frequency:updated.frequency,intervalDays:updated.intervalDays}).expect(201)).body;
        assert.equal(preview.totalCents,1200000);assert.equal(preview.installments.length,12);assert.equal(preview.installments[1].dueDate,'2026-10-22');checks++;
        const unchanged=(await api.get('/loans/'+originalLoan.id).set('Cookie',cookie).expect(200)).body;
        assert.equal(unchanged.interestBps,4000);assert.equal(unchanged.totalCents,1400000);assert.equal(unchanged.installments.length,14);checks++;
        const remove=(target,version)=>api.delete('/users/'+target).set('Cookie',cookie).set('Origin',origin).send({version});
        await api.delete('/users/'+created.id).send({version:created.version}).expect(401);checks++;
        await api.delete('/users/'+created.id).set('Cookie',cookie).set('Origin','https://invalid.example').send({version:created.version}).expect(403);checks++;
        await remove(user.id,1).expect(400);checks++;
        await remove(created.id,created.version-1).expect(409);checks++;
        await remove(created.id,null).expect(400);checks++;
        await remove(randomUUID(),1).expect(404);checks++;
        const historicalClient=await tx.client.create({data:{fullName:'Historial del usuario eliminado',phone:'0000000000',address:'Ficticio',createdById:created.id}});
        await remove(created.id,created.version).expect(200);checks++;
        const deleted=await tx.user.findUniqueOrThrow({where:{id:created.id}});
        assert.ok(deleted.deletedAt);assert.equal(deleted.isActive,false);assert.equal(deleted.version,created.version+1);
        assert.equal((await tx.client.findUniqueOrThrow({where:{id:historicalClient.id}})).createdById,created.id);checks++;
        assert.equal((await api.get('/users?search='+encodeURIComponent(email)).set('Cookie',cookie).expect(200)).body.pagination.total,0);checks++;
        await api.get('/auth/me').set('Cookie',restored).expect(401);checks++;
        await api.post('/auth/login').set('Origin',origin).send({email,password:newPassword}).expect(401);checks++;
        await patch(created.id,edit({...created,version:deleted.version})).expect(404);checks++;
        await remove(created.id,deleted.version).expect(404);checks++;
        // SQL uniqueness errors abort the outer fixture transaction: keep this case last.
        await post('/users',{fullName:'Duplicado',email,role:'VIEWER',password}).expect(409);checks++;
      } finally {await app.close();}
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
