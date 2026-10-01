-- Persist the server-side lifecycle shared by an access/refresh token pair.
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "membershipId" TEXT,
    "impersonationSessionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_userId_revokedAt_expiresAt_idx"
ON "auth_sessions"("userId", "revokedAt", "expiresAt");

CREATE INDEX "auth_sessions_tenantId_membershipId_revokedAt_expiresAt_idx"
ON "auth_sessions"("tenantId", "membershipId", "revokedAt", "expiresAt");

CREATE INDEX "auth_sessions_impersonationSessionId_idx"
ON "auth_sessions"("impersonationSessionId");

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_impersonationSessionId_fkey"
FOREIGN KEY ("impersonationSessionId") REFERENCES "impersonation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
