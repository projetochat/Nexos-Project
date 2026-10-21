DO $$ BEGIN
  CREATE TYPE "ProtocolModule" AS ENUM ('CHAT', 'TICKET');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProtocolFormat" AS ENUM ('YEAR_SEQUENCE', 'YEAR_MONTH_SEQUENCE', 'SEQUENCE', 'DATE_SEQUENCE', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProtocolReset" AS ENUM ('YEARLY', 'MONTHLY', 'NEVER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_protocol_configurations" (
  "tenantId" TEXT NOT NULL,
  "module" "ProtocolModule" NOT NULL,
  "format" "ProtocolFormat" NOT NULL,
  "digits" INTEGER NOT NULL DEFAULT 6,
  "reset" "ProtocolReset" NOT NULL DEFAULT 'NEVER',
  "customPattern" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_protocol_configurations_pkey" PRIMARY KEY ("tenantId", "module"),
  CONSTRAINT "tenant_protocol_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "protocol_sequence_counters" (
  "tenantId" TEXT NOT NULL,
  "module" "ProtocolModule" NOT NULL,
  "periodKey" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "protocol_sequence_counters_pkey" PRIMARY KEY ("tenantId", "module", "periodKey"),
  CONSTRAINT "protocol_sequence_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "protocol_sequence_counters" ("tenantId", "module", "periodKey", "lastNumber", "updatedAt")
SELECT "tenantId", 'CHAT'::"ProtocolModule", 'GLOBAL', "lastNumber", "updatedAt"
FROM "conversation_protocol_counters"
ON CONFLICT ("tenantId", "module", "periodKey") DO NOTHING;

INSERT INTO "protocol_sequence_counters" ("tenantId", "module", "periodKey", "lastNumber", "updatedAt")
SELECT "tenantId", 'TICKET'::"ProtocolModule", 'GLOBAL', "lastNumber", "updatedAt"
FROM "ticket_protocol_counters"
ON CONFLICT ("tenantId", "module", "periodKey") DO NOTHING;
