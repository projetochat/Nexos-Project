BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Fail before changing the schema if a legacy portal marker cannot be migrated
-- without weakening tenant/customer isolation.  The exception reports counts
-- only; it deliberately avoids exposing contact data in migration logs.
DO $$
DECLARE
    invalid_shape_count INTEGER;
    missing_department_count INTEGER;
    invalid_branch_scope_count INTEGER;
    invalid_department_scope_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_shape_count
    FROM "contacts" c
    WHERE (c."portalMembershipId" IS NOT NULL OR c."portal_login" IS NOT NULL OR c."portalAccessActive" = true)
      AND (
        c."customerId" IS NULL
        OR c."customerAccessProfile" IS NULL
        OR c."customerBranchId" IS NULL
        OR NULLIF(BTRIM(COALESCE(c."portal_login", LOWER(c."email"))), '') IS NULL
      );

    SELECT COUNT(*) INTO missing_department_count
    FROM "contacts" c
    WHERE (c."portalMembershipId" IS NOT NULL OR c."portal_login" IS NOT NULL OR c."portalAccessActive" = true)
      AND c."customerAccessProfile" IN ('MANAGER', 'COLLABORATOR')
      AND c."customerDepartmentId" IS NULL;

    SELECT COUNT(*) INTO invalid_branch_scope_count
    FROM "contacts" c
    WHERE (c."portalMembershipId" IS NOT NULL OR c."portal_login" IS NOT NULL OR c."portalAccessActive" = true)
      AND c."customerId" IS NOT NULL
      AND c."customerBranchId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "customer_branches" b
        WHERE b."id" = c."customerBranchId"
          AND b."tenantId" = c."tenantId"
          AND b."customerId" = c."customerId"
      );

    SELECT COUNT(*) INTO invalid_department_scope_count
    FROM "contacts" c
    WHERE (c."portalMembershipId" IS NOT NULL OR c."portal_login" IS NOT NULL OR c."portalAccessActive" = true)
      AND c."customerId" IS NOT NULL
      AND c."customerDepartmentId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "customer_departments" d
        WHERE d."id" = c."customerDepartmentId"
          AND d."tenantId" = c."tenantId"
          AND d."customerId" = c."customerId"
      );

    IF invalid_shape_count > 0
       OR missing_department_count > 0
       OR invalid_branch_scope_count > 0
       OR invalid_department_scope_count > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = FORMAT(
          'customer portal preflight failed: invalid_shape=%s, missing_department=%s, invalid_branch_scope=%s, invalid_department_scope=%s',
          invalid_shape_count,
          missing_department_count,
          invalid_branch_scope_count,
          invalid_department_scope_count
        );
    END IF;
END $$;

CREATE TABLE "customer_portal_accesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "membershipId" TEXT,
    "userId" TEXT,
    "login" TEXT NOT NULL,
    "accessProfile" "CustomerAccessProfile" NOT NULL,
    "branchId" TEXT NOT NULL,
    "departmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_portal_accesses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "auth_sessions" ADD COLUMN "portalAccessId" TEXT;
ALTER TABLE "user_invitations" ADD COLUMN "portalAccessId" TEXT;

CREATE UNIQUE INDEX "customer_portal_accesses_tenantId_customerId_contactId_key"
    ON "customer_portal_accesses"("tenantId", "customerId", "contactId");
CREATE UNIQUE INDEX "customer_portal_accesses_tenantId_id_key"
    ON "customer_portal_accesses"("tenantId", "id");
CREATE UNIQUE INDEX "customer_branches_tenantId_customerId_id_key"
    ON "customer_branches"("tenantId", "customerId", "id");
CREATE INDEX "customer_portal_accesses_tenantId_login_active_idx"
    ON "customer_portal_accesses"("tenantId", "login", "active");
CREATE INDEX "customer_portal_accesses_membershipId_active_idx"
    ON "customer_portal_accesses"("membershipId", "active");
CREATE INDEX "customer_portal_accesses_userId_active_idx"
    ON "customer_portal_accesses"("userId", "active");
CREATE INDEX "customer_portal_accesses_tenantId_customerId_active_idx"
    ON "customer_portal_accesses"("tenantId", "customerId", "active");
CREATE INDEX "customer_portal_accesses_tenantId_contactId_idx"
    ON "customer_portal_accesses"("tenantId", "contactId");
CREATE INDEX "auth_sessions_portalAccessId_revokedAt_expiresAt_idx"
    ON "auth_sessions"("portalAccessId", "revokedAt", "expiresAt");
CREATE INDEX "user_invitations_tenantId_portalAccessId_status_idx"
    ON "user_invitations"("tenantId", "portalAccessId", "status");

ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_tenantId_customerId_fkey"
    FOREIGN KEY ("tenantId", "customerId") REFERENCES "customers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_tenantId_contactId_fkey"
    FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "tenant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_tenantId_customerId_branchId_fkey"
    FOREIGN KEY ("tenantId", "customerId", "branchId") REFERENCES "customer_branches"("tenantId", "customerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accesses"
    ADD CONSTRAINT "customer_portal_accesses_tenantId_customerId_departmentId_fkey"
    FOREIGN KEY ("tenantId", "customerId", "departmentId") REFERENCES "customer_departments"("tenantId", "customerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_portalAccessId_fkey"
    FOREIGN KEY ("portalAccessId") REFERENCES "customer_portal_accesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_invitations"
    ADD CONSTRAINT "user_invitations_portalAccessId_fkey"
    FOREIGN KEY ("portalAccessId") REFERENCES "customer_portal_accesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve every legacy portal link as an independent access.  The contact id
-- is safe as the initial access id because it belongs to a different table and
-- makes the backfill deterministic if the migration is reviewed or retried.
INSERT INTO "customer_portal_accesses" (
    "id", "tenantId", "customerId", "contactId", "membershipId", "userId", "login",
    "accessProfile", "branchId", "departmentId", "active", "createdAt", "updatedAt"
)
SELECT
    c."id", c."tenantId", c."customerId", c."id", c."portalMembershipId", tm."userId",
    COALESCE(c."portal_login", LOWER(c."email")), c."customerAccessProfile",
    c."customerBranchId", c."customerDepartmentId", c."portalAccessActive",
    c."createdAt", c."updatedAt"
FROM "contacts" c
LEFT JOIN "tenant_memberships" tm ON tm."id" = c."portalMembershipId"
WHERE c."customerId" IS NOT NULL
  AND c."customerAccessProfile" IS NOT NULL
  AND c."customerBranchId" IS NOT NULL
  AND (c."portalMembershipId" IS NOT NULL OR c."portal_login" IS NOT NULL OR c."portalAccessActive" = true)
  AND COALESCE(c."portal_login", LOWER(c."email")) IS NOT NULL;

UPDATE "user_invitations" i
SET "portalAccessId" = a."id"
FROM "customer_portal_accesses" a
WHERE i."contactId" = a."contactId"
  AND i."tenantId" = a."tenantId";

-- Legacy refresh/access sessions do not identify which customer portal access
-- they represent. Revoke only sessions tied to a membership that was actually
-- backfilled so the next login must select and persist an explicit access.
UPDATE "auth_sessions" s
SET "revokedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE s."revokedAt" IS NULL
  AND s."portalAccessId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "customer_portal_accesses" a
    WHERE a."membershipId" = s."membershipId"
  );

COMMIT;
