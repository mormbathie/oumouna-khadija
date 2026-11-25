const { PrismaClient } = require('@prisma/client');

// One-off correction (2026-11-25): options are now billed monthly only. New preschool
// registrations created under the former rule included the 10 000 F snack in the
// registration fee. Only invoices that certainly carry it are corrected: new (not renewal)
// preschool registrations whose gross amount equals the class fee + 10 000 and that stay
// at or above what was already paid. Each correction is written to the audit log.
const prisma = new PrismaClient();
const migration = '20261125_snack_out_of_registration_fee';
const SNACK = 10000;

(async () => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_AppDataMigration" (
    "name" TEXT PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = await prisma.$queryRawUnsafe('SELECT "name" FROM "_AppDataMigration" WHERE "name" = $1', migration);
  if (applied.length) return;
  const corrected = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe(`
      SELECT i.id, i."invoiceNumber", i.amount, i."grossAmount", i."discountAmount", i."paidAmount", i.balance
      FROM "Invoice" i
      JOIN "Enrollment" e ON e."studentId" = i."studentId" AND e."academicYearId" = i."academicYearId"
      JOIN "Classroom" c ON c.id = e."classroomId"
      WHERE i.type = 'REGISTRATION' AND i."cancelledAt" IS NULL
        AND i."registrationOptions" LIKE '%"eveningClasses":true%'
        AND i."registrationOptions" NOT LIKE '%"registrationKind":"RENEWAL"%'
        AND c.program = 'PRESCHOOL'
        AND COALESCE(i."grossAmount", i.amount + i."discountAmount") = c."registrationFee" + $1
        AND i.amount - $1 >= i."paidAmount"
      FOR UPDATE OF i`, SNACK);
    for (const row of rows) {
      const amount = row.amount - SNACK;
      const balance = amount - row.paidAmount;
      const gross = (row.grossAmount ?? row.amount + row.discountAmount) - SNACK;
      const status = balance <= 0 ? 'PAID' : row.paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
      await tx.$executeRawUnsafe(`UPDATE "Invoice" SET amount = $2, "grossAmount" = $3, balance = $4, status = $5::"InvoiceStatus", "updatedAt" = NOW() WHERE id = $1`,
        row.id, amount, gross, balance, status);
      await tx.$executeRawUnsafe(`INSERT INTO "BusinessAudit" (id, action, "entityId", "actorId", "actorName", "actorRole", reason, details, "createdAt")
        VALUES (gen_random_uuid()::text, 'REGISTRATION_SNACK_REMOVED', $1, 'system', 'Correction automatique', 'ADMIN', $2, $3, NOW())`,
        row.id, 'Le goûter est désormais facturé uniquement avec la mensualité.',
        JSON.stringify({ invoiceNumber: row.invoiceNumber, previousAmount: row.amount, amount, previousBalance: row.balance, balance }));
    }
    await tx.$executeRawUnsafe('INSERT INTO "_AppDataMigration" ("name") VALUES ($1)', migration);
    return rows.length;
  });
  console.log(`Goûter retiré des frais d’inscription : ${corrected} facture(s) corrigée(s).`);
})().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exit(1); });
