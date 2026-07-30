CREATE TYPE "ContactCompanyRole" AS ENUM ('COLABORADOR', 'SUPERVISOR', 'GERENTE', 'DIRETORIA');

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "responsibleContactName" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "departmentName" TEXT,
    "companyRole" "ContactCompanyRole",
    "instance" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_tags" (
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contactId","tagId")
);

CREATE UNIQUE INDEX "customers_tenantId_id_key" ON "customers"("tenantId", "id");
CREATE INDEX "customers_tenantId_name_idx" ON "customers"("tenantId", "name");
CREATE INDEX "customers_tenantId_archivedAt_idx" ON "customers"("tenantId", "archivedAt");

CREATE UNIQUE INDEX "contacts_tenantId_id_key" ON "contacts"("tenantId", "id");
CREATE UNIQUE INDEX "contacts_tenantId_normalizedPhone_key" ON "contacts"("tenantId", "normalizedPhone");
CREATE INDEX "contacts_tenantId_name_idx" ON "contacts"("tenantId", "name");
CREATE INDEX "contacts_tenantId_customerId_idx" ON "contacts"("tenantId", "customerId");
CREATE INDEX "contacts_tenantId_departmentId_idx" ON "contacts"("tenantId", "departmentId");
CREATE INDEX "contacts_tenantId_departmentName_idx" ON "contacts"("tenantId", "departmentName");
CREATE INDEX "contacts_tenantId_instance_idx" ON "contacts"("tenantId", "instance");
CREATE INDEX "contacts_tenantId_archivedAt_idx" ON "contacts"("tenantId", "archivedAt");

CREATE UNIQUE INDEX "tags_tenantId_id_key" ON "tags"("tenantId", "id");
CREATE UNIQUE INDEX "tags_tenantId_name_key" ON "tags"("tenantId", "name");
CREATE INDEX "tags_tenantId_idx" ON "tags"("tenantId");

CREATE INDEX "contact_tags_tenantId_idx" ON "contact_tags"("tenantId");
CREATE INDEX "contact_tags_tagId_idx" ON "contact_tags"("tagId");

ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "description")
VALUES
  ('crm.read', 'Ler clientes, contatos e etiquetas de CRM'),
  ('crm.manage', 'Gerenciar clientes, contatos e etiquetas de CRM')
ON CONFLICT ("id") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."key" = 'tenant_admin'
  AND "permissions"."id" IN ('crm.read', 'crm.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."key" = 'supervisor'
  AND "permissions"."id" IN ('crm.read', 'crm.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."key" = 'agent'
  AND "permissions"."id" = 'crm.read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
