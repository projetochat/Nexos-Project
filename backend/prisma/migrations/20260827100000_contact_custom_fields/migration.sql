CREATE TYPE "ContactCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'CHECKBOX', 'LIST');

CREATE TABLE "contact_custom_fields" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "type" "ContactCustomFieldType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "mask" TEXT,
  "note" TEXT,
  "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "position" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contact_custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_custom_field_values" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "value" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contact_custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_custom_fields_tenantId_normalizedName_key" ON "contact_custom_fields"("tenantId", "normalizedName");
CREATE INDEX "contact_custom_fields_tenantId_archivedAt_position_idx" ON "contact_custom_fields"("tenantId", "archivedAt", "position");
CREATE UNIQUE INDEX "contact_custom_field_values_contactId_fieldId_key" ON "contact_custom_field_values"("contactId", "fieldId");
CREATE INDEX "contact_custom_field_values_tenantId_fieldId_idx" ON "contact_custom_field_values"("tenantId", "fieldId");

ALTER TABLE "contact_custom_fields" ADD CONSTRAINT "contact_custom_fields_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_custom_field_values" ADD CONSTRAINT "contact_custom_field_values_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_custom_field_values" ADD CONSTRAINT "contact_custom_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "contact_custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
