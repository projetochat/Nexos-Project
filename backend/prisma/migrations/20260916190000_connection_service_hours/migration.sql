ALTER TABLE "messaging_connections"
ADD COLUMN "serviceHours" JSONB,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
