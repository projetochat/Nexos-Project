CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'SYSTEM');

CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'SYSTEM');

CREATE TYPE "MessageStatus" AS ENUM ('CREATED');

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "direction" "MessageDirection" NOT NULL,
  "type" "MessageType" NOT NULL DEFAULT 'TEXT',
  "status" "MessageStatus" NOT NULL DEFAULT 'CREATED',
  "authorMembershipId" TEXT,
  "content" TEXT,
  "clientMessageId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messages_tenantId_conversationId_clientMessageId_key" ON "messages"("tenantId", "conversationId", "clientMessageId");
CREATE INDEX "messages_tenantId_idx" ON "messages"("tenantId");
CREATE INDEX "messages_tenantId_conversationId_createdAt_id_idx" ON "messages"("tenantId", "conversationId", "createdAt", "id");
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "conversations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "description") VALUES ('messages.send', 'messages.send')
ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description";
