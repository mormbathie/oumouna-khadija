const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { BoardingService } = require('../dist/src/boarding/boarding.service');

const actor = { userId: 'qa-boarding', username: 'qa-surveillant', roles: ['SURVEILLANT_INTERNAT'] };

(async () => {
  if (!process.env.DATABASE_URL?.includes('_test')) throw Error('Isolated test database required');
  const db = new PrismaClient();
  const service = new BoardingService(db);
  const tag = 'QA-INT-' + randomUUID().slice(0, 8);
  const ids = { students: [], classes: [], rooms: [], years: [] };
  try {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } }) || await db.academicYear.create({ data: { name: tag, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') } });
    if (year.name === tag) ids.years.push(year.id);
    const boardingClass = await db.classroom.create({ data: { name: tag + '-INT', level: 'CE1', program: 'FRANCO_ARAB_BOARDING', academicYearId: year.id } });
    const dayClass = await db.classroom.create({ data: { name: tag + '-PS', level: 'PS', program: 'PRESCHOOL', academicYearId: year.id } });
    ids.classes.push(boardingClass.id, dayClass.id);
    const pupil = (firstName, gender, classroomId, isBoarder) => db.student.create({ data: { matricule: `${tag}-${firstName}`, firstName, lastName: tag, dateOfBirth: new Date('2016-01-01'), gender, isBoarder,
      enrollments: { create: { classroomId, academicYearId: year.id } } } });
    const boy = await pupil('Garcon', 'MALE', boardingClass.id, true);
    const girl = await pupil('Fille', 'FEMALE', boardingClass.id, true);
    // The regime, not the class, decides: a day pupil of a boarding class is not a boarder.
    const external = await pupil('Externe', 'MALE', boardingClass.id, false);
    ids.students.push(boy.id, girl.id, external.id);

    const boarders = (await service.boarders(tag)).map(row => row.id).sort();
    assert.deepEqual(boarders, [boy.id, girl.id].sort(), 'only pupils marked "interne" are boarders');

    await assert.rejects(service.createRoom({ name: tag + '-Mixte', beds: 2 }), /garçons ou de filles/, 'no mixed rooms');
    const room = await service.createRoom({ name: tag + '-Ch1', gender: 'MALE', beds: 2 });
    ids.rooms.push(room.id);
    const [bed1, bed2] = room.beds.sort((a, b) => a.label.localeCompare(b.label));
    await service.assignBed(bed1.id, { studentId: boy.id });
    await assert.rejects(service.assignBed(bed2.id, { studentId: girl.id }), /garçons/);
    await assert.rejects(service.assignBed(bed2.id, { studentId: external.id }), /interne/);
    await service.assignBed(bed2.id, { studentId: boy.id });
    assert.equal((await db.boardingBed.findUnique({ where: { id: bed1.id } })).studentId, null, 'moving a pupil frees the previous bed');
    await assert.rejects(service.deleteRoom(room.id), /Libérez/);

    const now = Date.now();
    await service.createLeave({ studentId: girl.id, kind: 'WEEKEND', departedAt: new Date(now - 3600e3).toISOString(), expectedReturnAt: new Date(now + 86400e3).toISOString(), pickupName: 'Mère' }, actor);
    await assert.rejects(service.createLeave({ studentId: girl.id, kind: 'WEEKEND', departedAt: new Date(now).toISOString(), expectedReturnAt: new Date(now + 3600e3).toISOString(), pickupName: 'Mère' }, actor), /déjà en sortie/);
    const sheet = await service.rollCall();
    assert.equal(sheet.rows.find(row => row.id === girl.id).status, 'ON_LEAVE', 'a pupil on leave is pre-filled as away');
    await service.saveRollCall({ records: [{ studentId: boy.id, status: 'PRESENT' }, { studentId: girl.id, status: 'ON_LEAVE' }] }, actor);
    await assert.rejects(service.saveRollCall({ records: [{ studentId: external.id, status: 'PRESENT' }] }, actor), /pas interne/);
    const leave = (await service.leaves({ open: 'true', studentId: girl.id }))[0];
    await service.returnLeave(leave.id, {}, actor);
    await assert.rejects(service.returnLeave(leave.id, {}, actor), /déjà enregistré/);

    await service.recordPocketMoney({ studentId: boy.id, kind: 'DEPOSIT', amount: 5000, label: 'Dépôt du père' }, actor);
    const attempts = await Promise.allSettled([1, 2, 3].map(() => service.recordPocketMoney({ studentId: boy.id, kind: 'WITHDRAWAL', amount: 2000, label: 'Achat' }, actor)));
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 2, 'concurrent withdrawals never overdraw the balance');
    assert.equal((await service.pocketMoney(boy.id)).balance, 1000);

    // Bulk regime change: a group joins the boarding house; leaving it frees the bed.
    const director = { userId: 'qa-dir', username: 'qa-direction', roles: ['DIRECTEUR'] };
    assert.deepEqual(await service.setBoarders({ studentIds: [external.id, boy.id], isBoarder: true }, director), { selectedCount: 2, updatedCount: 1, isBoarder: true });
    assert.ok((await service.boarders(tag)).some(row => row.id === external.id));
    await service.setBoarders({ studentIds: [boy.id], isBoarder: false }, director);
    assert.equal(await db.boardingBed.count({ where: { studentId: boy.id } }), 0, 'a day pupil loses his bed');
    await assert.rejects(service.setBoarders({ studentIds: [boy.id, 'missing'], isBoarder: true }, director), /introuvables/);
    await service.setBoarders({ studentIds: [boy.id], isBoarder: true }, director);
    await service.assignBed(bed2.id, { studentId: boy.id });

    await service.createHealth({ studentId: boy.id, reason: 'Fièvre', care: 'Paracétamol', parentNotified: true }, actor);
    await service.createVisit({ studentId: boy.id, visitorName: 'Oncle' }, actor);
    const overview = await service.overview();
    assert.ok(overview.boarders >= 2 && overview.occupiedBeds >= 1);
    console.log('PASS: boarders, beds, leaves, evening roll call, visits, health and pocket money behave safely');
  } finally {
    await db.businessAudit.deleteMany({ where: { action: 'STUDENT_BOARDING_CHANGED', entityId: { in: ids.students } } });
    await db.boardingRoom.deleteMany({ where: { id: { in: ids.rooms } } });
    await db.student.deleteMany({ where: { id: { in: ids.students } } });
    await db.classroom.deleteMany({ where: { id: { in: ids.classes } } });
    await db.academicYear.deleteMany({ where: { id: { in: ids.years } } });
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exit(1); });
