const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { StudentsService } = require('../dist/src/students/students.service');

(async () => {
  if (!process.env.DATABASE_URL?.includes('_test')) throw Error('Isolated test database required');
  const db = new PrismaClient();
  const service = new StudentsService(db, {});
  const tag = 'QA-PA-' + randomUUID().slice(0, 8);
  const created = { students: [], parents: [], users: [] };
  try {
    const mother = await db.parent.create({ data: { firstName: 'Mère', lastName: tag, phone: '77 800 00 01' } });
    const otherFamily = await db.parent.create({ data: { firstName: 'Autre', lastName: tag, phone: '77 800 00 02', email: `${tag.toLowerCase()}@example.org` } });
    created.parents.push(mother.id, otherFamily.id);
    const child = (firstName, data) => db.student.create({ data: { matricule: `${tag}-${firstName}`, firstName, lastName: tag, dateOfBirth: new Date('2018-01-01'), gender: 'FEMALE', ...data } });
    const own = await child('Primaire', { parentId: mother.id });
    const guarded = await child('Tutelle', { parentId: otherFamily.id, guardians: { create: { parentId: mother.id, relation: 'Tante' } } });
    const foreign = await child('Autre', { parentId: otherFamily.id });
    created.students.push(own.id, guarded.id, foreign.id);
    const keycloakId = 'qa-' + randomUUID();
    await db.user.create({ data: { keycloakId, username: '221778000001', email: `221778000001@parents.invalid`, firstName: 'Mère', lastName: tag, role: 'PARENT', parentId: mother.id } });
    created.users.push(keycloakId);
    const requester = { userId: keycloakId, username: '221778000001', email: '221778000001@parents.invalid', emailVerified: true, roles: ['PARENT'] };

    const visible = (await service.findAll({ search: tag }, requester)).map(row => row.id).sort();
    assert.deepEqual(visible, [own.id, guarded.id].sort(), 'a phone account sees its children and wards only');
    assert.equal((await service.findOne(own.id, requester)).id, own.id);
    await assert.rejects(service.findOne(foreign.id, requester), /non trouvé/);
    await assert.rejects(service.getPhoto(foreign.id, requester), /introuvable/);

    // An account whose parent record was deleted loses access instead of falling back to its technical address.
    await db.user.update({ where: { keycloakId }, data: { parentId: null } });
    await assert.rejects(service.findAll({ search: tag }, requester), /secrétariat/);

    // Older email accounts keep working.
    const emailParent = { userId: 'qa-none', email: `${tag.toLowerCase()}@example.org`, emailVerified: true, roles: ['PARENT'] };
    assert.deepEqual((await service.findAll({ search: tag }, emailParent)).map(row => row.id).sort(), [guarded.id, foreign.id].sort());
    console.log('PASS: parent accounts are linked to one parent record and never see another family');
  } finally {
    await db.user.deleteMany({ where: { keycloakId: { in: created.users } } });
    await db.student.deleteMany({ where: { id: { in: created.students } } });
    await db.parent.deleteMany({ where: { id: { in: created.parents } } });
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exit(1); });
