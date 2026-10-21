CREATE TABLE IF NOT EXISTS "tenant_registration_case_settings" (
  "tenantId" TEXT NOT NULL,
  "contacts" BOOLEAN NOT NULL DEFAULT FALSE,
  "contact_companies" BOOLEAN NOT NULL DEFAULT FALSE,
  "contact_departments" BOOLEAN NOT NULL DEFAULT FALSE,
  "contact_profiles" BOOLEAN NOT NULL DEFAULT FALSE,
  "attendants" BOOLEAN NOT NULL DEFAULT FALSE,
  "access_profiles" BOOLEAN NOT NULL DEFAULT FALSE,
  "departments" BOOLEAN NOT NULL DEFAULT FALSE,
  "tags" BOOLEAN NOT NULL DEFAULT FALSE,
  "bot_flows" BOOLEAN NOT NULL DEFAULT FALSE,
  "automations" BOOLEAN NOT NULL DEFAULT FALSE,
  "ai_agents" BOOLEAN NOT NULL DEFAULT FALSE,
  "ticket_titles" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_registration_case_settings_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "tenant_registration_case_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
