const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { StudentsService } = require('../dist/src/students/students.service');

const admin = { userId: 'qa-admin-delete', username: 'qa-admin', roles: ['ADMIN'] };

(async () => {
  if (!process.env.DATABASE_URL?.includes('_test')) throw Error('Isolated test database required');
  const db = new PrismaClient();
  const removed = [];
  const service = new StudentsService(db, { removeStoredFiles: async keys => { removed.push(...keys); } });
  const tag = 'QA-DEL-' + randomUUID().slice(0, 8);
  let parentId, yearId, classId, studentId;
  try {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } }) || await db.academicYear.create({ data: { name: tag, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') } });
    yearId = year.name === tag ? year.id : null;
    const classroom = await db.classroom.create({ data: { name: tag, level: 'CP', academicYearId: year.id } }); classId = classroom.id;
    const parent = await db.parent.create({ data: { firstName: 'Parent', lastName: tag, phone: '77 700 00 01' } }); parentId = parent.id;
    const student = await db.student.create({ data: { matricule: tag, firstName: 'Supprimé', lastName: tag, dateOfBirth: new Date('2018-01-01'), gender: 'MALE', parentId: parent.id,
      guardians: { create: { parentId: parent.id, relation: 'Père', isPrimary: true } }, enrollments: { create: { classroomId: classroom.id, academicYearId: year.id } } } });
    studentId = student.id;
    // A full history: invoice, payment, refund (Restrict), departure (Restrict), plan, grade, attendance, document.
    const invoice = await db.invoice.create({ data: { invoiceNumber: tag, studentId, academicYearId: year.id, title: 'Inscription', amount: 50000, paidAmount: 20000, balance: 30000, dueDate: new Date() } });
    const payment = await db.payment.create({ data: { paymentNumber: tag, invoiceId: invoice.id, amount: 20000 } });
    await db.refund.create({ data: { refundNumber: tag, paymentId: payment.id, amount: 5000, refundedOn: new Date('2026-11-01'), paymentMethod: 'CASH', reason: 'QA', recipient: 'Parent', mode: 'PARTIAL', requestKey: randomUUID(), actorId: 'a', actorName: 'a', actorRole: 'ADMIN' } });
    await db.studentDeparture.create({ data: { studentId, departedOn: new Date('2026-11-02'), reason: 'QA', requestKey: randomUUID(), actorId: 'a', actorName: 'a', actorRole: 'ADMIN' } });
    await db.paymentInstallment.create({ data: { invoiceId: invoice.id, dueDate: new Date(), amount: 30000, basePaidAmount: 20000 } });
    await db.attendance.create({ data: { studentId, classroomId: classroom.id, date: new Date('2026-11-03'), status: 'ABSENT' } });
    await db.studentDocument.create({ data: { studentId, category: 'BIRTH_CERTIFICATE', originalName: 'a.pdf', mimeType: 'application/pdf', size: 1, storageKey: tag + '.pdf' } });

    await assert.rejects(service.remove(studentId, { confirmMatricule: 'WRONG', reason: 'Doublon créé par erreur' }, admin), /ne correspond pas/);
    assert.ok(await db.student.findUnique({ where: { id: studentId } }), 'nothing is deleted after a wrong confirmation');

    await service.remove(studentId, { confirmMatricule: tag, reason: 'Doublon créé par erreur' }, admin);
    assert.equal(await db.student.count({ where: { id: studentId } }), 0);
    assert.equal(await db.invoice.count({ where: { studentId } }), 0);
    assert.equal(await db.payment.count({ where: { invoiceId: invoice.id } }), 0);
    assert.equal(await db.refund.count({ where: { paymentId: payment.id } }), 0);
    assert.equal(await db.paymentInstallment.count({ where: { invoiceId: invoice.id } }), 0);
    assert.equal(await db.attendance.count({ where: { studentId } }), 0);
    assert.ok(await db.parent.findUnique({ where: { id: parentId } }), 'parent records are kept');
    assert.deepEqual(removed, [tag + '.pdf']);
    const audit = await db.businessAudit.findFirst({ where: { entityId: studentId, action: 'STUDENT_DELETED' } });
    assert.equal(JSON.parse(audit.details).totalPaidRemoved, 20000);
    console.log('PASS: administrator deletion removes the full history, keeps parents and leaves an audit summary');
  } finally {
    await db.businessAudit.deleteMany({ where: { actorId: admin.userId } });
    if (studentId) await db.student.deleteMany({ where: { id: studentId } }).catch(() => undefined);
    if (parentId) await db.parent.deleteMany({ where: { id: parentId } });
    if (classId) await db.classroom.deleteMany({ where: { id: classId } });
    if (yearId) await db.academicYear.deleteMany({ where: { id: yearId } });
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exit(1); });
