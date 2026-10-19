-- Vínculo explícito entre o contato do cliente, o convite e a membership ativada.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE "contacts"
  ADD COLUMN "portalMembershipId" TEXT,
  ADD COLUMN "portalAccessActive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "user_invitations" ADD COLUMN "contactId" TEXT;

CREATE UNIQUE INDEX "contacts_portalMembershipId_key" ON "contacts"("portalMembershipId");
CREATE INDEX "user_invitations_tenantId_contactId_status_idx"
  ON "user_invitations"("tenantId", "contactId", "status");

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_portalMembershipId_fkey"
  FOREIGN KEY ("portalMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_portalMembershipId_guard_fkey"
  FOREIGN KEY ("tenantId", "portalMembershipId") REFERENCES "tenant_memberships"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenantId_contactId_guard_fkey"
  FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
