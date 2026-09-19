ALTER TABLE "messaging_connections"
  ADD COLUMN "welcomeNewAttachment" JSONB,
  ADD COLUMN "welcomeExistingAttachment" JSONB;
