-- Additive, idempotent patch for installations currently managed with prisma db push.
-- No UPDATE, DELETE, DROP, enum change, or historical fee recalculation.
BEGIN;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "supplies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "registrationOptions" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_billingKey_key" ON "Invoice"("billingKey");
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingMonth" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "tuitionPeriodKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tuitionPeriodKey_key" ON "Invoice"("tuitionPeriodKey");
CREATE INDEX IF NOT EXISTS "Invoice_academicYearId_type_billingMonth_idx" ON "Invoice"("academicYearId", "type", "billingMonth");
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "duplicateOverrideReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledByName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledByRole" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledByName" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledByRole" TEXT;
COMMIT;
