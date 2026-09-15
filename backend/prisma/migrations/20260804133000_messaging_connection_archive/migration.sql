ALTER TYPE "MessagingConnectionStatus" ADD VALUE IF NOT EXISTS 'REMOVED';

ALTER TABLE "messaging_connections"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "messaging_connections_tenantId_archivedAt_idx"
  ON "messaging_connections"("tenantId", "archivedAt");
