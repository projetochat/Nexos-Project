CREATE TABLE "tenant_dashboard_configurations" (
    "tenantId" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_dashboard_configurations_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "tenant_dashboard_configurations"
ADD CONSTRAINT "tenant_dashboard_configurations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
