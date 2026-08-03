ALTER TABLE "messaging_connections"
ADD COLUMN "ownerExternalId" TEXT,
ADD COLUMN "ownerPhoneNormalized" TEXT;

CREATE INDEX "messaging_connections_tenantId_ownerPhoneNormalized_idx"
ON "messaging_connections"("tenantId", "ownerPhoneNormalized");
