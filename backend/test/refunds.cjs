const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { RefundsService } = require('../dist/src/finances/refunds.service');
const { FinancesService } = require('../dist/src/finances/finances.service');
const { FinanceControlService } = require('../dist/src/finances/finance-control.service');
const { DashboardService } = require('../dist/src/dashboard/dashboard.service');
const { StudentsService } = require('../dist/src/students/students.service');
(async()=>{
 const url = new URL(process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && ['/as_sakina_test2','/ci_test'].includes(url.pathname),'Dedicated local test database required');
 const db = new PrismaClient(), prefix='refund-test-'+randomUUID();
 const actor={userId:prefix,username:'Refund QA',roles:['ADMIN']};
 const service = new RefundsService(db), finances = new FinancesService(db), control = new FinanceControlService(db), students = new StudentsService(db,{});
 const today = new Date().toISOString().slice(0,10), yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
 let year, room, parent, student, invoice, payment;
 try {
  year=await db.academicYear.create({data:{name:prefix,startDate:new Date('2026-09-01'),endDate:new Date('2027-08-31')}});
  room=await db.classroom.create({data:{name:prefix,level:'PETITE_SECTION',academicYearId:year.id,registrationFee:50000,monthlyTuition:15000}});
  parent=await db.parent.create({data:{firstName:'Parent',lastName:prefix,phone:'770000000'}});
  student=await db.student.create({data:{matricule:prefix,firstName:'Test',lastName:prefix,dateOfBirth:new Date('2022-01-01'),gender:'FEMALE',parentId:parent.id}});
  await db.enrollment.create({data:{studentId:student.id,classroomId:room.id,academicYearId:year.id}});
  invoice=await db.invoice.create({data:{invoiceNumber:prefix,studentId:student.id,academicYearId:year.id,title:'Inscription test',amount:60000,paidAmount:60000,balance:0,status:'PAID',dueDate:new Date(),type:'REGISTRATION'}});
  payment=await db.payment.create({data:{paymentNumber:prefix,invoiceId:invoice.id,amount:60000,paymentDate:new Date(yesterday+'T10:00:00Z'),paymentMethod:'CASH'}});
  const originalInvoice=JSON.stringify(await db.invoice.findUnique({where:{id:invoice.id}})), originalPayment=JSON.stringify(await db.payment.findUnique({where:{id:payment.id}}));
  const base={paymentId:payment.id,amount:40000,expectedRefundedAmount:0,refundedOn:today,paymentMethod:'CASH',recipient:'Parent test',reason:'Remboursement partiel après départ',mode:'ALREADY_PAID_REGULARIZATION',requestKey:randomUUID()};
  await assert.rejects(()=>service.create(base,{...actor,roles:['DIRECTEUR']}));
  const first=await service.create(base,actor);
  const repeat=await service.create(base,actor);assert.equal(repeat.id,first.id);
  assert.equal(await db.refund.count({where:{paymentId:payment.id}}),1);
  await assert.rejects(()=>service.create({...base,amount:20000},actor));
  await assert.rejects(()=>service.create({...base,requestKey:randomUUID()},actor)); // stale expected refunded
  await assert.rejects(()=>service.create({...base,requestKey:randomUUID(),amount:20001,expectedRefundedAmount:40000},actor));
  await assert.rejects(()=>service.create({...base,requestKey:randomUUID(),amount:0},actor));
  await assert.rejects(()=>service.create({...base,requestKey:randomUUID(),amount:1.5},actor));
  const concurrent=await Promise.allSettled([1,2].map(()=>service.create({...base,requestKey:randomUUID(),amount:20000,expectedRefundedAmount:40000},actor)));
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(concurrent.filter(x=>x.status==='rejected').length,1);
  const amounts=await service.payments(student.id);assert.equal(amounts[0].refundableAmount,0);assert.equal(amounts[0].refundedAmount,60000);
  assert.equal(JSON.stringify(await db.invoice.findUnique({where:{id:invoice.id}})),originalInvoice);
  assert.equal(JSON.stringify(await db.payment.findUnique({where:{id:payment.id}})),originalPayment);
  await assert.rejects(()=>control.correctPayment(payment.id,{amount:40000,expectedAmount:60000,expectedPaidAmount:60000,reason:'Une correction devenue interdite'},actor));
  await assert.rejects(()=>control.cancelPayment(payment.id,'Une annulation devenue interdite',actor));
  await assert.rejects(()=>db.payment.delete({where:{id:payment.id}})); // FK RESTRICT retains originals
  const stats=await finances.getFinancialStats(year.id);assert.equal(stats.grossCollected,60000);assert.equal(stats.totalRefunded,60000);assert.equal(stats.totalCollected,0);assert.equal(stats.totalOutstanding,0);
  const preview=await control.preview(today);assert.equal(preview.gross-preview.totalRefunded,preview.total);
  assert.equal(preview.expectedCash,(preview.byMethod.CASH||0)-(preview.refundedByMethod.CASH||0));
  const dash=await new DashboardService(db).getSummary({mode:'date',start:today});
  assert.equal(dash.collection.total,dash.collection.gross-dash.collection.refunds);
  assert.ok(dash.collection.refunds>=60000);
  const unpaid=await db.invoice.create({data:{invoiceNumber:prefix+'-due',studentId:student.id,academicYearId:year.id,title:'Autre somme due',amount:10000,paidAmount:0,balance:10000,dueDate:new Date()}});
  const departData={departedOn:today,reason:'Départ confirmé par le responsable',requestKey:randomUUID()};
  const departure=await service.depart(student.id,departData,actor);assert.equal((await service.depart(student.id,departData,actor)).id,departure.id);
  await assert.rejects(()=>service.depart(student.id,{...departData,requestKey:randomUUID()},actor));
  assert.equal((await db.student.findUnique({where:{id:student.id}})).status,'INACTIVE');
  assert.equal((await db.invoice.findUnique({where:{id:unpaid.id}})).balance,10000);
  await assert.rejects(()=>students.enroll({studentId:student.id,classroomId:room.id,academicYearId:year.id},actor));
  await assert.rejects(()=>students.update(student.id,{status:'ACTIVE'},actor));
  await assert.rejects(()=>students.remove(student.id));
  assert.equal((await db.studentDeparture.findMany({where:{studentId:student.id}})).length,1);
  assert.equal(await db.businessAudit.count({where:{actorId:actor.userId,action:'REFUND_RECORDED'}}),2);
  assert.equal(await db.businessAudit.count({where:{actorId:actor.userId,action:'STUDENT_DEPARTED'}}),1);
  await db.cashClosing.create({data:{day:'2020-01-01',expectedCash:0,countedCash:0,difference:0,summary:'{}',actorId:prefix,actorName:'QA',actorRole:'ADMIN'}});
  await assert.rejects(()=>service.create({...base,requestKey:randomUUID(),refundedOn:'2020-01-01',amount:1,expectedRefundedAmount:60000},actor), /clôturée/);
  // cash-day protection is exercised without editing an existing real closure.
  const tuition = await finances.generateTuitionInvoicesForClass({classroomId:room.id,billingMonth:today.slice(0,7),dueDate:today},actor);assert.equal(tuition.createdCount,0);
  console.log('PASS refunds: permissions, partial/full, idempotent retry, stale amount, overshoot, concurrent requests, immutable originals, protected corrections/deletes, net/year/day/cash stats, departure, retained debt, audit');
 } finally {
  if(payment)await db.refund.deleteMany({where:{paymentId:payment.id}});
  if(student) {await db.studentDeparture.deleteMany({where:{studentId:student.id}});await db.student.delete({where:{id:student.id}});}
  if(parent)await db.parent.delete({where:{id:parent.id}});
  if(room)await db.classroom.delete({where:{id:room.id}});
  if(year)await db.academicYear.delete({where:{id:year.id}});
  await db.businessAudit.deleteMany({where:{actorId:prefix}});await db.cashClosing.deleteMany({where:{actorId:prefix}});await db.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
