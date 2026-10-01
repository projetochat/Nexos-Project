ALTER TABLE "impersonation_sessions"
ADD COLUMN "handoffCodeHash" TEXT,
ADD COLUMN "handoffChallenge" TEXT,
ADD COLUMN "handoffExpiresAt" TIMESTAMP(3),
ADD COLUMN "handoffConsumedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "impersonation_sessions_handoffCodeHash_key"
ON "impersonation_sessions"("handoffCodeHash");

CREATE INDEX "impersonation_sessions_handoffExpiresAt_handoffConsumedAt_idx"
ON "impersonation_sessions"("handoffExpiresAt", "handoffConsumedAt");
