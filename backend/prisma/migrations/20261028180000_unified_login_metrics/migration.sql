CREATE TABLE "login_metric_bindings" (
  "source_id" TEXT NOT NULL, "local_tenant_id" TEXT NOT NULL, "tenant_key" TEXT NOT NULL,
  "canonical_tenant_id" TEXT NOT NULL, "environment" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("source_id", "local_tenant_id")
);
CREATE INDEX "login_metric_bindings_canonical_tenant_id_idx" ON "login_metric_bindings"("canonical_tenant_id");
CREATE TABLE "login_metric_events" (
  "source_id" TEXT NOT NULL, "event_id" TEXT NOT NULL, "local_tenant_id" TEXT NOT NULL,
  "canonical_tenant_id" TEXT NOT NULL, "environment" TEXT NOT NULL, "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("source_id", "event_id")
);
CREATE INDEX "login_metric_events_canonical_tenant_id_occurred_at_idx" ON "login_metric_events"("canonical_tenant_id", "occurred_at");
CREATE TABLE "login_metric_nonces" (
  "source_id" TEXT NOT NULL, "nonce" TEXT NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("source_id", "nonce")
);
CREATE INDEX "login_metric_nonces_expires_at_idx" ON "login_metric_nonces"("expires_at");
CREATE TABLE "login_metric_source_states" (
  "source_id" TEXT NOT NULL PRIMARY KEY, "environment" TEXT NOT NULL,
  "last_contact_at" TIMESTAMPTZ(3) NOT NULL, "observed_at" TIMESTAMPTZ(3) NOT NULL, "pending" INTEGER NOT NULL CHECK ("pending" >= 0)
);
