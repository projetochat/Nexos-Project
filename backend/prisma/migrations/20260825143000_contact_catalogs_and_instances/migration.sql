CREATE TABLE "contact_departments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_profiles" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contacts"
  ADD COLUMN "contactDepartmentId" TEXT,
  ADD COLUMN "contactProfileId" TEXT,
  ADD COLUMN "instanceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "contacts"
SET "instanceIds" = ARRAY["instance"]
WHERE "instance" IS NOT NULL AND "instance" <> '';

INSERT INTO "contact_departments" ("id", "tenantId", "name", "normalizedName", "updatedAt")
SELECT md5("tenantId" || ':contact-department:' || lower(trim("departmentName"))),
       "tenantId",
       "departmentName",
       lower(trim("departmentName")),
       CURRENT_TIMESTAMP
FROM "contacts"
WHERE "departmentName" IS NOT NULL AND trim("departmentName") <> ''
GROUP BY "tenantId", "departmentName";

UPDATE "contacts" c
SET "contactDepartmentId" = cd."id"
FROM "contact_departments" cd
WHERE cd."tenantId" = c."tenantId"
  AND cd."normalizedName" = lower(trim(c."departmentName"));

INSERT INTO "contact_profiles" ("id", "tenantId", "name", "normalizedName", "updatedAt")
SELECT md5("tenantId" || ':contact-profile:' || lower(CASE "companyRole"
         WHEN 'COLABORADOR' THEN 'Colaborador'
         WHEN 'SUPERVISOR' THEN 'Supervisor'
         WHEN 'GERENTE' THEN 'Gerente'
         WHEN 'DIRETORIA' THEN 'Diretoria'
       END)),
       "tenantId",
       CASE "companyRole"
         WHEN 'COLABORADOR' THEN 'Colaborador'
         WHEN 'SUPERVISOR' THEN 'Supervisor'
         WHEN 'GERENTE' THEN 'Gerente'
         WHEN 'DIRETORIA' THEN 'Diretoria'
       END,
       lower(CASE "companyRole"
         WHEN 'COLABORADOR' THEN 'Colaborador'
         WHEN 'SUPERVISOR' THEN 'Supervisor'
         WHEN 'GERENTE' THEN 'Gerente'
         WHEN 'DIRETORIA' THEN 'Diretoria'
       END),
       CURRENT_TIMESTAMP
FROM "contacts"
WHERE "companyRole" IS NOT NULL
GROUP BY "tenantId", "companyRole";

UPDATE "contacts" c
SET "contactProfileId" = cp."id"
FROM "contact_profiles" cp
WHERE cp."tenantId" = c."tenantId"
  AND cp."normalizedName" = lower(CASE c."companyRole"
    WHEN 'COLABORADOR' THEN 'Colaborador'
    WHEN 'SUPERVISOR' THEN 'Supervisor'
    WHEN 'GERENTE' THEN 'Gerente'
    WHEN 'DIRETORIA' THEN 'Diretoria'
  END);

CREATE UNIQUE INDEX "contact_departments_tenantId_normalizedName_key"
  ON "contact_departments"("tenantId", "normalizedName");
CREATE INDEX "contact_departments_tenantId_archivedAt_idx"
  ON "contact_departments"("tenantId", "archivedAt");

CREATE UNIQUE INDEX "contact_profiles_tenantId_normalizedName_key"
  ON "contact_profiles"("tenantId", "normalizedName");
CREATE INDEX "contact_profiles_tenantId_archivedAt_idx"
  ON "contact_profiles"("tenantId", "archivedAt");

CREATE INDEX "contacts_tenantId_contactDepartmentId_idx"
  ON "contacts"("tenantId", "contactDepartmentId");
CREATE INDEX "contacts_tenantId_contactProfileId_idx"
  ON "contacts"("tenantId", "contactProfileId");

ALTER TABLE "contact_departments"
  ADD CONSTRAINT "contact_departments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_profiles"
  ADD CONSTRAINT "contact_profiles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_contactDepartmentId_fkey"
  FOREIGN KEY ("contactDepartmentId") REFERENCES "contact_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_contactProfileId_fkey"
  FOREIGN KEY ("contactProfileId") REFERENCES "contact_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
