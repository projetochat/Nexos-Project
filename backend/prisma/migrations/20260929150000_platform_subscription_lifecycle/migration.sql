ALTER TYPE "PlatformClientStatus" ADD VALUE IF NOT EXISTS 'PROSPECTING';
ALTER TYPE "PlanStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "PlanStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'REGISTERING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_FINANCE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'FINANCE_RELEASED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'RELEASED';

ALTER TABLE "tenant_subscriptions"
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ADD COLUMN "suspensionReason" TEXT;

ALTER TABLE "subscription_history"
  ALTER COLUMN "tenantId" DROP NOT NULL;

ALTER TABLE "invoices"
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ADD COLUMN "paidCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "released" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "releasedAt" TIMESTAMP(3);

ALTER TABLE "tenant_subscriptions"
  DROP CONSTRAINT IF EXISTS "tenant_subscriptions_tenantId_fkey";
ALTER TABLE "tenant_subscriptions"
  ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
  DROP CONSTRAINT IF EXISTS "invoices_tenantId_fkey";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
