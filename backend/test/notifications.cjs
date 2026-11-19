const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { NotificationsService } = require('../dist/src/notifications/notifications.service');

const actor = { userId: 'qa-whatsapp', username: 'qa-secretariat', roles: ['COMPTABLE'] };

(async () => {
  if (!process.env.DATABASE_URL?.includes('_test')) throw Error('Isolated test database required');
  const db = new PrismaClient();
  const service = new NotificationsService(db);
  const tag = 'QA-WA-' + randomUUID().slice(0, 8);
  const created = { students: [], parents: [], years: [], classes: [], invoices: [], attendances: [] };
  try {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } })
      || await db.academicYear.create({ data: { name: tag, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31'), isCurrent: true } });
    if (year.name === tag) created.years.push(year.id);
    const classroom = await db.classroom.create({ data: { name: tag, level: 'CP', academicYearId: year.id } });
    created.classes.push(classroom.id);
    const father = await db.parent.create({ data: { firstName: 'Père', lastName: tag, phone: '77 900 00 01' } });
    const mother = await db.parent.create({ data: { firstName: 'Mère', lastName: tag, phone: '33 820 00 00', whatsappPhone: '+221 78 900 00 02' } });
    const refusing = await db.parent.create({ data: { firstName: 'Oncle', lastName: tag, phone: '76 900 00 03', whatsappOptOut: true } });
    created.parents.push(father.id, mother.id, refusing.id);
    const student = await db.student.create({ data: { matricule: tag, firstName: 'Awa', lastName: tag, dateOfBirth: new Date('2018-01-01'), gender: 'FEMALE', parentId: father.id,
      guardians: { create: [{ parentId: father.id, relation: 'Père', isPrimary: true }, { parentId: mother.id, relation: 'Mère' }, { parentId: refusing.id, relation: 'Oncle' }] },
      enrollments: { create: { classroomId: classroom.id, academicYearId: year.id } } } });
    created.students.push(student.id);

    // Absences of the day: one entry per absent pupil, one link per reachable parent.
    const day = '2026-11-18';
    const absence = await db.attendance.create({ data: { studentId: student.id, classroomId: classroom.id, date: new Date(day + 'T00:00:00Z'), status: 'ABSENT' } });
    created.attendances.push(absence.id);
    const absences = (await service.absences(day)).filter(row => row.studentId === student.id);
    assert.equal(absences.length, 1);
    assert.deepEqual(absences[0].recipients.map(r => r.phone).sort(), ['221779000001', '221789000002']);
    assert.match(decodeURIComponent(absences[0].recipients[0].url), /Awa .* est absent\(e\) ce 18\/11\/2026/);

    // Opening a link is logged, then shown as already contacted; reopening counts.
    const target = absences[0].recipients[0];
    await service.logOpened({ kind: 'ABSENCE', referenceId: absence.id, phone: target.phone, studentId: student.id, parentId: target.parentId, message: absences[0].text }, actor);
    await service.logOpened({ kind: 'ABSENCE', referenceId: absence.id, phone: target.phone, studentId: student.id, parentId: target.parentId, message: absences[0].text }, actor);
    const again = (await service.absences(day)).find(row => row.studentId === student.id);
    const contacted = again.recipients.find(r => r.phone === target.phone);
    assert.equal(contacted.openCount, 2);
    assert.equal(contacted.lastOpenedBy, 'qa-secretariat');

    // Reminder only for an unpaid invoice.
    const invoice = await db.invoice.create({ data: { invoiceNumber: tag, studentId: student.id, academicYearId: year.id, title: 'Scolarité novembre', amount: 25000, balance: 25000, dueDate: new Date('2026-11-05') } });
    created.invoices.push(invoice.id);
    const reminder = await service.reminder(invoice.id);
    assert.match(reminder.text, /25 000 F CFA reste à régler pour Awa/);
    assert.equal(reminder.recipients.length, 2);

    // Announcement to a class: one link per phone, pupils without a number listed.
    const announcement = await service.announcement({ audience: 'CLASS', classroomId: classroom.id, message: 'Réunion des parents samedi à 10 h.' });
    assert.equal(announcement.recipients.length, 2);
    assert.equal(announcement.skippedCount, 0);
    assert.ok((await service.journal({ studentId: student.id })).length === 1);
    console.log('PASS: WhatsApp links reach each parent once, skip refusals and landlines, and log who contacted whom');
  } finally {
    await db.whatsAppMessageLog.deleteMany({ where: { actorId: actor.userId } });
    await db.invoice.deleteMany({ where: { id: { in: created.invoices } } });
    await db.attendance.deleteMany({ where: { id: { in: created.attendances } } });
    await db.student.deleteMany({ where: { id: { in: created.students } } });
    await db.parent.deleteMany({ where: { id: { in: created.parents } } });
    await db.classroom.deleteMany({ where: { id: { in: created.classes } } });
    await db.academicYear.deleteMany({ where: { id: { in: created.years } } });
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exit(1); });
