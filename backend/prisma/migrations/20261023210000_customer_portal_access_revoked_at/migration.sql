BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE "customer_portal_accesses"
    ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "customer_portal_accesses_tenantId_customerId_revokedAt_idx"
    ON "customer_portal_accesses"("tenantId", "customerId", "revokedAt");

COMMIT;
