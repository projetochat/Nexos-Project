CREATE TABLE "countries" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(2) NOT NULL,
  "name" TEXT NOT NULL,
  "geonames_id" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "administrative_divisions" (
  "id" TEXT NOT NULL,
  "country_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "geonames_id" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "administrative_divisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cities" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "country_id" TEXT NOT NULL,
  "division_id" TEXT,
  "ibge_code" TEXT,
  "geonames_id" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_catalog_versions" (
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

ALTER TABLE "platform_clients"
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Brasil',
  ADD COLUMN "city_id" TEXT;

ALTER TABLE "customers" ADD COLUMN "city_id" TEXT;

CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");
CREATE UNIQUE INDEX "countries_geonames_id_key" ON "countries"("geonames_id");
CREATE INDEX "countries_active_name_idx" ON "countries"("active", "name");
CREATE UNIQUE INDEX "administrative_divisions_geonames_id_key" ON "administrative_divisions"("geonames_id");
CREATE UNIQUE INDEX "administrative_divisions_country_id_code_key" ON "administrative_divisions"("country_id", "code");
CREATE INDEX "administrative_divisions_country_id_active_name_idx" ON "administrative_divisions"("country_id", "active", "name");
CREATE UNIQUE INDEX "cities_dedupe_key_key" ON "cities"("dedupe_key");
CREATE UNIQUE INDEX "cities_ibge_code_key" ON "cities"("ibge_code");
CREATE UNIQUE INDEX "cities_geonames_id_key" ON "cities"("geonames_id");
CREATE INDEX "cities_country_id_division_id_active_normalized_name_idx" ON "cities"("country_id", "division_id", "active", "normalized_name");
CREATE INDEX "cities_normalized_name_idx" ON "cities"("normalized_name");
CREATE INDEX "cities_name_idx" ON "cities"("name");
CREATE UNIQUE INDEX "location_catalog_versions_artifact_sha256_key"
  ON "location_catalog_versions"("artifact_sha256");
CREATE INDEX "platform_clients_city_id_idx" ON "platform_clients"("city_id");
CREATE INDEX "customers_city_id_idx" ON "customers"("city_id");

ALTER TABLE "administrative_divisions"
  ADD CONSTRAINT "administrative_divisions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cities"
  ADD CONSTRAINT "cities_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cities"
  ADD CONSTRAINT "cities_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "administrative_divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_clients"
  ADD CONSTRAINT "platform_clients_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
