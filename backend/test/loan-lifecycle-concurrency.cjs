/* Real concurrent transactions on disposable fixture IDs; cleanup never touches user records. */
require('dotenv/config');
const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {PrismaService}=require('../dist/database/prisma.service');const {LoansService}=require('../dist/loans/loans.service');const {PaymentsService}=require('../dist/payments/payments.service');const {businessDate}=require('../dist/payments/payment-allocation');
(async()=>{const db=new PrismaService();const userId=randomUUID(),clientId=randomUUID();let loanId;await db.$connect();
try{
 await db.user.create({data:{id:userId,fullName:'Prueba temporal concurrencia',email:userId+'@example.invalid',passwordHash:'not-a-login-account',role:'ADMIN'}});
 await db.client.create({data:{id:clientId,fullName:'Prueba temporal concurrencia',phone:'0000000000',address:'Ficticio',createdById:userId}});
 const loans=new LoansService(db),payments=new PaymentsService(db);const today=businessDate();
 let loan=await loans.create({clientId,requestId:randomUUID(),principalCents:10000,firstPaymentDate:today,interestBps:0,installmentCount:2},userId);loanId=loan.id;
 const edit={principalCents:12000,firstPaymentDate:today,interestBps:0,installmentCount:2,version:loan.version};
 const pay=()=>payments.create({loanId,requestId:randomUUID(),amountCents:1000,paidOn:today,method:'CASH'},userId);
 const results=await Promise.allSettled([loans.update(loanId,edit,userId),pay()]);
 assert.equal(results[1].status,'fulfilled');if(results[0].status==='rejected')assert.equal(results[0].reason.getStatus(),409);
 loan=await loans.findOne(loanId);assert.equal(loan.paidCents,1000);assert.equal(loan.balanceCents,loan.totalCents-1000);
 assert.equal(loan.installments.reduce((s,i)=>s+i.amountCents,0),loan.totalCents);
 const race=await Promise.allSettled([loans.archive(loanId,loan.version,userId),pay()]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(race.find(r=>r.status==='rejected').reason.getStatus(),409);
 const final=await loans.findOne(loanId);assert.equal(final.paidCents,race[1].status==='fulfilled'?2000:1000);
 assert.equal(final.status,race[0].status==='fulfilled'?'CANCELLED':'ACTIVE');
 console.log('Concurrent edit/payment and delete/payment preserve balances, allocations and version checks.');
}finally{
 if(loanId){await db.paymentAllocation.deleteMany({where:{payment:{loanId}}});await db.payment.deleteMany({where:{loanId}});await db.loanRevision.deleteMany({where:{loanId}});await db.loanInstallment.deleteMany({where:{loanId}});await db.loan.deleteMany({where:{id:loanId}});}
 await db.client.deleteMany({where:{id:clientId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();
}})().catch(e=>{console.error(e.message);process.exitCode=1;});
