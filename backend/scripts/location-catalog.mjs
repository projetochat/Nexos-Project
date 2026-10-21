import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const packagedCatalogDir = resolve(backendDir, "data", "locations", "catalog-v1");
const sha256Pattern = /^[a-f0-9]{64}$/;
const versionPattern = /^[a-z0-9][a-z0-9._-]{1,127}$/;

export function verifyPackagedLocationCatalog(catalogDir = packagedCatalogDir) {
  const manifestPath = resolve(catalogDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateManifest(manifest);

  const catalogHash = createHash("sha256");
  const observed = { countries: 0, divisions: 0, cities: 0, brazilianMunicipalities: 0 };
  const countryCodes = new Set();
  const divisionKeys = new Set();
  const cityKeys = new Set();
  const geonamesIds = new Set();
  const ibgeCodes = new Set();

  for (const file of manifest.files) {
    const rows = readVerifiedShard(catalogDir, file, catalogHash);
    observed[file.kind] += rows.length;
    for (const row of rows) {
      if (file.kind === "countries") {
        requireRow(row, 3, file.name);
        if (!/^[A-Z]{2}$/.test(row[0]) || !row[1] || countryCodes.has(row[0])) {
          throw catalogError("LOCATION_CATALOG_COUNTRY_INVALID", file.name);
        }
        countryCodes.add(row[0]);
      } else if (file.kind === "divisions") {
        requireRow(row, 4, file.name);
        const key = `${row[0]}.${row[1]}`;
        if (!/^[A-Z]{2}$/.test(row[0]) || !row[1] || !row[2] || divisionKeys.has(key)) {
          throw catalogError("LOCATION_CATALOG_DIVISION_INVALID", file.name);
        }
        divisionKeys.add(key);
      } else {
        requireRow(row, 9, file.name);
        const [name, normalizedName, dedupeKey, countryCode, divisionCode, ibgeCode, geonamesId] =
          row;
        if (
          !name ||
          !normalizedName ||
          dedupeKey !== `${countryCode}|${divisionCode || "-"}|${normalizedName}` ||
          cityKeys.has(dedupeKey) ||
          (ibgeCode && ibgeCodes.has(ibgeCode)) ||
          (geonamesId && geonamesIds.has(geonamesId))
        ) {
          throw catalogError("LOCATION_CATALOG_CITY_INVALID", file.name);
        }
        cityKeys.add(dedupeKey);
        if (ibgeCode) {
          ibgeCodes.add(ibgeCode);
          if (countryCode !== "BR" || !/^\d{7}$/.test(ibgeCode)) {
            throw catalogError("LOCATION_CATALOG_IBGE_INVALID", file.name);
          }
          observed.brazilianMunicipalities += 1;
        }
        if (geonamesId) geonamesIds.add(geonamesId);
      }
    }
  }

  if (!countryCodes.has("BR")) throw catalogError("LOCATION_CATALOG_BRAZIL_MISSING");
  for (const key of divisionKeys) {
    if (!countryCodes.has(key.slice(0, 2))) {
      throw catalogError("LOCATION_CATALOG_DIVISION_COUNTRY_MISSING", key);
    }
  }
  for (const file of manifest.files.filter((item) => item.kind === "cities")) {
    for (const row of readVerifiedShard(catalogDir, file)) {
      if (!countryCodes.has(row[3])) {
        throw catalogError("LOCATION_CATALOG_CITY_COUNTRY_MISSING", row[2]);
      }
      if (row[4] && !divisionKeys.has(`${row[3]}.${row[4]}`)) {
        throw catalogError("LOCATION_CATALOG_CITY_DIVISION_MISSING", row[2]);
      }
    }
  }
  if (catalogHash.digest("hex") !== manifest.catalogSha256) {
    throw catalogError("LOCATION_CATALOG_HASH_MISMATCH");
  }
  for (const key of Object.keys(observed)) {
    if (observed[key] !== manifest.counts[key]) {
      throw catalogError("LOCATION_CATALOG_COUNT_MISMATCH", key);
    }
  }
  return manifest;
}

export async function loadPackagedLocationCatalog(prisma, catalogDir = packagedCatalogDir) {
  const manifest = verifyPackagedLocationCatalog(catalogDir);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        "trixus-location-catalog",
      );
      const existing = await tx.$queryRawUnsafe(
        `SELECT "artifact_sha256", "status", "countries_count", "divisions_count", "cities_count"
           FROM "location_catalog_versions"
          WHERE "version" = $1`,
        manifest.version,
      );
      if (existing.length === 1) {
        const row = existing[0];
        if (
          row.artifact_sha256 !== manifest.catalogSha256 ||
          row.status !== "ACTIVE" ||
          Number(row.countries_count) !== manifest.counts.countries ||
          Number(row.divisions_count) !== manifest.counts.divisions ||
          Number(row.cities_count) !== manifest.counts.cities
        ) {
          throw catalogError("LOCATION_CATALOG_REGISTERED_STATE_INVALID");
        }
        await assertDatabaseCounts(tx, manifest);
        return { status: "ALREADY_ACTIVE", manifest };
      }

      const countries = catalogRows(catalogDir, manifest, "countries").map((row) => ({
        id: randomUUID(),
        code: row[0],
        name: row[1],
        geonamesId: row[2],
      }));
      await executeBatches(countries, 500, (batch) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "countries" ("id", "code", "name", "geonames_id", "active", "created_at", "updated_at")
           SELECT item."id", item."code", item."name", item."geonamesId", true, now(), now()
             FROM jsonb_to_recordset($1::jsonb)
               AS item("id" text, "code" text, "name" text, "geonamesId" text)
           ON CONFLICT ("code") DO UPDATE SET
             "name" = EXCLUDED."name",
             "geonames_id" = EXCLUDED."geonames_id",
             "active" = true,
             "updated_at" = now()`,
          JSON.stringify(batch),
        ),
      );
      const countryRows = await tx.$queryRawUnsafe(`SELECT "id", "code" FROM "countries"`);
      const countryIds = new Map(countryRows.map((row) => [row.code, row.id]));

      const divisions = catalogRows(catalogDir, manifest, "divisions").map((row) => ({
        id: randomUUID(),
        countryId: requiredMap(countryIds, row[0], "LOCATION_CATALOG_COUNTRY_NOT_LOADED"),
        countryCode: row[0],
        code: row[1],
        name: row[2],
        geonamesId: row[3],
      }));
      await executeBatches(divisions, 500, (batch) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "administrative_divisions"
             ("id", "country_id", "code", "name", "geonames_id", "active", "created_at", "updated_at")
           SELECT item."id", item."countryId", item."code", item."name", item."geonamesId", true, now(), now()
             FROM jsonb_to_recordset($1::jsonb)
               AS item("id" text, "countryId" text, "code" text, "name" text, "geonamesId" text)
           ON CONFLICT ("country_id", "code") DO UPDATE SET
             "name" = EXCLUDED."name",
             "geonames_id" = EXCLUDED."geonames_id",
             "active" = true,
             "updated_at" = now()`,
          JSON.stringify(batch),
        ),
      );
      const divisionRows = await tx.$queryRawUnsafe(
        `SELECT division."id", country."code" AS "countryCode", division."code"
           FROM "administrative_divisions" division
           JOIN "countries" country ON country."id" = division."country_id"`,
      );
      const divisionIds = new Map(
        divisionRows.map((row) => [`${row.countryCode}.${row.code}`, row.id]),
      );

      for (const file of manifest.files.filter((item) => item.kind === "cities")) {
        const cities = readVerifiedShard(catalogDir, file).map((row) => ({
          id: randomUUID(),
          name: row[0],
          normalizedName: row[1],
          dedupeKey: row[2],
          countryId: requiredMap(countryIds, row[3], "LOCATION_CATALOG_COUNTRY_NOT_LOADED"),
          divisionId: row[4]
            ? requiredMap(
                divisionIds,
                `${row[3]}.${row[4]}`,
                "LOCATION_CATALOG_DIVISION_NOT_LOADED",
              )
            : null,
          ibgeCode: row[5],
          geonamesId: row[6],
          latitude: row[7],
          longitude: row[8],
        }));
        await executeBatches(cities, 1_000, (batch) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "cities"
               ("id", "name", "normalized_name", "dedupe_key", "country_id", "division_id",
                "ibge_code", "geonames_id", "latitude", "longitude", "active", "created_at", "updated_at")
             SELECT item."id", item."name", item."normalizedName", item."dedupeKey",
                    item."countryId", item."divisionId", item."ibgeCode", item."geonamesId",
                    item."latitude", item."longitude", true, now(), now()
               FROM jsonb_to_recordset($1::jsonb)
                 AS item("id" text, "name" text, "normalizedName" text, "dedupeKey" text,
                         "countryId" text, "divisionId" text, "ibgeCode" text, "geonamesId" text,
                         "latitude" double precision, "longitude" double precision)
             ON CONFLICT ("dedupe_key") DO UPDATE SET
               "name" = EXCLUDED."name",
               "country_id" = EXCLUDED."country_id",
               "division_id" = EXCLUDED."division_id",
               "ibge_code" = EXCLUDED."ibge_code",
               "geonames_id" = EXCLUDED."geonames_id",
               "latitude" = EXCLUDED."latitude",
               "longitude" = EXCLUDED."longitude",
               "active" = true,
               "updated_at" = now()`,
            JSON.stringify(batch),
          ),
        );
      }

      await assertDatabaseCounts(tx, manifest);
      await tx.$executeRawUnsafe(
        `INSERT INTO "location_catalog_versions"
           ("version", "artifact_sha256", "status", "countries_count", "divisions_count",
            "cities_count", "loaded_at")
         VALUES ($1, $2, 'ACTIVE', $3, $4, $5, now())`,
        manifest.version,
        manifest.catalogSha256,
        manifest.counts.countries,
        manifest.counts.divisions,
        manifest.counts.cities,
      );
      return { status: "IMPORTED", manifest };
    },
    { maxWait: 10_000, timeout: 600_000 },
  );
}

export async function inspectLoadedLocationCatalog(prisma, manifest) {
  const table = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public.location_catalog_versions') IS NOT NULL AS "exists"`,
  );
  if (!table[0]?.exists) return { status: "SCHEMA_PENDING" };
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "artifact_sha256", "status", "countries_count", "divisions_count", "cities_count"
       FROM "location_catalog_versions"
      WHERE "version" = $1`,
    manifest.version,
  );
  if (rows.length === 0) return { status: "IMPORT_PENDING" };
  if (
    rows.length !== 1 ||
    rows[0].artifact_sha256 !== manifest.catalogSha256 ||
    rows[0].status !== "ACTIVE"
  ) {
    throw catalogError("LOCATION_CATALOG_REGISTERED_STATE_INVALID");
  }
  await assertDatabaseCounts(prisma, manifest);
  return { status: "ACTIVE" };
}

function validateManifest(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    !versionPattern.test(manifest.version || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.snapshotDate || "") ||
    !sha256Pattern.test(manifest.catalogSha256 || "") ||
    !Array.isArray(manifest.sources) ||
    !Array.isArray(manifest.files) ||
    !manifest.counts
  ) {
    throw catalogError("LOCATION_CATALOG_MANIFEST_INVALID");
  }
  for (const key of ["countries", "divisions", "cities", "brazilianMunicipalities"]) {
    if (!Number.isSafeInteger(manifest.counts[key]) || manifest.counts[key] <= 0) {
      throw catalogError("LOCATION_CATALOG_MANIFEST_INVALID", key);
    }
  }
  for (const file of manifest.files) {
    if (
      basename(file.name || "") !== file.name ||
      !new Set(["countries", "divisions", "cities"]).has(file.kind) ||
      !Number.isSafeInteger(file.rows) ||
      file.rows <= 0 ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      !sha256Pattern.test(file.sha256 || "")
    ) {
      throw catalogError("LOCATION_CATALOG_MANIFEST_INVALID", file.name);
    }
  }
}

function readVerifiedShard(catalogDir, file, catalogHash = null) {
  const path = resolve(catalogDir, file.name);
  const content = readFileSync(path);
  if (
    content.length !== file.bytes ||
    createHash("sha256").update(content).digest("hex") !== file.sha256
  ) {
    throw catalogError("LOCATION_CATALOG_SHARD_MISMATCH", file.name);
  }
  const text = gunzipSync(content).toString("utf8");
  catalogHash?.update(file.kind).update("\0").update(text);
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (lines.length !== file.rows)
    throw catalogError("LOCATION_CATALOG_SHARD_COUNT_MISMATCH", file.name);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw catalogError("LOCATION_CATALOG_SHARD_JSON_INVALID", file.name);
  }
}

function catalogRows(catalogDir, manifest, kind) {
  return manifest.files
    .filter((file) => file.kind === kind)
    .flatMap((file) => readVerifiedShard(catalogDir, file));
}

function requireRow(row, length, file) {
  if (!Array.isArray(row) || row.length !== length) {
    throw catalogError("LOCATION_CATALOG_ROW_INVALID", file);
  }
}

async function executeBatches(items, size, execute) {
  for (let offset = 0; offset < items.length; offset += size) {
    await execute(items.slice(offset, offset + size));
  }
}

function requiredMap(map, key, code) {
  const value = map.get(key);
  if (!value) throw catalogError(code, key);
  return value;
}

async function assertDatabaseCounts(prisma, manifest) {
  const [counts] = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM "countries") AS "countries",
      (SELECT count(*)::int FROM "administrative_divisions") AS "divisions",
      (SELECT count(*)::int FROM "cities") AS "cities",
      (SELECT count(*)::int FROM "cities" WHERE "ibge_code" IS NOT NULL)
        AS "brazilianMunicipalities"
  `);
  for (const key of Object.keys(manifest.counts)) {
    if (Number(counts[key]) !== manifest.counts[key]) {
      throw catalogError("LOCATION_CATALOG_DATABASE_COUNT_MISMATCH", key);
    }
  }
}

function catalogError(code, detail = null) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  return error;
}
