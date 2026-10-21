-- D23: preserve the assigned attendant name when the membership is physically deleted.
ALTER TABLE "conversations" ADD COLUMN "assignedMembershipNameSnapshot" TEXT;

UPDATE "conversations" AS conversation
SET "assignedMembershipNameSnapshot" = COALESCE(
  NULLIF(BTRIM(membership."presentation_name"), ''),
  account."name"
)
FROM "tenant_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE conversation."assignedMembershipId" = membership."id";
