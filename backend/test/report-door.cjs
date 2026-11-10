const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {PrismaClient}=require('@prisma/client');
const {RegistrationReportService}=require('../dist/src/finances/registration-report.service');
const {StaffAttendanceService}=require('../dist/src/staff-attendance/staff-attendance.service');
const {DoorBadgeService}=require('../dist/src/staff-attendance/door-badge.service');
(async()=>{
if(!process.env.DATABASE_URL?.includes('_test'))throw Error('Isolated test database required');
const db=new PrismaClient(),tag=randomUUID(),ids=[],teacherIds=[];let year,settings,door;
const actor={userId:'qa-admin',username:'QA',roles:['ADMIN']};
try{
 year=await db.academicYear.create({data:{name:'QA-'+tag,startDate:new Date('2026-09-01'),endDate:new Date('2027-07-31'),isCurrent:false}});
 const classroom=await db.classroom.create({data:{name:'QA CI '+tag,level:'CI',program:'ELEMENTARY',registrationFee:40000,monthlyTuition:15000,academicYearId:year.id}});
 const defs=[{amount:50000,paid:40000,karate:false,fullDay:false},{amount:52000,paid:52000,karate:true,fullDay:false},{amount:65000,paid:0,karate:false,fullDay:true},{amount:0,paid:0,karate:false,fullDay:false}];
 for(const [i,x] of defs.entries()){
  const s=await db.student.create({data:{matricule:'QA-'+tag+'-'+i,firstName:'Report',lastName:tag+'-'+i,gender:'FEMALE',dateOfBirth:new Date('2020-01-01'),karate:x.karate,fullDay:x.fullDay}});ids.push(s.id);
  await db.enrollment.create({data:{studentId:s.id,classroomId:classroom.id,academicYearId:year.id}});
  const invoice=await db.invoice.create({data:{studentId:s.id,academicYearId:year.id,invoiceNumber:'QA-'+tag+'-'+i,title:'QA registration',type:'REGISTRATION',amount:x.amount||90000,paidAmount:x.paid,balance:x.amount-x.paid,dueDate:new Date(),status:x.paid===x.amount?'PAID':x.paid?'PARTIAL':'UNPAID',cancelledAt:x.amount?null:new Date()}});
  if(x.paid)await db.payment.create({data:{invoiceId:invoice.id,paymentNumber:'QA-REC-'+tag+'-'+i,amount:x.paid,paymentDate:new Date(),paymentMethod:'CASH'}});
 }
 const report=new RegistrationReportService(db);
 let r=await report.report({academicYearId:year.id});assert.equal(r.rows.length,4);assert.equal(r.totals.invoiced,167000);assert.equal(r.totals.grossCollected,92000);assert.equal(r.totals.netCollected,92000);assert.equal(r.totals.outstanding,75000);assert.deepEqual(r.totals.counts,{PAID:1,PARTIAL:1,UNPAID:1,NOT_INVOICED:1});
 r=await report.report({academicYearId:year.id,fullDay:'false'});assert.equal(r.rows.length,3);assert.equal(r.totals.invoiced,102000);assert.equal(r.totals.netCollected,92000);
 r=await report.report({academicYearId:year.id,status:'OUTSTANDING'});assert.equal(r.rows.length,2);assert.equal(r.totals.outstanding,75000);
 r=await report.report({academicYearId:year.id,status:'NOT_INVOICED'});assert.equal(r.rows.length,1);assert.equal(r.totals.invoiced,0);assert.equal(r.totals.outstanding,0);
 await assert.rejects(report.report({academicYearId:year.id,fullDay:'bad'}));await assert.rejects(report.report({academicYearId:year.id,classroomId:'foreign'}));
 console.log('PASS: registration totals, full-day filter, real receipts, partial/unpaid/unbilled distinction, cancelled exclusion, year/class validation');
 settings=await db.schoolCalendarSettings.findUnique({where:{id:1}});door=await db.staffDoorBadge.findUnique({where:{id:1}});
 await db.schoolCalendarSettings.upsert({where:{id:1},update:{restDays:'',timeZone:'Africa/Dakar'},create:{id:1,restDays:'',timeZone:'Africa/Dakar'}});
 const staff=new StaffAttendanceService(db),badge=new DoorBadgeService(db,staff);
 await badge.configure({enabled:true,latitude:14.7,longitude:-17.4,radiusMeters:100},actor);
 const cfg=await badge.settings(actor);
 for(let i=0;i<2;i++){const teacher=await db.user.create({data:{email:'qa-'+tag+i+'@example.invalid',firstName:'QA',lastName:tag,keycloakId:'qa-'+tag+i,role:'ENSEIGNANT'}});teacherIds.push(teacher.id);}
 const teacher=await db.user.findUniqueOrThrow({where:{id:teacherIds[0]}}),other=await db.user.findUniqueOrThrow({where:{id:teacherIds[1]}});
 const self={userId:teacher.keycloakId,username:'QA teacher',roles:['ENSEIGNANT']};
 const body={code:'ASDOOR1:'+cfg.token,action:'arrival',latitude:14.7,longitude:-17.4,accuracy:10};
 await assert.rejects(badge.punch({...body,latitude:15},self));await assert.rejects(badge.punch({...body,accuracy:90},self));await assert.rejects(badge.punch({...body,code:'ASDOOR1:'+'0'.repeat(48)},self));
 await assert.rejects(badge.punch({...body,action:'departure'},self));assert.equal(await db.staffAttendance.count({where:{teacherId:teacher.id}}),0);
 const arrivals=await Promise.all([badge.punch(body,self),badge.punch(body,self)]);assert.deepEqual(arrivals.map(x=>x.event).sort(),['already-arrived','arrival']);
 const first=await db.staffAttendance.findFirstOrThrow({where:{teacherId:teacher.id}});assert.equal(first.checkOutAt,null);assert.equal(first.checkInById,self.userId);assert.ok(Math.abs(first.checkInAt.getTime()-Date.now())<10000);
 const personal=await staff.myCard({userId:other.keycloakId});await staff.scan(personal.code,actor,'arrival');
 const mixed=await badge.punch({...body,action:'departure'},{userId:other.keycloakId,username:'QA other',roles:['ENSEIGNANT']});assert.equal(mixed.event,'departure');assert.equal(mixed.attendance.checkInById,actor.userId);assert.equal(mixed.attendance.checkOutById,other.keycloakId);
 const departures=await Promise.all([badge.punch({...body,action:'departure'},self),badge.punch({...body,action:'departure'},self)]);assert.deepEqual(departures.map(x=>x.event).sort(),['already-complete','departure']);
 const last=await db.staffAttendance.findFirstOrThrow({where:{teacherId:teacher.id}});assert.equal(last.checkInAt.toISOString(),first.checkInAt.toISOString());assert.ok(last.checkOutAt);assert.equal(await db.staffAttendance.count({where:{teacherId:teacher.id}}),1);
 assert.equal(await db.staffAttendance.count({where:{teacherId:other.id}}),1,'Controller remains available for a different teacher');
 const rotated=await badge.configure({enabled:true,latitude:14.7,longitude:-17.4,radiusMeters:100,rotate:true},actor);await assert.rejects(badge.punch(body,self));
 await badge.configure({enabled:false,radiusMeters:100},actor);await assert.rejects(badge.punch({...body,code:'ASDOOR1:'+rotated.token},self));
 console.log('PASS: own-account arrival/departure, server time, concurrent duplicate idempotency, controller scan retained, remote/inaccurate/rotated QR refusal');
}finally{
 await db.businessAudit.deleteMany({where:{actorId:actor.userId}});
 if(settings!==undefined){if(settings)await db.schoolCalendarSettings.upsert({where:{id:1},create:settings,update:settings});else await db.schoolCalendarSettings.deleteMany({where:{id:1}});}
 if(door!==undefined){if(door)await db.staffDoorBadge.upsert({where:{id:1},create:door,update:door});else await db.staffDoorBadge.deleteMany({where:{id:1}});}
 await db.staffAttendance.deleteMany({where:{teacherId:{in:teacherIds}}});await db.staffQrCard.deleteMany({where:{teacherId:{in:teacherIds}}});await db.user.deleteMany({where:{id:{in:teacherIds}}});
 await db.invoice.deleteMany({where:{studentId:{in:ids}}});await db.enrollment.deleteMany({where:{studentId:{in:ids}}});await db.student.deleteMany({where:{id:{in:ids}}});if(year){await db.classroom.deleteMany({where:{academicYearId:year.id}});await db.academicYear.delete({where:{id:year.id}});}await db.$disconnect();
}
})().catch(e=>{console.error(e);process.exit(1)});
