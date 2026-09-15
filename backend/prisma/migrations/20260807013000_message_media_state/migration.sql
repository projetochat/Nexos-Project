CREATE TYPE "MessageMediaState" AS ENUM ('PENDING', 'DOWNLOADING', 'READY', 'FAILED');

ALTER TABLE "messages"
  ADD COLUMN "mediaState" "MessageMediaState";

UPDATE "messages"
SET "mediaState" = CASE
  WHEN "mediaStorageKey" IS NOT NULL THEN 'READY'::"MessageMediaState"
  WHEN "mediaProviderUrl" IS NOT NULL THEN 'FAILED'::"MessageMediaState"
  WHEN "type" IN ('IMAGE', 'AUDIO', 'VOICE', 'DOCUMENT') THEN 'PENDING'::"MessageMediaState"
  ELSE NULL
END;

CREATE INDEX "messages_tenantId_mediaState_idx" ON "messages"("tenantId", "mediaState");
