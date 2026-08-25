ALTER TABLE "messaging_connections"
  ADD COLUMN "color" TEXT DEFAULT '#22c55e',
  ADD COLUMN "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "welcomeNewMessage" TEXT,
  ADD COLUMN "welcomeExistingMessage" TEXT,
  ADD COLUMN "notes" TEXT;
