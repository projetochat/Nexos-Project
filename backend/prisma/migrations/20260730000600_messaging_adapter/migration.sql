CREATE TYPE "MessagingProviderType" AS ENUM ('DEVELOPMENT', 'EVOLUTION', 'META_CLOUD');

CREATE TYPE "MessagingConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

ALTER TYPE "MessageStatus" ADD VALUE 'SENDING';
ALTER TYPE "MessageStatus" ADD VALUE 'SENT';
ALTER TYPE "MessageStatus" ADD VALUE 'FAILED';
ALTER TYPE "MessageStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "MessageStatus" ADD VALUE 'READ';

CREATE TABLE "messaging_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" "MessagingProviderType" NOT NULL,
    "status" "MessagingConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_connections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "conversations" ADD COLUMN "connectionId" TEXT;

ALTER TABLE "messages" ADD COLUMN "connectionId" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerErrorCode" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerErrorMessage" TEXT;
ALTER TABLE "messages" ADD COLUMN "providerAcceptedAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "externalMessageId" TEXT;

CREATE UNIQUE INDEX "messaging_connections_tenantId_id_key" ON "messaging_connections"("tenantId", "id");
CREATE UNIQUE INDEX "messaging_connections_tenantId_providerType_externalReference_key" ON "messaging_connections"("tenantId", "providerType", "externalReference");
CREATE INDEX "messaging_connections_tenantId_idx" ON "messaging_connections"("tenantId");
CREATE INDEX "messaging_connections_tenantId_status_idx" ON "messaging_connections"("tenantId", "status");

CREATE UNIQUE INDEX "messages_tenantId_connectionId_externalMessageId_key" ON "messages"("tenantId", "connectionId", "externalMessageId");
CREATE INDEX "messages_tenantId_connectionId_idx" ON "messages"("tenantId", "connectionId");
CREATE INDEX "messages_tenantId_providerMessageId_idx" ON "messages"("tenantId", "providerMessageId");
CREATE INDEX "conversations_tenantId_connectionId_idx" ON "conversations"("tenantId", "connectionId");

ALTER TABLE "messaging_connections" ADD CONSTRAINT "messaging_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
