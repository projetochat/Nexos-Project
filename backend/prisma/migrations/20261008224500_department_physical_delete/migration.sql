-- Preserve tickets and notifications when their department is physically deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE "tickets"
  ALTER COLUMN "departmentId" DROP NOT NULL;

ALTER TABLE "tickets"
  DROP CONSTRAINT "tickets_tenantId_departmentId_fkey",
  ADD CONSTRAINT "tickets_tenantId_departmentId_fkey"
    FOREIGN KEY ("tenantId", "departmentId")
    REFERENCES "departments"("tenantId", "id")
    ON DELETE SET NULL ("departmentId")
    ON UPDATE CASCADE;

COMMIT;

ALTER TABLE "notifications"
  DROP CONSTRAINT "notifications_tenantId_departmentId_fkey",
  ADD CONSTRAINT "notifications_tenantId_departmentId_fkey"
    FOREIGN KEY ("tenantId", "departmentId")
    REFERENCES "departments"("tenantId", "id")
    ON DELETE SET NULL ("departmentId")
    ON UPDATE CASCADE;
