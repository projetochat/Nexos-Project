CREATE TYPE "UserInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUEUED', 'ASSIGNED', 'CONVERTED', 'DISCARDED');
CREATE TYPE "LeadSource" AS ENUM ('WHATSAPP', 'MANUAL', 'CAMPAIGN', 'BOT');
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');
CREATE TYPE "NotificationKind" AS ENUM ('LEAD_CREATED', 'CONVERSATION_ASSIGNED', 'TICKET_UPDATED', 'CAMPAIGN_COMPLETED', 'SYSTEM');
CREATE TYPE "AutomationRuleStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AutomationActionType" AS ENUM ('BOT_REPLY', 'ASSIGN_DEPARTMENT', 'NOTIFY_TEAM');

CREATE TABLE "user_invitations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "departmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tokenHash" TEXT NOT NULL,
  "status" "UserInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedByMembershipId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leads" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "departmentId" TEXT,
  "assignedMembershipId" TEXT,
  "source" "LeadSource" NOT NULL DEFAULT 'WHATSAPP',
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "firstMessagePreview" TEXT,
  "convertedAt" TIMESTAMP(3),
  "discardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "membershipId" TEXT,
  "departmentId" TEXT,
  "kind" "NotificationKind" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_rules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "AutomationRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "actionType" "AutomationActionType" NOT NULL DEFAULT 'BOT_REPLY',
  "matchText" TEXT NOT NULL,
  "responseText" TEXT,
  "departmentId" TEXT,
  "createdByMembershipId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_invitations_tenantId_email_status_key" ON "user_invitations"("tenantId", "email", "status");
CREATE UNIQUE INDEX "user_invitations_tokenHash_key" ON "user_invitations"("tokenHash");
CREATE INDEX "user_invitations_tenantId_status_idx" ON "user_invitations"("tenantId", "status");
CREATE INDEX "user_invitations_expiresAt_idx" ON "user_invitations"("expiresAt");

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_usedAt_idx" ON "password_reset_tokens"("userId", "usedAt");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

CREATE UNIQUE INDEX "leads_tenantId_id_key" ON "leads"("tenantId", "id");
CREATE UNIQUE INDEX "leads_tenantId_conversationId_key" ON "leads"("tenantId", "conversationId");
CREATE INDEX "leads_tenantId_status_createdAt_idx" ON "leads"("tenantId", "status", "createdAt");
CREATE INDEX "leads_tenantId_departmentId_status_idx" ON "leads"("tenantId", "departmentId", "status");
CREATE INDEX "leads_tenantId_assignedMembershipId_idx" ON "leads"("tenantId", "assignedMembershipId");

CREATE UNIQUE INDEX "notifications_tenantId_id_key" ON "notifications"("tenantId", "id");
CREATE INDEX "notifications_tenantId_membershipId_status_createdAt_idx" ON "notifications"("tenantId", "membershipId", "status", "createdAt");
CREATE INDEX "notifications_tenantId_departmentId_status_idx" ON "notifications"("tenantId", "departmentId", "status");
CREATE INDEX "notifications_tenantId_kind_createdAt_idx" ON "notifications"("tenantId", "kind", "createdAt");

CREATE UNIQUE INDEX "automation_rules_tenantId_id_key" ON "automation_rules"("tenantId", "id");
CREATE INDEX "automation_rules_tenantId_status_archivedAt_idx" ON "automation_rules"("tenantId", "status", "archivedAt");
CREATE INDEX "automation_rules_tenantId_departmentId_idx" ON "automation_rules"("tenantId", "departmentId");

ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "roles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invitedByMembershipId_fkey" FOREIGN KEY ("invitedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "conversations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
