ALTER TABLE "messaging_connections"
ADD COLUMN "defaultDepartmentId" TEXT;

CREATE INDEX "messaging_connections_tenantId_defaultDepartmentId_idx"
ON "messaging_connections"("tenantId", "defaultDepartmentId");

ALTER TABLE "messaging_connections"
ADD CONSTRAINT "messaging_connections_tenantId_defaultDepartmentId_fkey"
FOREIGN KEY ("tenantId", "defaultDepartmentId")
REFERENCES "departments"("tenantId", "id")
ON DELETE SET NULL ("defaultDepartmentId")
ON UPDATE CASCADE;
