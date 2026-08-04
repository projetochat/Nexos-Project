-- Sprint 12 - Campaigns Domain, Audience Segmentation & Reliable Dispatch

CREATE TYPE "CampaignStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'CANCELLING',
  'CANCELLED',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "CampaignMessageType" AS ENUM ('TEXT');

CREATE TYPE "CampaignAudienceType" AS ENUM (
  'ALL',
  'TAGS',
  'CUSTOMERS',
  'CONTACTS'
);

CREATE TYPE "CampaignTagMatchMode" AS ENUM ('ANY', 'ALL');

CREATE TYPE "CampaignRecipientStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'SKIPPED',
  'CANCELLED'
);

CREATE TYPE "CampaignRecipientSkipReason" AS ENUM (
  'INVALID_PHONE',
  'OPT_OUT',
  'BLOCKED',
  'DUPLICATE',
  'ARCHIVED_CONTACT',
  'TEMPLATE_RENDER_FAILED',
  'CAMPAIGN_CANCELLED'
);

CREATE TYPE "MessagingPreferenceChannel" AS ENUM ('WHATSAPP');

CREATE TABLE "contact_messaging_preferences" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "channel" "MessagingPreferenceChannel" NOT NULL DEFAULT 'WHATSAPP',
  "marketingAllowed" BOOLEAN NOT NULL DEFAULT true,
  "optedOutAt" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contact_messaging_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "messageType" "CampaignMessageType" NOT NULL DEFAULT 'TEXT',
  "messageText" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "audienceType" "CampaignAudienceType" NOT NULL,
  "audienceTagMatchMode" "CampaignTagMatchMode",
  "audienceTagIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audienceCustomerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audienceContactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledByMembershipId" TEXT,
  "createdByMembershipId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "eligibleCount" INTEGER NOT NULL DEFAULT 0,
  "invalidPhoneCount" INTEGER NOT NULL DEFAULT 0,
  "optedOutCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "blockedCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "readCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "cancelledCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_recipients" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "customerId" TEXT,
  "normalizedPhone" TEXT NOT NULL,
  "displayName" TEXT,
  "renderedMessage" TEXT,
  "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "skipReason" "CampaignRecipientSkipReason",
  "messageId" TEXT,
  "externalMessageId" TEXT,
  "queuedAt" TIMESTAMP(3),
  "processingAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "campaignRecipientId" TEXT;

CREATE UNIQUE INDEX "contact_messaging_preferences_tenantId_contactId_channel_key"
  ON "contact_messaging_preferences"("tenantId", "contactId", "channel");
CREATE INDEX "contact_messaging_preferences_tenantId_marketingAllowed_idx"
  ON "contact_messaging_preferences"("tenantId", "marketingAllowed");

CREATE UNIQUE INDEX "campaigns_tenantId_id_key" ON "campaigns"("tenantId", "id");
CREATE INDEX "campaigns_tenantId_status_idx" ON "campaigns"("tenantId", "status");
CREATE INDEX "campaigns_tenantId_scheduledAt_idx" ON "campaigns"("tenantId", "scheduledAt");
CREATE INDEX "campaigns_tenantId_createdAt_idx" ON "campaigns"("tenantId", "createdAt");
CREATE INDEX "campaigns_tenantId_connectionId_idx" ON "campaigns"("tenantId", "connectionId");

CREATE UNIQUE INDEX "campaign_recipients_campaignId_contactId_key"
  ON "campaign_recipients"("campaignId", "contactId");
CREATE UNIQUE INDEX "campaign_recipients_tenantId_id_key"
  ON "campaign_recipients"("tenantId", "id");
CREATE INDEX "campaign_recipients_campaignId_status_idx"
  ON "campaign_recipients"("campaignId", "status");
CREATE INDEX "campaign_recipients_tenantId_contactId_idx"
  ON "campaign_recipients"("tenantId", "contactId");
CREATE INDEX "campaign_recipients_tenantId_messageId_idx"
  ON "campaign_recipients"("tenantId", "messageId");
CREATE INDEX "campaign_recipients_tenantId_externalMessageId_idx"
  ON "campaign_recipients"("tenantId", "externalMessageId");

CREATE INDEX "messages_tenantId_campaignId_idx" ON "messages"("tenantId", "campaignId");
CREATE INDEX "messages_tenantId_campaignRecipientId_idx" ON "messages"("tenantId", "campaignRecipientId");

ALTER TABLE "contact_messaging_preferences"
  ADD CONSTRAINT "contact_messaging_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_messaging_preferences"
  ADD CONSTRAINT "contact_messaging_preferences_tenantId_contactId_fkey"
  FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_tenantId_connectionId_fkey"
  FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_cancelledByMembershipId_fkey"
  FOREIGN KEY ("cancelledByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "campaign_recipients"
  ADD CONSTRAINT "campaign_recipients_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_recipients"
  ADD CONSTRAINT "campaign_recipients_tenantId_campaignId_fkey"
  FOREIGN KEY ("tenantId", "campaignId") REFERENCES "campaigns"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_recipients"
  ADD CONSTRAINT "campaign_recipients_tenantId_contactId_fkey"
  FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_recipients"
  ADD CONSTRAINT "campaign_recipients_tenantId_customerId_fkey"
  FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenantId_campaignId_fkey"
  FOREIGN KEY ("tenantId", "campaignId") REFERENCES "campaigns"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenantId_campaignRecipientId_fkey"
  FOREIGN KEY ("tenantId", "campaignRecipientId") REFERENCES "campaign_recipients"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
