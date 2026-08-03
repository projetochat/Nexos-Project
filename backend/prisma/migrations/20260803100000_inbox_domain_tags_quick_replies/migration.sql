-- Sprint 10: Inbox domain consolidation.
-- Tags already existed for CRM contacts; this migration makes them tenant-scoped
-- with stable normalized uniqueness and archival semantics, then adds Quick Replies.

ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "normalizedName" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

UPDATE "tags"
SET "normalizedName" = lower(trim("name"))
WHERE "normalizedName" IS NULL;

ALTER TABLE "tags"
  ALTER COLUMN "normalizedName" SET NOT NULL;

DROP INDEX IF EXISTS "tags_tenantId_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "tags_tenantId_normalizedName_key"
  ON "tags"("tenantId", "normalizedName");

CREATE INDEX IF NOT EXISTS "tags_tenantId_archivedAt_idx"
  ON "tags"("tenantId", "archivedAt");

CREATE TABLE IF NOT EXISTS "quick_replies" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "shortcut" TEXT NOT NULL,
  "normalizedShortcut" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "departmentId" TEXT,
  "createdByMembershipId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quick_replies_tenantId_id_key"
  ON "quick_replies"("tenantId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "quick_replies_tenantId_departmentId_normalizedShortcut_key"
  ON "quick_replies"("tenantId", "departmentId", "normalizedShortcut");

CREATE UNIQUE INDEX IF NOT EXISTS "quick_replies_tenantId_globalShortcut_key"
  ON "quick_replies"("tenantId", "normalizedShortcut")
  WHERE "departmentId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "quick_replies_tenantId_departmentShortcut_key"
  ON "quick_replies"("tenantId", "departmentId", "normalizedShortcut")
  WHERE "departmentId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "quick_replies_tenantId_archivedAt_idx"
  ON "quick_replies"("tenantId", "archivedAt");

CREATE INDEX IF NOT EXISTS "quick_replies_tenantId_departmentId_idx"
  ON "quick_replies"("tenantId", "departmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quick_replies_tenantId_fkey'
  ) THEN
    ALTER TABLE "quick_replies"
      ADD CONSTRAINT "quick_replies_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quick_replies_tenantId_departmentId_fkey'
  ) THEN
    ALTER TABLE "quick_replies"
      ADD CONSTRAINT "quick_replies_tenantId_departmentId_fkey"
      FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quick_replies_createdByMembershipId_fkey'
  ) THEN
    ALTER TABLE "quick_replies"
      ADD CONSTRAINT "quick_replies_createdByMembershipId_fkey"
      FOREIGN KEY ("createdByMembershipId") REFERENCES "tenant_memberships"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
