const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { StudentsService } = require('../dist/src/students/students.service');

const actor = { userId: 'qa-director', username: 'qa-direction', roles: ['DIRECTEUR'] };
const circleA = 'حلقة الإمام أبوبكر سل';
const circleB = 'حلقة الحاجة زينب جه';

(async () => {
  if (!process.env.DATABASE_URL?.includes('_test')) throw Error('Isolated test database required');
  const db = new PrismaClient();
  const service = new StudentsService(db, {});
  const tag = 'QA-HALKHA-' + randomUUID().slice(0, 8);
  const ids = [];
  try {
    for (const [index, quranCircle] of [null, circleA, null].entries()) {
      const student = await db.student.create({ data: {
        matricule: `${tag}-${index}`, firstName: `Halkha${index}`, lastName: tag,
        dateOfBirth: new Date('2018-01-01'), gender: 'MALE', quranCircle,
      } });
      ids.push(student.id);
    }

    const first = await service.assignQuranCircle({ studentIds: ids, quranCircle: circleA }, actor);
    assert.deepEqual(first, { selectedCount: 3, updatedCount: 2, quranCircle: circleA });
    assert.equal(await db.student.count({ where: { id: { in: ids }, quranCircle: circleA } }), 3);
    assert.equal(await db.businessAudit.count({ where: { entityId: { in: ids }, action: 'STUDENT_QURAN_CIRCLE_ASSIGNED' } }), 2);

    const filtered = await service.findAll({ quranCircle: circleA, search: tag }, { roles: ['DIRECTEUR'] });
    assert.equal(filtered.length, 3);

    await assert.rejects(
      service.assignQuranCircle({ studentIds: [...ids, randomUUID()], quranCircle: circleB }, actor),
      /introuvables/,
    );
    assert.equal(await db.student.count({ where: { id: { in: ids }, quranCircle: circleA } }), 3, 'a refused batch must not change any pupil');

    await db.studentDeparture.create({ data: {
      studentId: ids[2], departedOn: new Date('2026-11-01'), reason: 'QA', requestKey: randomUUID(),
      actorId: actor.userId, actorName: actor.username, actorRole: 'DIRECTEUR',
    } });
    await assert.rejects(service.assignQuranCircle({ studentIds: ids, quranCircle: circleB }, actor), /quitté/);

    const removal = await service.assignQuranCircle({ studentIds: ids.slice(0, 2), quranCircle: null }, actor);
    assert.equal(removal.updatedCount, 2);
    const unassigned = await service.findAll({ quranCircle: '', search: tag }, { roles: ['DIRECTEUR'] });
    assert.deepEqual(unassigned.map(row => row.id).sort(), ids.slice(0, 2).sort());

    await assert.rejects(service.assignQuranCircle({ studentIds: ids.slice(0, 1), quranCircle: 'Groupe inconnu' }, actor), /invalide/);
    console.log('PASS: Quran circles are assigned atomically, audited, filtered and never partially applied');
  } finally {
    await db.businessAudit.deleteMany({ where: { entityId: { in: ids } } });
    await db.studentDeparture.deleteMany({ where: { studentId: { in: ids } } });
    await db.student.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exit(1); });
