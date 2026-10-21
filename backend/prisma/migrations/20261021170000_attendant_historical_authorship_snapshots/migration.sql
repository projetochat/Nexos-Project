-- D19: preserve historical authorship while allowing a tenant membership to be removed.
-- This migration is intentionally additive/backfilled before changing the foreign keys.

ALTER TABLE "tickets" ADD COLUMN "createdByNameSnapshot" TEXT;
ALTER TABLE "ticket_comments" ADD COLUMN "authorNameSnapshot" TEXT;
ALTER TABLE "ticket_approvals" ADD COLUMN "requestedByNameSnapshot" TEXT;
ALTER TABLE "ticket_attachments" ADD COLUMN "uploadedByNameSnapshot" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "createdByNameSnapshot" TEXT;

UPDATE "tickets" AS record
SET "createdByNameSnapshot" = COALESCE(NULLIF(BTRIM(membership."presentation_name"), ''), account."name")
FROM "tenant_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE record."createdByMembershipId" = membership."id";

UPDATE "ticket_comments" AS record
SET "authorNameSnapshot" = COALESCE(NULLIF(BTRIM(membership."presentation_name"), ''), account."name")
FROM "tenant_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE record."authorMembershipId" = membership."id";

UPDATE "ticket_approvals" AS record
SET "requestedByNameSnapshot" = COALESCE(NULLIF(BTRIM(membership."presentation_name"), ''), account."name")
FROM "tenant_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE record."requestedByMembershipId" = membership."id";

UPDATE "ticket_attachments" AS record
SET "uploadedByNameSnapshot" = COALESCE(NULLIF(BTRIM(membership."presentation_name"), ''), account."name")
FROM "tenant_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE record."uploadedByMembershipId" = membership."id";

UPDATE "campaigns" AS record
SET "createdByNameSnapshot" = COALESCE(NULLIF(BTRIM(membership."presentation_name"), ''), account."name")
FROM "tenant_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE record."createdByMembershipId" = membership."id";

ALTER TABLE "tickets" ALTER COLUMN "createdByMembershipId" DROP NOT NULL;
ALTER TABLE "ticket_comments" ALTER COLUMN "authorMembershipId" DROP NOT NULL;
ALTER TABLE "ticket_approvals" ALTER COLUMN "requestedByMembershipId" DROP NOT NULL;
ALTER TABLE "ticket_attachments" ALTER COLUMN "uploadedByMembershipId" DROP NOT NULL;
ALTER TABLE "campaigns" ALTER COLUMN "createdByMembershipId" DROP NOT NULL;

ALTER TABLE "tickets" DROP CONSTRAINT "tickets_createdByMembershipId_fkey";
ALTER TABLE "ticket_comments" DROP CONSTRAINT "ticket_comments_authorMembershipId_fkey";
ALTER TABLE "ticket_approvals" DROP CONSTRAINT "ticket_approvals_requestedByMembershipId_fkey";
ALTER TABLE "ticket_attachments" DROP CONSTRAINT "ticket_attachments_uploadedByMembershipId_fkey";
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_createdByMembershipId_fkey";

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_authorMembershipId_fkey"
  FOREIGN KEY ("authorMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_requestedByMembershipId_fkey"
  FOREIGN KEY ("requestedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploadedByMembershipId_fkey"
  FOREIGN KEY ("uploadedByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
