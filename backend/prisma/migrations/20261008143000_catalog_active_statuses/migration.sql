BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE "roles"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "tags"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "quick_replies"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "roles_tenantId_active_idx" ON "roles"("tenantId", "active");
CREATE INDEX "tags_tenantId_active_archivedAt_idx" ON "tags"("tenantId", "active", "archivedAt");
CREATE INDEX "quick_replies_tenantId_active_archivedAt_idx" ON "quick_replies"("tenantId", "active", "archivedAt");

COMMIT;
