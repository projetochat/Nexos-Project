BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE "contacts" ADD COLUMN "portal_login" TEXT;

CREATE UNIQUE INDEX "contacts_portal_login_key" ON "contacts"("portal_login");

COMMIT;
