BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TABLE IF NOT EXISTS "location_catalog_versions" (
  "version" TEXT NOT NULL,
  "artifact_sha256" VARCHAR(64) NOT NULL,
  "status" TEXT NOT NULL,
  "countries_count" INTEGER NOT NULL,
  "divisions_count" INTEGER NOT NULL,
  "cities_count" INTEGER NOT NULL,
  "loaded_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_catalog_versions_pkey" PRIMARY KEY ("version"),
  CONSTRAINT "location_catalog_versions_status_check"
    CHECK ("status" IN ('ACTIVE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "location_catalog_versions_artifact_sha256_key"
  ON "location_catalog_versions"("artifact_sha256");

COMMIT;
