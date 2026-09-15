ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "inboxArchivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "conversations_tenantId_inboxArchivedAt_idx"
  ON "conversations"("tenantId", "inboxArchivedAt");
