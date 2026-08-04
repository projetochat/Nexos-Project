CREATE TYPE "TicketStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'FECHADO', 'CANCELADO');
CREATE TYPE "TicketPriority" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');
CREATE TYPE "TicketCategory" AS ENUM ('SUPORTE', 'DEV', 'FINANCEIRO', 'OPERACIONAL');
CREATE TYPE "TicketAttachmentStatus" AS ENUM ('PENDING', 'READY', 'DELETED', 'REJECTED');
CREATE TYPE "AttachmentScanStatus" AS ENUM ('NOT_SCANNED', 'CLEAN', 'BLOCKED');

CREATE TABLE "ticket_protocol_counters" (
  "tenantId" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_protocol_counters_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "ticket_protocol_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tickets" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "protocol" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "descriptionText" TEXT NOT NULL,
  "descriptionHtmlSanitized" TEXT NOT NULL,
  "status" "TicketStatus" NOT NULL DEFAULT 'ABERTO',
  "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
  "category" "TicketCategory" NOT NULL DEFAULT 'SUPORTE',
  "requesterUserId" TEXT,
  "requesterContactId" TEXT,
  "customerId" TEXT,
  "conversationId" TEXT,
  "departmentId" TEXT NOT NULL,
  "assignedMembershipId" TEXT,
  "createdByMembershipId" TEXT NOT NULL,
  "closedByMembershipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tickets_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "tickets_tenantId_protocol_key" UNIQUE ("tenantId", "protocol"),
  CONSTRAINT "tickets_tenantId_number_key" UNIQUE ("tenantId", "number"),
  CONSTRAINT "tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tickets_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tickets_requesterContactId_fkey" FOREIGN KEY ("requesterContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tickets_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "conversations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tickets_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tickets_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tickets_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tickets_closedByMembershipId_fkey" FOREIGN KEY ("closedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ticket_comments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorMembershipId" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "bodyHtmlSanitized" TEXT,
  "internal" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_comments_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "ticket_comments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_comments_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "tickets"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_comments_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ticket_history" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "actorMembershipId" TEXT,
  "event" TEXT NOT NULL,
  "fromValue" TEXT,
  "toValue" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_history_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "tickets"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_history_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ticket_attachments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "commentId" TEXT,
  "uploadedByMembershipId" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "originalNameSanitized" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT,
  "status" "TicketAttachmentStatus" NOT NULL DEFAULT 'PENDING',
  "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_attachments_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "tickets"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ticket_attachments_tenantId_commentId_fkey" FOREIGN KEY ("tenantId", "commentId") REFERENCES "ticket_comments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ticket_attachments_uploadedByMembershipId_fkey" FOREIGN KEY ("uploadedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "tickets_tenantId_status_idx" ON "tickets"("tenantId", "status");
CREATE INDEX "tickets_tenantId_departmentId_idx" ON "tickets"("tenantId", "departmentId");
CREATE INDEX "tickets_tenantId_assignedMembershipId_idx" ON "tickets"("tenantId", "assignedMembershipId");
CREATE INDEX "tickets_tenantId_createdAt_idx" ON "tickets"("tenantId", "createdAt");
CREATE INDEX "tickets_tenantId_requesterContactId_idx" ON "tickets"("tenantId", "requesterContactId");
CREATE INDEX "tickets_tenantId_customerId_idx" ON "tickets"("tenantId", "customerId");
CREATE INDEX "tickets_tenantId_conversationId_idx" ON "tickets"("tenantId", "conversationId");

CREATE INDEX "ticket_comments_tenantId_ticketId_createdAt_idx" ON "ticket_comments"("tenantId", "ticketId", "createdAt");
CREATE INDEX "ticket_comments_authorMembershipId_idx" ON "ticket_comments"("authorMembershipId");

CREATE INDEX "ticket_history_tenantId_ticketId_createdAt_idx" ON "ticket_history"("tenantId", "ticketId", "createdAt");
CREATE INDEX "ticket_history_tenantId_event_idx" ON "ticket_history"("tenantId", "event");

CREATE UNIQUE INDEX "ticket_attachments_tenantId_id_key" ON "ticket_attachments"("tenantId", "id");
CREATE INDEX "ticket_attachments_tenantId_ticketId_createdAt_idx" ON "ticket_attachments"("tenantId", "ticketId", "createdAt");
CREATE INDEX "ticket_attachments_tenantId_status_idx" ON "ticket_attachments"("tenantId", "status");
