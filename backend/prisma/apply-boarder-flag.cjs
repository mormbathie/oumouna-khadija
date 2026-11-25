const { PrismaClient } = require('@prisma/client');

// One-off (2026-11-25): the boarding regime is now chosen per pupil ("interne" / "externe").
// To keep today's boarding lists unchanged, pupils enrolled this year in a boarding class
// start as boarders; the school then switches day pupils to "externe" from the Internat page.
const prisma = new PrismaClient();
const migration = '20261125_boarder_flag_from_boarding_classes';

(async () => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_AppDataMigration" (
    "name" TEXT PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = await prisma.$queryRawUnsafe('SELECT "name" FROM "_AppDataMigration" WHERE "name" = $1', migration);
  if (applied.length) return;
  const count = await prisma.$transaction(async tx => {
    const updated = await tx.$executeRawUnsafe(`UPDATE "Student" s SET "isBoarder" = true
      WHERE s."isBoarder" = false AND EXISTS (
        SELECT 1 FROM "Enrollment" e
        JOIN "Classroom" c ON c.id = e."classroomId"
        JOIN "AcademicYear" y ON y.id = e."academicYearId" AND y."isCurrent"
        WHERE e."studentId" = s.id AND e.status = 'REGISTERED' AND c.program IN ('DAARA_BOARDING', 'FRANCO_ARAB_BOARDING'))`);
    await tx.$executeRawUnsafe('INSERT INTO "_AppDataMigration" ("name") VALUES ($1)', migration);
    return updated;
  });
  console.log(`Régime interne initialisé depuis les classes d’internat : ${count} élève(s).`);
})().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exit(1); });
