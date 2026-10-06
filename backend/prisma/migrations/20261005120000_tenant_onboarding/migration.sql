DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "quick_replies"
    WHERE "departmentId" IS NULL
      AND "archivedAt" IS NULL
    GROUP BY "tenantId", "normalizedShortcut"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'ONBOARDING_MIGRATION_BLOCKED: duplicate active global quick-reply shortcuts must be reviewed before applying this migration';
  END IF;
END $$;

CREATE TYPE "TenantOnboardingStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "tenant_onboarding_states" (
  "tenantId" TEXT NOT NULL,
  "status" "TenantOnboardingStatus" NOT NULL DEFAULT 'PENDING',
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  "maxCompletedStep" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tenant_onboarding_states_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "tenant_onboarding_states_current_step_check"
    CHECK ("currentStep" BETWEEN 1 AND 8),
  CONSTRAINT "tenant_onboarding_states_max_completed_step_check"
    CHECK ("maxCompletedStep" BETWEEN 0 AND 8),
  CONSTRAINT "tenant_onboarding_states_version_check"
    CHECK ("version" >= 1),
  CONSTRAINT "tenant_onboarding_states_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tenant_onboarding_states_status_updatedAt_idx"
ON "tenant_onboarding_states"("status", "updatedAt");

ALTER TABLE "tags"
ADD COLUMN "description" TEXT;

-- Prisma cannot currently represent this partial uniqueness rule in schema.prisma.
-- It closes the NULL gap in the existing tenant/department/shortcut unique key for
-- active, tenant-wide quick replies while preserving archived history.
CREATE UNIQUE INDEX "quick_replies_tenant_global_active_shortcut_key"
ON "quick_replies"("tenantId", "normalizedShortcut")
WHERE "departmentId" IS NULL AND "archivedAt" IS NULL;
