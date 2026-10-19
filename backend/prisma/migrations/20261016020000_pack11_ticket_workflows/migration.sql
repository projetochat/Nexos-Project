-- PACK 11: evolucao do modulo de chamados existente.
-- Esta migration preserva os valores legados dos enums para compatibilidade.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'NOVO';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_APROVACAO';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'NA_FILA';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'EM_EXECUCAO';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'CONCLUIDA';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'VALIDADO';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'REPROVADO';
ALTER TYPE "TicketPriority" ADD VALUE IF NOT EXISTS 'ALTISSIMA';

CREATE TYPE "TicketDialogType" AS ENUM (
  'RESPONSE',
  'TRANSFER',
  'APPROVAL_REQUEST',
  'SOLUTION',
  'CANCELLATION',
  'APPROVAL_DECISION',
  'SOLUTION_VALIDATION'
);

CREATE TYPE "TicketApprovalKind" AS ENUM ('SUPPORT', 'DEVELOPMENT', 'SOLUTION_VALIDATION');
CREATE TYPE "TicketApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "TicketSubstatus" AS ENUM (
  'OPENED_IN_SANKHYA',
  'FORWARDED_TO_THIRD_PARTY',
  'WAITING',
  'WAITING_INFRASTRUCTURE'
);

ALTER TABLE "tickets"
  ADD COLUMN "customerDepartmentId" TEXT,
  ADD COLUMN "originBranchId" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "solvedAt" TIMESTAMP(3),
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "substatus" "TicketSubstatus";

ALTER TABLE "ticket_comments"
  ADD COLUMN "dialogType" "TicketDialogType" NOT NULL DEFAULT 'RESPONSE',
  ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE TABLE "ticket_approvals" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "kind" "TicketApprovalKind" NOT NULL,
  "status" "TicketApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByMembershipId" TEXT NOT NULL,
  "approverMembershipId" TEXT,
  "approverContactId" TEXT,
  "requestCommentId" TEXT,
  "decisionCommentId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedByMembershipId" TEXT,
  CONSTRAINT "ticket_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_approvals_tenantId_id_key" ON "ticket_approvals"("tenantId", "id");
CREATE INDEX "tickets_tenantId_customerDepartmentId_idx" ON "tickets"("tenantId", "customerDepartmentId");
CREATE INDEX "tickets_tenantId_originBranchId_idx" ON "tickets"("tenantId", "originBranchId");
CREATE INDEX "ticket_approvals_tenantId_ticketId_requestedAt_idx" ON "ticket_approvals"("tenantId", "ticketId", "requestedAt");
CREATE INDEX "ticket_approvals_tenantId_approverMembershipId_status_idx" ON "ticket_approvals"("tenantId", "approverMembershipId", "status");
CREATE INDEX "ticket_approvals_tenantId_approverContactId_status_idx" ON "ticket_approvals"("tenantId", "approverContactId", "status");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customerDepartmentId_fkey"
  FOREIGN KEY ("customerDepartmentId") REFERENCES "customer_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_originBranchId_fkey"
  FOREIGN KEY ("originBranchId") REFERENCES "customer_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_ticketId_fkey"
  FOREIGN KEY ("tenantId", "ticketId") REFERENCES "tickets"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_requestedByMembershipId_fkey"
  FOREIGN KEY ("requestedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_approverMembershipId_fkey"
  FOREIGN KEY ("approverMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_decidedByMembershipId_fkey"
  FOREIGN KEY ("decidedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_approverContactId_fkey"
  FOREIGN KEY ("approverContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_requestCommentId_fkey"
  FOREIGN KEY ("requestCommentId") REFERENCES "ticket_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_decisionCommentId_fkey"
  FOREIGN KEY ("decisionCommentId") REFERENCES "ticket_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth for every new tenant-owned relationship. The original
-- single-column constraints retain their delete semantics; these guards reject
-- a reference whose owner belongs to another tenant.
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_customerDepartmentId_guard_fkey"
  FOREIGN KEY ("tenantId", "customerDepartmentId") REFERENCES "customer_departments"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_originBranchId_guard_fkey"
  FOREIGN KEY ("tenantId", "originBranchId") REFERENCES "customer_branches"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_requestedByMembershipId_guard_fkey"
  FOREIGN KEY ("tenantId", "requestedByMembershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_approverMembershipId_guard_fkey"
  FOREIGN KEY ("tenantId", "approverMembershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_decidedByMembershipId_guard_fkey"
  FOREIGN KEY ("tenantId", "decidedByMembershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_approverContactId_guard_fkey"
  FOREIGN KEY ("tenantId", "approverContactId") REFERENCES "contacts"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_requestCommentId_guard_fkey"
  FOREIGN KEY ("tenantId", "requestCommentId") REFERENCES "ticket_comments"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_decisionCommentId_guard_fkey"
  FOREIGN KEY ("tenantId", "decisionCommentId") REFERENCES "ticket_comments"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
