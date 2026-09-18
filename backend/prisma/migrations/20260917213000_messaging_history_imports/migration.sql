CREATE TYPE "MessagingHistoryImportKind" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "MessagingHistoryImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');

CREATE TABLE "messaging_history_imports" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "kind" "MessagingHistoryImportKind" NOT NULL,
  "status" "MessagingHistoryImportStatus" NOT NULL DEFAULT 'PENDING',
  "startDate" TIMESTAMP(3) NOT NULL,
  "chatsProcessed" INTEGER NOT NULL DEFAULT 0,
  "messagesImported" INTEGER NOT NULL DEFAULT 0,
  "messagesSkipped" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "messaging_history_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messaging_history_imports_connectionId_kind_key" ON "messaging_history_imports"("connectionId", "kind");
CREATE INDEX "messaging_history_imports_tenantId_status_idx" ON "messaging_history_imports"("tenantId", "status");
CREATE INDEX "messaging_history_imports_tenantId_connectionId_idx" ON "messaging_history_imports"("tenantId", "connectionId");

ALTER TABLE "messaging_history_imports"
  ADD CONSTRAINT "messaging_history_imports_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messaging_history_imports"
  ADD CONSTRAINT "messaging_history_imports_tenantId_connectionId_fkey"
  FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
