-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO', 'FECHADA');

-- CreateTable
CREATE TABLE "conversation_protocol_counters" (
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_protocol_counters_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "departmentId" TEXT,
    "assignedMembershipId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ABERTA',
    "protocol" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessagePreview" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_tenantId_id_key" ON "conversations"("tenantId", "id");
CREATE UNIQUE INDEX "conversations_tenantId_protocol_key" ON "conversations"("tenantId", "protocol");
CREATE INDEX "conversations_tenantId_status_archivedAt_idx" ON "conversations"("tenantId", "status", "archivedAt");
CREATE INDEX "conversations_tenantId_departmentId_idx" ON "conversations"("tenantId", "departmentId");
CREATE INDEX "conversations_tenantId_assignedMembershipId_idx" ON "conversations"("tenantId", "assignedMembershipId");
CREATE INDEX "conversations_tenantId_contactId_idx" ON "conversations"("tenantId", "contactId");
CREATE INDEX "conversations_tenantId_lastMessageAt_idx" ON "conversations"("tenantId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "conversation_protocol_counters"
  ADD CONSTRAINT "conversation_protocol_counters_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assignedMembershipId_fkey"
  FOREIGN KEY ("assignedMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions
INSERT INTO "permissions" ("id", "description", "createdAt") VALUES
  ('conversations.read', 'Ler conversas do tenant conforme escopo operacional.', CURRENT_TIMESTAMP),
  ('conversations.assign', 'Atribuir, assumir ou desatribuir conversas conforme escopo operacional.', CURRENT_TIMESTAMP),
  ('conversations.manage', 'Alterar status e departamento de conversas conforme escopo operacional.', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."id" IN ('conversations.read', 'conversations.assign', 'conversations.manage')
WHERE r."key" IN ('tenant_admin', 'supervisor', 'agent')
ON CONFLICT DO NOTHING;
