ALTER TABLE "messaging_connections"
  ADD COLUMN IF NOT EXISTS "absenceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "absenceMessage" TEXT;
