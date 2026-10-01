CREATE TYPE "PlatformClientStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

ALTER TABLE "tenants"
ADD COLUMN "responsibleName" TEXT,
ADD COLUMN "responsibleEmail" TEXT,
ADD COLUMN "responsiblePhone" TEXT,
ADD COLUMN "responsibleTitle" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "maxUsers" INTEGER,
ADD COLUMN "maxConnections" INTEGER;

CREATE TABLE "platform_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "responsibleName" TEXT NOT NULL,
    "responsibleEmail" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PlatformClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_clients_document_key" ON "platform_clients"("document");
CREATE UNIQUE INDEX "platform_clients_tenantId_key" ON "platform_clients"("tenantId");
CREATE INDEX "platform_clients_name_idx" ON "platform_clients"("name");
CREATE INDEX "platform_clients_city_state_idx" ON "platform_clients"("city", "state");
CREATE INDEX "platform_clients_status_idx" ON "platform_clients"("status");

ALTER TABLE "platform_clients"
ADD CONSTRAINT "platform_clients_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_subscriptions"
ADD COLUMN "clientId" TEXT,
ADD COLUMN "indefinite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "monthlyValueCents" INTEGER,
ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "couponCode" TEXT,
ADD COLUMN "notes" TEXT;

CREATE INDEX "tenant_subscriptions_clientId_status_idx"
ON "tenant_subscriptions"("clientId", "status");

ALTER TABLE "tenant_subscriptions"
ADD CONSTRAINT "tenant_subscriptions_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "platform_clients"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the existing platform companies as clients. Legacy records without a
-- valid CNPJ remain editable and must receive one before they can be saved again.
INSERT INTO "platform_clients" (
    "id", "name", "document", "responsibleName", "responsibleEmail", "city", "state",
    "registeredAt", "status", "tenantId", "createdAt", "updatedAt"
)
SELECT
    'legacy-client-' || t."id",
    t."name",
    CASE WHEN regexp_replace(COALESCE(t."document", ''), '\D', '', 'g') ~ '^\d{14}$'
              AND (SELECT COUNT(*) FROM "tenants" duplicate_tenant
                   WHERE regexp_replace(COALESCE(duplicate_tenant."document", ''), '\D', '', 'g') =
                         regexp_replace(COALESCE(t."document", ''), '\D', '', 'g')) = 1
        THEN regexp_replace(t."document", '\D', '', 'g') ELSE NULL END,
    COALESCE(NULLIF(t."responsibleName", ''), NULLIF(t."displayName", ''), t."name"),
    COALESCE(NULLIF(t."responsibleEmail", ''), NULLIF(t."billingEmail", ''), NULLIF(t."technicalEmail", ''),
        'nao-informado+' || t."id" || '@invalid.local'),
    'Não informado',
    '--',
    t."createdAt",
    CASE WHEN t."status"::text IN ('ACTIVE', 'TRIAL') THEN 'ACTIVE'::"PlatformClientStatus"
         WHEN t."status"::text = 'TERMINATED' THEN 'CANCELLED'::"PlatformClientStatus"
         ELSE 'SUSPENDED'::"PlatformClientStatus" END,
    t."id",
    t."createdAt",
    CURRENT_TIMESTAMP
FROM "tenants" t;

UPDATE "tenant_subscriptions" s
SET "clientId" = c."id"
FROM "platform_clients" c
WHERE c."tenantId" = s."tenantId";

ALTER TABLE "invoices"
ADD COLUMN "referenceDate" TIMESTAMP(3),
ADD COLUMN "reference" TEXT,
ADD COLUMN "couponCode" TEXT,
ADD COLUMN "notes" TEXT;
