-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED', 'INVITED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "department_memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_memberships_pkey" PRIMARY KEY ("id")
);

-- Seed controlled permission catalog used by RBAC and the migrated admin UI.
INSERT INTO "permissions" ("id", "description") VALUES
  ('users.read', 'Ver usuarios do tenant'),
  ('users.manage', 'Criar, editar e desativar usuarios do tenant'),
  ('departments.read', 'Ver departamentos do tenant'),
  ('departments.manage', 'Criar, editar e desativar departamentos do tenant'),
  ('roles.read', 'Ver perfis de acesso do tenant'),
  ('roles.manage', 'Criar, editar e remover perfis de acesso do tenant'),
  ('chat.contacts.edit', 'Pode editar contato'),
  ('chat.customer_link.edit', 'Pode editar vinculo de cliente'),
  ('chat.tags.manage', 'Pode gerenciar etiquetas'),
  ('chat.leads.read', 'Visualiza leads'),
  ('chat.contacts.read', 'Visualiza contatos'),
  ('chat.phone.read', 'Visualiza numero'),
  ('chat.messages.delete', 'Excluir mensagem'),
  ('chat.messages.edit', 'Editar mensagem'),
  ('chat.quick_replies.read', 'Acessa mensagens rapidas'),
  ('chat.contacts.block', 'Bloquear contatos'),
  ('chat.audio.send', 'Enviar audio'),
  ('chat.agent_name.show', 'Apresentar nome do atendente na conversa');

-- Tenant-scoped system roles. Role ids are deterministic so existing rows can be migrated safely.
INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "system", "updatedAt")
SELECT "id" || ':tenant_admin', "id", 'tenant_admin', 'Administrador', 'Administra usuarios, departamentos e perfis do tenant.', true, CURRENT_TIMESTAMP
FROM "tenants";

INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "system", "updatedAt")
SELECT "id" || ':supervisor', "id", 'supervisor', 'Supervisor', 'Supervisiona operacao e departamentos do tenant.', true, CURRENT_TIMESTAMP
FROM "tenants";

INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "system", "updatedAt")
SELECT "id" || ':agent', "id", 'agent', 'Atendente', 'Atende clientes nos departamentos permitidos.', true, CURRENT_TIMESTAMP
FROM "tenants";

-- Tenant admin receives all current permissions.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."key" = 'tenant_admin';

-- Supervisor can read users, manage departments, read roles, and operate chat-scoped permissions.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."id" IN (
  'users.read',
  'departments.read',
  'departments.manage',
  'roles.read',
  'chat.contacts.edit',
  'chat.customer_link.edit',
  'chat.tags.manage',
  'chat.leads.read',
  'chat.contacts.read',
  'chat.phone.read',
  'chat.quick_replies.read',
  'chat.audio.send',
  'chat.agent_name.show'
)
WHERE r."key" = 'supervisor';

-- Agent receives operational read permissions only.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."id" IN (
  'departments.read',
  'chat.contacts.read',
  'chat.leads.read',
  'chat.quick_replies.read',
  'chat.audio.send',
  'chat.agent_name.show'
)
WHERE r."key" = 'agent';

-- Migrate existing memberships from the old enum role column to tenant-scoped roles.
ALTER TABLE "tenant_memberships" ADD COLUMN "roleId" TEXT;
ALTER TABLE "tenant_memberships" ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "tenant_memberships" tm
SET "roleId" = CASE
  WHEN tm."role" IN ('SUPER_ADMIN', 'ADMIN') THEN tm."tenantId" || ':tenant_admin'
  WHEN tm."role" = 'SUPERVISOR' THEN tm."tenantId" || ':supervisor'
  ELSE tm."tenantId" || ':agent'
END;

ALTER TABLE "tenant_memberships" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "tenant_memberships" DROP COLUMN "role";

-- Remove Sprint 01 proof-of-isolation artifact from production domain.
DROP TABLE "protected_records";
DROP TYPE "Role";

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_platformRole_idx" ON "users"("platformRole");
CREATE UNIQUE INDEX "tenant_memberships_tenantId_id_key" ON "tenant_memberships"("tenantId", "id");
CREATE INDEX "tenant_memberships_roleId_idx" ON "tenant_memberships"("roleId");
CREATE INDEX "tenant_memberships_status_idx" ON "tenant_memberships"("status");
CREATE UNIQUE INDEX "departments_tenantId_name_key" ON "departments"("tenantId", "name");
CREATE UNIQUE INDEX "departments_tenantId_id_key" ON "departments"("tenantId", "id");
CREATE INDEX "departments_tenantId_idx" ON "departments"("tenantId");
CREATE INDEX "departments_active_idx" ON "departments"("active");
CREATE UNIQUE INDEX "department_memberships_departmentId_membershipId_key" ON "department_memberships"("departmentId", "membershipId");
CREATE INDEX "department_memberships_tenantId_idx" ON "department_memberships"("tenantId");
CREATE INDEX "department_memberships_departmentId_idx" ON "department_memberships"("departmentId");
CREATE INDEX "department_memberships_membershipId_idx" ON "department_memberships"("membershipId");
CREATE UNIQUE INDEX "roles_tenantId_key_key" ON "roles"("tenantId", "key");
CREATE UNIQUE INDEX "roles_tenantId_id_key" ON "roles"("tenantId", "id");
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "roles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_tenantId_membershipId_fkey" FOREIGN KEY ("tenantId", "membershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
