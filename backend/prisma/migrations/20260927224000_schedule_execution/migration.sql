CREATE TYPE "ScheduleExecutionStatus" AS ENUM ('PENDING', 'CLAIMED', 'QUEUED', 'SENT', 'FAILED');

ALTER TABLE "schedules"
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "executionStatus" "ScheduleExecutionStatus",
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "messageId" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "createdByMembershipId" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "schedules_executionStatus_dueAt_idx"
  ON "schedules"("executionStatus", "dueAt");
CREATE INDEX "schedules_executionStatus_nextAttemptAt_idx"
  ON "schedules"("executionStatus", "nextAttemptAt");
CREATE INDEX "schedules_tenantId_messageId_idx"
  ON "schedules"("tenantId", "messageId");

-- Backfill only the legacy one-shot Chat contract. Invalid or ambiguous local dates stay
-- non-executable instead of making the migration fail or using the server timezone.
DO $$
DECLARE
  candidate RECORD;
  parsed_due_at TIMESTAMPTZ;
BEGIN
  FOR candidate IN
    SELECT "tenantId", "id", payload->>'scheduledAt' AS scheduled_at
    FROM "schedules"
    WHERE "executionStatus" IS NULL
      AND payload->>'status' = 'pending'
      AND payload->>'type' = 'message'
      AND payload->>'recurrence' = 'once'
      AND jsonb_typeof(payload->'conversationId') = 'string'
      AND length(trim(payload->>'conversationId')) > 0
      AND jsonb_typeof(payload->'recipientIds') = 'array'
      AND jsonb_array_length(payload->'recipientIds') = 0
      AND payload->>'scheduledAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$'
  LOOP
    BEGIN
      parsed_due_at := candidate.scheduled_at::timestamptz;
      IF parsed_due_at < CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN
        UPDATE "schedules"
        SET "dueAt" = parsed_due_at,
            "executionStatus" = 'FAILED',
            "lastError" = 'Agendamento legado vencido há mais de 24 horas; envio automático bloqueado por segurança.',
            "version" = "version" + 1
        WHERE "tenantId" = candidate."tenantId"
          AND "id" = candidate."id"
          AND "executionStatus" IS NULL;
      ELSE
        UPDATE "schedules"
        SET "dueAt" = parsed_due_at,
            "executionStatus" = 'PENDING',
            "version" = "version" + 1
        WHERE "tenantId" = candidate."tenantId"
          AND "id" = candidate."id"
          AND "executionStatus" IS NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
