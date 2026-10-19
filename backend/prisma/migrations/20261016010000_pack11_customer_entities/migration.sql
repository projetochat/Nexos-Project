BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TYPE "CustomerPersonType" AS ENUM ('PHYSICAL', 'LEGAL');
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'PROSPECT', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "CustomerAccessProfile" AS ENUM ('COLLABORATOR', 'MANAGER', 'FULL_ACCESS');
CREATE TYPE "CustomerBranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "customers"
  ADD COLUMN "personType" "CustomerPersonType" NOT NULL DEFAULT 'LEGAL',
  ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "document" TEXT,
  ADD COLUMN "addressFullEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "addressNumber" TEXT,
  ADD COLUMN "addressWithoutNumber" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "complement" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT DEFAULT 'Brasil';

CREATE TABLE "customer_branches" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "status" "CustomerBranchStatus" NOT NULL DEFAULT 'ACTIVE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_departments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "managerContactId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_departments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contacts"
  ADD COLUMN "customerBranchId" TEXT,
  ADD COLUMN "customerDepartmentId" TEXT,
  ADD COLUMN "customerAccessProfile" "CustomerAccessProfile";

CREATE UNIQUE INDEX "customer_branches_tenantId_id_key" ON "customer_branches"("tenantId", "id");
CREATE UNIQUE INDEX "customer_branches_tenantId_customerId_name_key" ON "customer_branches"("tenantId", "customerId", "name");
CREATE INDEX "customer_branches_tenantId_customerId_archivedAt_idx" ON "customer_branches"("tenantId", "customerId", "archivedAt");
CREATE UNIQUE INDEX "customer_departments_tenantId_id_key" ON "customer_departments"("tenantId", "id");
CREATE UNIQUE INDEX "customer_departments_tenantId_customerId_name_key" ON "customer_departments"("tenantId", "customerId", "name");
CREATE INDEX "customer_departments_tenantId_customerId_archivedAt_idx" ON "customer_departments"("tenantId", "customerId", "archivedAt");
CREATE INDEX "customer_departments_tenantId_managerContactId_idx" ON "customer_departments"("tenantId", "managerContactId");
CREATE INDEX "customers_tenantId_status_archivedAt_idx" ON "customers"("tenantId", "status", "archivedAt");
CREATE INDEX "customers_tenantId_personType_archivedAt_idx" ON "customers"("tenantId", "personType", "archivedAt");
CREATE INDEX "customers_tenantId_document_idx" ON "customers"("tenantId", "document");
CREATE INDEX "contacts_tenantId_customerBranchId_idx" ON "contacts"("tenantId", "customerBranchId");
CREATE INDEX "contacts_tenantId_customerDepartmentId_idx" ON "contacts"("tenantId", "customerDepartmentId");

ALTER TABLE "customer_branches" ADD CONSTRAINT "customer_branches_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_branches" ADD CONSTRAINT "customer_branches_tenantId_customerId_fkey"
  FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_departments" ADD CONSTRAINT "customer_departments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_departments" ADD CONSTRAINT "customer_departments_tenantId_customerId_fkey"
  FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_departments" ADD CONSTRAINT "customer_departments_tenantId_managerContactId_fkey"
  FOREIGN KEY ("managerContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_customerBranchId_fkey"
  FOREIGN KEY ("customerBranchId") REFERENCES "customer_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_customerDepartmentId_fkey"
  FOREIGN KEY ("customerDepartmentId") REFERENCES "customer_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth: preserve the existing SET NULL behavior while also making
-- cross-tenant references impossible at the database layer.
ALTER TABLE "customer_departments" ADD CONSTRAINT "customer_departments_tenantId_managerContactId_guard_fkey"
  FOREIGN KEY ("tenantId", "managerContactId") REFERENCES "contacts"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_customerBranchId_guard_fkey"
  FOREIGN KEY ("tenantId", "customerBranchId") REFERENCES "customer_branches"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_customerDepartmentId_guard_fkey"
  FOREIGN KEY ("tenantId", "customerDepartmentId") REFERENCES "customer_departments"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
