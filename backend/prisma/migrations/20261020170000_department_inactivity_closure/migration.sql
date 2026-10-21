ALTER TABLE "departments"
ADD COLUMN "inactivityClosureEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "inactivityTimeoutMinutes" INTEGER,
ADD COLUMN "inactivityClosureMessage" TEXT;

ALTER TABLE "departments"
ADD CONSTRAINT "departments_inactivity_closure_configuration_check"
CHECK (
  NOT "inactivityClosureEnabled"
  OR (
    "inactivityTimeoutMinutes" IS NOT NULL
    AND
    "inactivityTimeoutMinutes" BETWEEN 1 AND 10080
    AND "inactivityClosureMessage" IS NOT NULL
    AND length(btrim("inactivityClosureMessage")) > 0
  )
);

CREATE INDEX "conversations_tenantId_departmentId_lastMessageAt_idx"
ON "conversations"("tenantId", "departmentId", "lastMessageAt");
