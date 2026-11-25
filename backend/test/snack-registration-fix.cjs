const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const MARKER = '20261125_snack_out_of_registration_fee';
(async () => {
  if (!process.env.DATABASE_URL?.includes('_test')) throw Error('Isolated test database required');
  const db = new PrismaClient();
  const tag = 'QA-SNACK-' + randomUUID().slice(0, 8);
  const ids = { students: [], classes: [], years: [] };
  try {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } }) || await db.academicYear.create({ data: { name: tag, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') } });
    if (year.name === tag) ids.years.push(year.id);
    const preschool = await db.classroom.create({ data: { name: tag + '-PS', level: 'PS', program: 'PRESCHOOL', registrationFee: 43000, academicYearId: year.id } });
    const boarding = await db.classroom.create({ data: { name: tag + '-CI', level: 'CI', program: 'FRANCO_ARAB_BOARDING', registrationFee: 160000, academicYearId: year.id } });
    ids.classes.push(preschool.id, boarding.id);
    const options = kind => JSON.stringify({ eveningClasses: true, registrationKind: kind });
    const make = async (name, classroom, amount, paidAmount, kind) => {
      const student = await db.student.create({ data: { matricule: `${tag}-${name}`, firstName: name, lastName: tag, dateOfBirth: new Date('2021-01-01'), gender: 'FEMALE',
        enrollments: { create: { classroomId: classroom.id, academicYearId: year.id } } } });
      ids.students.push(student.id);
      return db.invoice.create({ data: { invoiceNumber: `${tag}-${name}`, studentId: student.id, academicYearId: year.id, title: 'Inscription', type: 'REGISTRATION',
        amount, grossAmount: amount, paidAmount, balance: amount - paidAmount, status: paidAmount ? 'PARTIAL' : 'UNPAID', dueDate: new Date(), registrationOptions: options(kind) } });
    };
    const target = await make('Cible', preschool, 53000, 0, 'NEW');
    const partial = await make('Partiel', preschool, 53000, 20000, 'NEW');
    const renewal = await make('Reinscription', preschool, 43000, 0, 'RENEWAL');
    const overpaid = await make('Paye', preschool, 53000, 50000, 'NEW');
    const other = await make('Internat', boarding, 170000, 0, 'NEW');

    await db.$executeRawUnsafe('DELETE FROM "_AppDataMigration" WHERE name = $1', MARKER).catch(() => undefined);
    const run = () => execFileSync('node', ['prisma/apply-snack-registration-fix.cjs'], { env: process.env, encoding: 'utf8' });
    run();
    const get = id => db.invoice.findUnique({ where: { id } });
    assert.deepEqual((({ amount, grossAmount, balance, status }) => ({ amount, grossAmount, balance, status }))(await get(target.id)), { amount: 43000, grossAmount: 43000, balance: 43000, status: 'UNPAID' });
    assert.equal((await get(partial.id)).balance, 23000);
    assert.equal((await get(renewal.id)).amount, 43000, 'renewals never included the snack');
    assert.equal((await get(overpaid.id)).amount, 53000, 'never below what was already paid');
    assert.equal((await get(other.id)).amount, 170000, 'only preschool registrations are concerned');
    assert.equal(await db.businessAudit.count({ where: { entityId: { in: [target.id, partial.id] }, action: 'REGISTRATION_SNACK_REMOVED' } }), 2);
    run();
    assert.equal((await get(target.id)).amount, 43000, 'the correction runs only once');
    console.log('PASS: the former snack supplement is removed once, only where certain, with an audit entry');
  } finally {
    await db.$executeRawUnsafe('DELETE FROM "_AppDataMigration" WHERE name = $1', MARKER).catch(() => undefined);
    await db.businessAudit.deleteMany({ where: { action: 'REGISTRATION_SNACK_REMOVED', actorId: 'system', details: { contains: tag } } });
    await db.student.deleteMany({ where: { id: { in: ids.students } } });
    await db.classroom.deleteMany({ where: { id: { in: ids.classes } } });
    await db.academicYear.deleteMany({ where: { id: { in: ids.years } } });
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exit(1); });
