const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const migration = '20261104_class_reenrollment_fees';

(async () => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_AppDataMigration" (
    "name" TEXT PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = await prisma.$queryRawUnsafe('SELECT "name" FROM "_AppDataMigration" WHERE "name" = $1', migration);
  if (applied.length) return;
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`UPDATE "Classroom"
      SET "registrationFee" = 43000, "reenrollmentFee" = 43000
      WHERE UPPER("level") IN ('PS', 'MS', 'GS')`),
    prisma.$executeRawUnsafe('INSERT INTO "_AppDataMigration" ("name") VALUES ($1)', migration),
  ]);
  console.log('Tarifs PS/MS/GS initialisés à 43 000 FCFA.');
})().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exit(1); });
