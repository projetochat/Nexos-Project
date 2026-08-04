CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "PlanBillingPeriod" AS ENUM ('MONTHLY', 'YEARLY', 'MANUAL');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE');
CREATE TYPE "ImpersonationStatus" AS ENUM ('ACTIVE', 'STOPPED', 'EXPIRED');

ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'READONLY';

ALTER TABLE "tenants"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN "document" TEXT,
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "technicalEmail" TEXT,
  ADD COLUMN "authRevokedAt" TIMESTAMP(3),
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "terminatedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT;

UPDATE "tenants"
SET
  "legalName" = COALESCE("legalName", "name"),
  "displayName" = COALESCE("displayName", "name"),
  "activatedAt" = COALESCE("activatedAt", "createdAt")
WHERE "status" = 'ACTIVE';

CREATE TABLE "plans" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
  "billingPeriod" "PlanBillingPeriod" NOT NULL DEFAULT 'MANUAL',
  "priceCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "trialDays" INTEGER NOT NULL DEFAULT 0,
  "features" JSONB NOT NULL,
  "limits" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_subscriptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMP(3),
  "limitsSnapshot" JSONB NOT NULL,
  "featuresSnapshot" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_history" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "previousPlanId" TEXT,
  "nextPlanId" TEXT,
  "previousStatus" "SubscriptionStatus",
  "nextStatus" "SubscriptionStatus",
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "actorUserId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "externalReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_counters" (
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "tenant_usage_snapshots" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "metric" TEXT NOT NULL,
  "value" BIGINT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_usage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "impersonation_sessions" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "impersonatedMembershipId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ImpersonationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stoppedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_audit_logs" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorPlatformRole" "PlatformRole",
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "tenantId" TEXT,
  "impersonationSessionId" TEXT,
  "requestId" TEXT,
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "plans_status_idx" ON "plans"("status");
CREATE INDEX "tenants_status_idx" ON "tenants"("status");
CREATE INDEX "tenant_subscriptions_tenantId_status_idx" ON "tenant_subscriptions"("tenantId", "status");
CREATE INDEX "tenant_subscriptions_planId_status_idx" ON "tenant_subscriptions"("planId", "status");
CREATE INDEX "subscription_history_tenantId_createdAt_idx" ON "subscription_history"("tenantId", "createdAt");
CREATE INDEX "subscription_history_subscriptionId_createdAt_idx" ON "subscription_history"("subscriptionId", "createdAt");
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");
CREATE INDEX "invoices_dueAt_status_idx" ON "invoices"("dueAt", "status");
CREATE UNIQUE INDEX "tenant_usage_snapshots_tenantId_periodStart_periodEnd_metric_key" ON "tenant_usage_snapshots"("tenantId", "periodStart", "periodEnd", "metric");
CREATE INDEX "tenant_usage_snapshots_tenantId_periodStart_periodEnd_idx" ON "tenant_usage_snapshots"("tenantId", "periodStart", "periodEnd");
CREATE INDEX "impersonation_sessions_actorUserId_status_expiresAt_idx" ON "impersonation_sessions"("actorUserId", "status", "expiresAt");
CREATE INDEX "impersonation_sessions_tenantId_status_idx" ON "impersonation_sessions"("tenantId", "status");
CREATE INDEX "platform_audit_logs_tenantId_createdAt_idx" ON "platform_audit_logs"("tenantId", "createdAt");
CREATE INDEX "platform_audit_logs_action_createdAt_idx" ON "platform_audit_logs"("action", "createdAt");
CREATE INDEX "platform_audit_logs_actorUserId_createdAt_idx" ON "platform_audit_logs"("actorUserId", "createdAt");

ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "tenant_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_previousPlanId_fkey" FOREIGN KEY ("previousPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_nextPlanId_fkey" FOREIGN KEY ("nextPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "tenant_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_usage_snapshots" ADD CONSTRAINT "tenant_usage_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_impersonationSessionId_fkey" FOREIGN KEY ("impersonationSessionId") REFERENCES "impersonation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "plans" ("id", "code", "name", "description", "status", "billingPeriod", "priceCents", "currency", "trialDays", "features", "limits", "updatedAt")
VALUES
  ('plan_starter_homologation', 'starter', 'Starter', 'Plano de homologacao para tenants pequenos.', 'ACTIVE', 'MANUAL', NULL, 'BRL', 14, '{"campaigns":false,"tickets":true,"multipleConnections":false,"storage":true,"realtime":true}', '{"maxUsers":3,"maxDepartments":2,"maxConnections":1,"maxContacts":1000,"maxCampaignRecipients":0,"maxStorageBytes":52428800}', CURRENT_TIMESTAMP),
  ('plan_professional_homologation', 'professional', 'Professional', 'Plano de homologacao para operacao completa.', 'ACTIVE', 'MANUAL', NULL, 'BRL', 0, '{"campaigns":true,"tickets":true,"multipleConnections":true,"storage":true,"realtime":true}', '{"maxUsers":20,"maxDepartments":10,"maxConnections":3,"maxContacts":10000,"maxCampaignRecipients":500,"maxStorageBytes":536870912}', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = EXCLUDED."status",
  "billingPeriod" = EXCLUDED."billingPeriod",
  "features" = EXCLUDED."features",
  "limits" = EXCLUDED."limits",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "tenant_subscriptions" ("id", "tenantId", "planId", "status", "currentPeriodEnd", "limitsSnapshot", "featuresSnapshot", "updatedAt")
SELECT
  'sub_' || t."id",
  t."id",
  'plan_professional_homologation',
  'ACTIVE',
  CURRENT_TIMESTAMP + INTERVAL '30 days',
  p."limits",
  p."features",
  CURRENT_TIMESTAMP
FROM "tenants" t
JOIN "plans" p ON p."id" = 'plan_professional_homologation'
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_subscriptions" s WHERE s."tenantId" = t."id" AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')
);
