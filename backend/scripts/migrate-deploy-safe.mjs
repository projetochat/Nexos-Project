import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readFileSync, readdirSync, realpathSync } from "node:fs";
import { promisify } from "node:util";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
export const MIGRATION_NAME = "20261005210000_contact_custom_field_identity";
export const WRAPPER_VERSION = "2";
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationFile = resolve(backendDir, "prisma", "migrations", MIGRATION_NAME, "migration.sql");
const reconciliationManifestFile = resolve(backendDir, "prisma", "migration-reconciliations.json");
const readFileAsync = promisify(readFile);
const migrationSql = readFileSync(migrationFile, "utf8");
export const nativeKeys = migrationCatalogArray(migrationSql, "RESERVED_KEYS");
export const nativeNames = migrationCatalogArray(migrationSql, "NATIVE_NAMES");

const collisionReportQuery = `
WITH generated AS (
  SELECT
    field."id",
    field."tenantId",
    field."archivedAt",
    lower(regexp_replace(normalize(trim(field."label"), NFKC), '\\s+', ' ', 'g')) AS normalized_name,
    trim(both '_' from regexp_replace(
      translate(lower(normalize(trim(field."label"), NFKC)),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'),
      '[^a-z0-9]+', '_', 'g'
    )) AS base_key
  FROM "contact_custom_fields" field
), identities AS (
  SELECT
    generated."id",
    generated."tenantId",
    generated."archivedAt",
    generated.normalized_name,
    COALESCE(
      NULLIF(
        string_agg(part.token, '_' ORDER BY part.ordinal)
          FILTER (
            WHERE part.token <> ''
              AND part.token NOT IN (
                'de','do','dos','da','das','o','a','os','as',
                'um','uns','uma','umas','e','ou'
              )
          ),
        ''
      ),
      generated.base_key
    ) AS candidate_key
  FROM generated
  LEFT JOIN LATERAL regexp_split_to_table(generated.base_key, '_')
    WITH ORDINALITY AS part(token, ordinal) ON true
  GROUP BY
    generated."id",
    generated."tenantId",
    generated."archivedAt",
    generated.normalized_name,
    generated.base_key
), value_counts AS (
  SELECT "fieldId", count(*)::int AS value_count
  FROM "contact_custom_field_values"
  GROUP BY "fieldId"
), normalized_collisions AS (
  SELECT
    identities."tenantId" AS tenant_id,
    identities.normalized_name AS conflicting_key,
    'normalized_name'::text AS collision_type,
    count(*)::int AS definition_count,
    count(*) FILTER (WHERE identities."archivedAt" IS NULL)::int AS active_count,
    count(*) FILTER (WHERE identities."archivedAt" IS NOT NULL)::int AS archived_count,
    COALESCE(sum(value_counts.value_count), 0)::int AS value_count
  FROM identities
  LEFT JOIN value_counts ON value_counts."fieldId" = identities."id"
  GROUP BY identities."tenantId", identities.normalized_name
  HAVING count(*) > 1
), native_name_collisions AS (
  SELECT
    identities."tenantId" AS tenant_id,
    identities.normalized_name AS conflicting_key,
    'native_name'::text AS collision_type,
    count(*)::int AS definition_count,
    count(*) FILTER (WHERE identities."archivedAt" IS NULL)::int AS active_count,
    count(*) FILTER (WHERE identities."archivedAt" IS NOT NULL)::int AS archived_count,
    COALESCE(sum(value_counts.value_count), 0)::int AS value_count
  FROM identities
  LEFT JOIN value_counts ON value_counts."fieldId" = identities."id"
  WHERE identities.normalized_name = ANY($2::text[])
  GROUP BY identities."tenantId", identities.normalized_name
), technical_collisions AS (
  SELECT
    identities."tenantId" AS tenant_id,
    identities.candidate_key AS conflicting_key,
    CASE
      WHEN identities.candidate_key = '' THEN 'empty_key'
      WHEN identities.candidate_key = ANY($1::text[]) THEN 'native_key'
      ELSE 'variable_key'
    END::text AS collision_type,
    count(*)::int AS definition_count,
    count(*) FILTER (WHERE identities."archivedAt" IS NULL)::int AS active_count,
    count(*) FILTER (WHERE identities."archivedAt" IS NOT NULL)::int AS archived_count,
    COALESCE(sum(value_counts.value_count), 0)::int AS value_count
  FROM identities
  LEFT JOIN value_counts ON value_counts."fieldId" = identities."id"
  GROUP BY identities."tenantId", identities.candidate_key
  HAVING
    identities.candidate_key = ''
    OR identities.candidate_key = ANY($1::text[])
    OR count(*) > 1
)
SELECT * FROM normalized_collisions
UNION ALL
SELECT * FROM native_name_collisions
UNION ALL
SELECT * FROM technical_collisions
ORDER BY tenant_id, collision_type, conflicting_key
`;

const semanticValidationQuery = `
WITH generated AS (
  SELECT
    field."id",
    field."tenantId",
    field."variableKey",
    field."normalizedName",
    lower(regexp_replace(normalize(trim(field."label"), NFKC), '\\s+', ' ', 'g')) AS expected_name,
    trim(both '_' from regexp_replace(
      translate(lower(normalize(trim(field."label"), NFKC)),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'),
      '[^a-z0-9]+', '_', 'g'
    )) AS base_key
  FROM "contact_custom_fields" field
), expected AS (
  SELECT
    generated.*,
    COALESCE(
      NULLIF(
        string_agg(part.token, '_' ORDER BY part.ordinal)
          FILTER (
            WHERE part.token <> ''
              AND part.token NOT IN (
                'de','do','dos','da','das','o','a','os','as',
                'um','uns','uma','umas','e','ou'
              )
          ),
        ''
      ),
      generated.base_key
    ) AS expected_key
  FROM generated
  LEFT JOIN LATERAL regexp_split_to_table(generated.base_key, '_')
    WITH ORDINALITY AS part(token, ordinal) ON true
  GROUP BY
    generated."id",
    generated."tenantId",
    generated."variableKey",
    generated."normalizedName",
    generated.expected_name,
    generated.base_key
), duplicate_rows AS (
  SELECT count(*) - 1 AS extras
  FROM expected
  WHERE "variableKey" IS NOT NULL
  GROUP BY "tenantId", "variableKey"
  HAVING count(*) > 1
)
SELECT
  count(*)::int AS total_rows,
  count(*) FILTER (WHERE "variableKey" IS NULL)::int AS null_keys,
  count(*) FILTER (WHERE btrim("variableKey") = '')::int AS empty_keys,
  count(*) FILTER (
    WHERE "variableKey" IS NOT NULL
      AND "variableKey" !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  )::int AS invalid_format_keys,
  count(*) FILTER (WHERE "variableKey" = ANY($1::text[]))::int AS reserved_keys,
  count(*) FILTER (WHERE "variableKey" IS DISTINCT FROM expected_key)::int AS unexpected_keys,
  count(*) FILTER (WHERE "normalizedName" IS DISTINCT FROM expected_name)::int
    AS unexpected_normalized_names,
  COALESCE((SELECT sum(extras) FROM duplicate_rows), 0)::int AS duplicate_keys
FROM expected
`;

export async function migrationChecksum() {
  return fileChecksum(migrationFile);
}

async function fileChecksum(path) {
  const bytes = await readFileAsync(path);
  return createHash("sha256").update(bytes).digest("hex");
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const MIGRATION_FOLDER_PATTERN = /^\d{14}_[a-z0-9_]+$/;

export function validateReconciliationManifest(manifest) {
  const entries = manifest.contactCustomFieldIdentity ?? [];
  if (
    !Array.isArray(entries) ||
    Object.keys(manifest).length !== 1 ||
    !Object.hasOwn(manifest, "contactCustomFieldIdentity")
  ) {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_MANIFEST_INVALID");
  }
  const seenCurrentChecksums = new Set();
  const seenLegacyChecksums = new Set();
  for (const entry of entries) {
    const keys = Object.keys(entry ?? {}).sort();
    if (
      keys.join(",") !==
        "currentChecksum,forwardChecksum,forwardMigration,legacyByteLength,legacyChecksum,legacyCommit,legacyGitBlob" ||
      !SHA256_PATTERN.test(entry.currentChecksum ?? "") ||
      !SHA256_PATTERN.test(entry.legacyChecksum ?? "") ||
      !SHA256_PATTERN.test(entry.forwardChecksum ?? "") ||
      !SHA1_PATTERN.test(entry.legacyCommit ?? "") ||
      !SHA1_PATTERN.test(entry.legacyGitBlob ?? "") ||
      !Number.isSafeInteger(entry.legacyByteLength) ||
      entry.legacyByteLength <= 0 ||
      !MIGRATION_FOLDER_PATTERN.test(entry.forwardMigration ?? "") ||
      basename(entry.forwardMigration) !== entry.forwardMigration ||
      seenCurrentChecksums.has(entry.currentChecksum) ||
      seenLegacyChecksums.has(entry.legacyChecksum)
    ) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_MANIFEST_INVALID");
    }
    seenCurrentChecksums.add(entry.currentChecksum);
    seenLegacyChecksums.add(entry.legacyChecksum);
  }
  return entries;
}

export async function reviewedReconciliations(expectedChecksum) {
  const manifest = JSON.parse(await readFileAsync(reconciliationManifestFile, "utf8"));
  const entries = validateReconciliationManifest(manifest);
  const migrationRoot = realpathSync(resolve(backendDir, "prisma", "migrations"));
  const reviewed = [];
  for (const entry of entries) {
    let forwardDirectory;
    try {
      forwardDirectory = realpathSync(resolve(migrationRoot, entry.forwardMigration));
    } catch {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_ARTIFACT_MISSING");
    }
    const relativeForward = relative(migrationRoot, forwardDirectory);
    if (
      !relativeForward ||
      relativeForward.startsWith(`..${sep}`) ||
      relativeForward === ".." ||
      resolve(migrationRoot, relativeForward) !== forwardDirectory
    ) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_MANIFEST_INVALID");
    }
    const forwardFile = resolve(forwardDirectory, "migration.sql");
    if ((await fileChecksum(forwardFile)) !== entry.forwardChecksum) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_ARTIFACT_MISMATCH");
    }
    if (entry.currentChecksum !== expectedChecksum) continue;
    reviewed.push(entry);
  }
  return reviewed;
}

export function hasUnknownMigrationHistory(rows, folderNames) {
  const folderSet = folderNames instanceof Set ? folderNames : new Set(folderNames);
  return rows.some((row) => !folderSet.has(row.migration_name));
}

export function validateFullMigrationHistory(rows, migrations, reconciliationPolicy = null) {
  const migrationNames = migrations.map((migration) => migration.name);
  if (hasUnknownMigrationHistory(rows, migrationNames)) {
    throw safeError("MIGRATION_HISTORY_UNKNOWN_ARTIFACT");
  }

  let pendingSuffixStarted = false;
  let legacyReconciliation = false;
  let forwardState = null;
  for (const migration of migrations) {
    const historyRows = rows.filter((row) => row.migration_name === migration.name);
    if (historyRows.some((row) => row.rolled_back_at)) {
      throw safeError("MIGRATION_HISTORY_ROLLED_BACK", [migration.name]);
    }
    if (historyRows.some((row) => !row.finished_at)) {
      throw safeError("MIGRATION_HISTORY_INCOMPLETE", [migration.name]);
    }
    if (historyRows.length > 1) {
      throw safeError("MIGRATION_HISTORY_AMBIGUOUS", [migration.name]);
    }

    const row = historyRows[0];
    if (!row) {
      pendingSuffixStarted = true;
      if (migration.name === reconciliationPolicy?.forwardMigration) {
        forwardState = "NOT_APPLIED";
      }
      continue;
    }
    if (pendingSuffixStarted) {
      throw safeError("MIGRATION_HISTORY_GAP", [migration.name]);
    }
    if (
      migration.name === MIGRATION_NAME &&
      reconciliationPolicy &&
      row.checksum === reconciliationPolicy.legacyChecksum
    ) {
      legacyReconciliation = true;
      continue;
    }
    if (row.checksum !== migration.checksum) {
      throw safeError("MIGRATION_HISTORY_CHECKSUM_MISMATCH", [migration.name]);
    }
    if (migration.name === reconciliationPolicy?.forwardMigration) {
      forwardState = "COMPLETED_VALID";
    }
  }

  if (legacyReconciliation) {
    if (!reconciliationPolicy) {
      throw safeError("MIGRATION_HISTORY_CHECKSUM_MISMATCH", [MIGRATION_NAME]);
    }
    const forwardIndex = migrationNames.indexOf(reconciliationPolicy.forwardMigration);
    const targetIndex = migrationNames.indexOf(MIGRATION_NAME);
    if (forwardIndex <= targetIndex || forwardIndex === -1) {
      throw safeError("MIGRATION_RECONCILIATION_ORDER_INVALID");
    }
    if (!forwardState) {
      forwardState = "NOT_APPLIED";
    }
  }

  return {
    reconciliationRequired: legacyReconciliation && forwardState === "NOT_APPLIED",
    reconciliationCompleted: legacyReconciliation && forwardState === "COMPLETED_VALID",
  };
}

export async function inspectFullMigrationHistory(prisma, expectedChecksum) {
  const [presence] = await prisma.$queryRawUnsafe(`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS history_exists
  `);
  if (!presence.history_exists) {
    return { reconciliationRequired: false, reconciliationCompleted: false };
  }

  const migrationRoot = resolve(backendDir, "prisma", "migrations");
  const migrations = await Promise.all(
    readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map(async (name) => ({
        name,
        checksum: await fileChecksum(resolve(migrationRoot, name, "migration.sql")),
      })),
  );
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "migration_name", "checksum", "finished_at", "rolled_back_at"
     FROM "_prisma_migrations"
     ORDER BY "migration_name", "started_at", "id"`,
  );
  const policies = await reviewedReconciliations(expectedChecksum);
  if (policies.length > 1) {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_MANIFEST_AMBIGUOUS");
  }
  return validateFullMigrationHistory(rows, migrations, policies[0] ?? null);
}

async function migrationRows(prisma, migrationName) {
  return prisma.$queryRawUnsafe(
    `SELECT "id", "checksum", "started_at", "finished_at", "rolled_back_at",
            "applied_steps_count"
     FROM "_prisma_migrations"
     WHERE "migration_name" = $1
     ORDER BY "started_at", "id"`,
    migrationName,
  );
}

async function reconciliationState(prisma, historyRows, expectedChecksum, allowPending) {
  for (const policy of await reviewedReconciliations(expectedChecksum)) {
    const completed = historyRows.filter((row) => row.finished_at && !row.rolled_back_at);
    if (
      completed.length !== 1 ||
      completed[0].checksum !== policy.legacyChecksum ||
      historyRows.some((row) => row.checksum !== policy.legacyChecksum)
    ) {
      continue;
    }
    const forwardRows = await migrationRows(prisma, policy.forwardMigration);
    const forwardState = classifyMigrationHistory(forwardRows, policy.forwardChecksum);
    if (forwardState === "COMPLETED_VALID") {
      return { migrationState: "COMPLETED_RECONCILED", forwardState, policy };
    }
    if (allowPending && ["NOT_APPLIED", "ROLLED_BACK"].includes(forwardState)) {
      return { migrationState: "RECONCILIATION_PENDING", forwardState, policy };
    }
  }
  return null;
}

async function expectedForwardState(prisma, expectedChecksum) {
  const [policy] = await reviewedReconciliations(expectedChecksum);
  if (!policy) return { forwardState: null, policy: null };
  const rows = await migrationRows(prisma, policy.forwardMigration);
  return { forwardState: classifyMigrationHistory(rows, policy.forwardChecksum), policy };
}

export async function assertOnlyReviewedForwardPending(expectedChecksum, policy) {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  try {
    const allRows = await prisma.$queryRawUnsafe(
      `SELECT "migration_name", "checksum", "finished_at", "rolled_back_at"
       FROM "_prisma_migrations"
       ORDER BY "migration_name", "started_at", "id"`,
    );
    const migrationRoot = resolve(backendDir, "prisma", "migrations");
    const folders = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const folderSet = new Set(folders);
    if (!folderSet.has(policy.forwardMigration)) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_FORWARD_MISSING");
    }
    if (hasUnknownMigrationHistory(allRows, folderSet)) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_UNKNOWN_MIGRATION_HISTORY");
    }
    for (const folder of folders) {
      const rows = allRows.filter((row) => row.migration_name === folder);
      if (folder === MIGRATION_NAME) {
        const active = rows.filter((row) => row.finished_at && !row.rolled_back_at);
        if (
          active.length !== 1 ||
          active[0].checksum !== policy.legacyChecksum ||
          rows.some((row) => row.checksum !== policy.legacyChecksum)
        ) {
          throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_HISTORY_CHANGED");
        }
        continue;
      }
      const checksum = await fileChecksum(resolve(migrationRoot, folder, "migration.sql"));
      const state = classifyMigrationHistory(rows, checksum);
      if (folder === policy.forwardMigration) {
        if (!["NOT_APPLIED", "ROLLED_BACK"].includes(state)) {
          throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_FORWARD_NOT_PENDING");
        }
      } else if (state !== "COMPLETED_VALID") {
        throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_OTHER_MIGRATION_NOT_VALID", [folder]);
      }
    }
    if (expectedChecksum !== policy.currentChecksum) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_TARGET_CHANGED");
    }
  } finally {
    await prisma.$disconnect();
  }
}

export function migrationCatalogArray(sql, marker) {
  const block = new RegExp(
    `CONTACT_CUSTOM_FIELD_${marker}_START([\\s\\S]*?)CONTACT_CUSTOM_FIELD_${marker}_END`,
  ).exec(sql)?.[1];
  if (!block) throw safeError(`CONTACT_CUSTOM_FIELD_${marker}_MISSING`);
  return Array.from(block.matchAll(/'([^']+)'/g), (match) => match[1]);
}

export function classifyMigrationHistory(rows, expectedChecksum) {
  if (rows.some((row) => row.finished_at && row.rolled_back_at)) return "AMBIGUOUS_HISTORY";
  const completed = rows.filter((row) => row.finished_at && !row.rolled_back_at);
  const incomplete = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
  const rolledBack = rows.filter((row) => row.rolled_back_at);
  const mismatched = (collection) => collection.some((row) => row.checksum !== expectedChecksum);

  if (completed.length > 1 || incomplete.length > 1) return "AMBIGUOUS_HISTORY";
  if (incomplete.length > 0 && completed.length > 0) return "AMBIGUOUS_HISTORY";
  if (completed.length > 0 && mismatched(completed)) return "COMPLETED_CHECKSUM_MISMATCH";
  if (incomplete.length > 0 && mismatched(incomplete)) return "INCOMPLETE_CHECKSUM_MISMATCH";
  if (mismatched(rolledBack)) return "ROLLED_BACK_CHECKSUM_MISMATCH";
  if (incomplete.length > 0) return "INCOMPLETE";
  if (completed.length > 0) return "COMPLETED_VALID";
  if (rolledBack.length > 0) return "ROLLED_BACK";
  return "NOT_APPLIED";
}

export function structuralDrift(catalog) {
  const drift = [];
  if (!catalog.column_exists) drift.push("COLUMN_MISSING");
  if (catalog.column_exists && !catalog.column_is_text) drift.push("COLUMN_TYPE_NOT_TEXT");
  if (catalog.column_exists && !catalog.column_not_null) drift.push("COLUMN_NULLABLE");
  if (!catalog.index_name_exists) drift.push("INDEX_MISSING");
  if (catalog.index_name_exists && !catalog.index_on_target) drift.push("INDEX_WRONG_TABLE");
  if (catalog.index_exists && !catalog.index_unique) drift.push("INDEX_NOT_UNIQUE");
  if (catalog.index_exists && !catalog.index_valid) drift.push("INDEX_INVALID");
  if (catalog.index_exists && !catalog.index_ready) drift.push("INDEX_NOT_READY");
  if (catalog.index_exists && catalog.index_partial) drift.push("INDEX_PARTIAL");
  if (catalog.index_exists && catalog.index_expression) drift.push("INDEX_EXPRESSION");
  if (
    catalog.index_exists &&
    (Number(catalog.index_key_count) !== 2 || Number(catalog.index_attribute_count) !== 2)
  ) {
    drift.push("INDEX_KEY_COUNT");
  }
  if (
    catalog.index_exists &&
    JSON.stringify(catalog.index_columns ?? []) !== JSON.stringify(["tenantId", "variableKey"])
  ) {
    drift.push("INDEX_COLUMNS");
  }
  return drift;
}

export function semanticDrift(metrics) {
  const checks = [
    ["NULL_KEYS", metrics.null_keys],
    ["EMPTY_KEYS", metrics.empty_keys],
    ["INVALID_KEY_FORMAT", metrics.invalid_format_keys],
    ["RESERVED_KEYS", metrics.reserved_keys],
    ["UNEXPECTED_KEYS", metrics.unexpected_keys],
    ["UNEXPECTED_NORMALIZED_NAMES", metrics.unexpected_normalized_names],
    ["DUPLICATE_KEYS", metrics.duplicate_keys],
  ];
  return checks.filter(([, count]) => Number(count) !== 0).map(([code]) => code);
}

export function canonicalNormalizedName(value) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

export function canonicalVariableKey(value) {
  const words = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean);
  const stopWords = new Set([
    "de",
    "do",
    "dos",
    "da",
    "das",
    "o",
    "a",
    "os",
    "as",
    "um",
    "uns",
    "uma",
    "umas",
    "e",
    "ou",
  ]);
  const meaningful = words.filter((word) => !stopWords.has(word));
  return (meaningful.length > 0 ? meaningful : words).join("_");
}

function migrationVariableKey(value) {
  const source = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿ";
  const target = "aaaaaaeeeeiiiiooooouuuucnyy";
  const translations = new Map(
    Array.from(source, (character, index) => [character, target[index]]),
  );
  const base = Array.from(value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR"))
    .map((character) => translations.get(character) ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const words = base.split("_").filter(Boolean);
  const stopWords = new Set([
    "de",
    "do",
    "dos",
    "da",
    "das",
    "o",
    "a",
    "os",
    "as",
    "um",
    "uns",
    "uma",
    "umas",
    "e",
    "ou",
  ]);
  const meaningful = words.filter((word) => !stopWords.has(word));
  return (meaningful.length > 0 ? meaningful : words).join("_");
}

async function applicationSemanticDrift(prisma, applied) {
  const drift = new Set();
  const normalizedNames = new Set();
  const variableKeys = new Set();
  let cursor = "";
  while (true) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id", "tenantId", "label"${applied ? ', "normalizedName", "variableKey"' : ""}
       FROM "contact_custom_fields"
       WHERE "id" > $1
       ORDER BY "id"
       LIMIT 500`,
      cursor,
    );
    for (const row of rows) {
      const expectedName = canonicalNormalizedName(row.label);
      const expectedKey = canonicalVariableKey(row.label);
      const migrationKey = migrationVariableKey(row.label);
      const nameIdentity = `${row.tenantId}\0${expectedName}`;
      const keyIdentity = `${row.tenantId}\0${expectedKey}`;
      if (normalizedNames.has(nameIdentity)) drift.add("APPLICATION_DUPLICATE_NAMES");
      if (variableKeys.has(keyIdentity)) drift.add("APPLICATION_DUPLICATE_KEYS");
      normalizedNames.add(nameIdentity);
      variableKeys.add(keyIdentity);
      if (nativeNames.includes(expectedName)) drift.add("APPLICATION_NATIVE_NAME");
      if (!expectedKey) drift.add("APPLICATION_EMPTY_KEY");
      if (nativeKeys.includes(expectedKey)) drift.add("APPLICATION_RESERVED_KEY");
      if (migrationKey !== expectedKey) drift.add("APPLICATION_KEY_ALGORITHM_MISMATCH");
      if (applied && row.normalizedName !== expectedName) {
        drift.add("APPLICATION_UNEXPECTED_NORMALIZED_NAME");
      }
      if (applied && row.variableKey !== expectedKey) {
        drift.add("APPLICATION_UNEXPECTED_KEY");
      }
    }
    if (rows.length < 500) break;
    cursor = rows.at(-1).id;
  }
  return [...drift];
}

export function anonymizeCollisionRows(rows, salt = randomBytes(32).toString("hex")) {
  return rows.map((row) => ({
    tenant: `tenant-${digest(salt, String(row.tenant_id)).slice(0, 12)}`,
    conflictingTechnicalKey: `sha256:${digest(salt, String(row.conflicting_key)).slice(0, 16)}`,
    collisionType: row.collision_type,
    definitions: Number(row.definition_count),
    activeDefinitions: Number(row.active_count),
    archivedDefinitions: Number(row.archived_count),
    affectedValues: Number(row.value_count),
    safeAlternatives: safeAlternatives(row.collision_type),
  }));
}

export async function inspectContactCustomFieldIdentity(
  prisma,
  expectedChecksum,
  { allowPendingReconciliation = false } = {},
) {
  const [presence] = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('public.contact_custom_fields') IS NOT NULL AS table_exists,
      to_regclass('public._prisma_migrations') IS NOT NULL AS history_exists,
      to_regclass('public."contact_custom_fields_tenantId_variableKey_key"') IS NOT NULL
        AS index_name_exists
  `);

  const historyRows = presence.history_exists ? await migrationRows(prisma, MIGRATION_NAME) : [];
  let migrationState = classifyMigrationHistory(historyRows, expectedChecksum);
  let forwardState = null;
  let reconciliationPolicy = null;
  if (migrationState === "COMPLETED_CHECKSUM_MISMATCH") {
    const reconciliation = await reconciliationState(
      prisma,
      historyRows,
      expectedChecksum,
      allowPendingReconciliation,
    );
    if (reconciliation) {
      ({ migrationState, forwardState, policy: reconciliationPolicy } = reconciliation);
    }
  } else if (migrationState === "COMPLETED_VALID" && presence.history_exists) {
    ({ forwardState, policy: reconciliationPolicy } = await expectedForwardState(
      prisma,
      expectedChecksum,
    ));
    if (forwardState && !["NOT_APPLIED", "ROLLED_BACK", "COMPLETED_VALID"].includes(forwardState)) {
      throw safeError(`CONTACT_CUSTOM_FIELD_IDENTITY_FORWARD_${forwardState}`);
    }
  }
  if (
    [
      "COMPLETED_CHECKSUM_MISMATCH",
      "INCOMPLETE_CHECKSUM_MISMATCH",
      "ROLLED_BACK_CHECKSUM_MISMATCH",
      "AMBIGUOUS_HISTORY",
      "INCOMPLETE",
    ].includes(migrationState)
  ) {
    throw safeError(`CONTACT_CUSTOM_FIELD_IDENTITY_${migrationState}`);
  }

  if (!presence.table_exists) {
    if (presence.index_name_exists) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE", ["INDEX_WRONG_TABLE"]);
    }
    if (migrationState === "COMPLETED_VALID") {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_TABLE_MISSING_AFTER_COMPLETION");
    }
    return {
      collisions: [],
      migrationState,
      forwardState,
      reconciliationPolicy,
      structuralDrift: [],
      semanticDrift: [],
    };
  }

  const [catalog] = await prisma.$queryRawUnsafe(`
    WITH target_table AS (
      SELECT cls.oid
      FROM pg_class cls
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public' AND cls.relname = 'contact_custom_fields'
    ), target_column AS (
      SELECT attribute.atttypid = 'text'::regtype AS is_text,
             attribute.attnotnull AS is_not_null
      FROM target_table
      JOIN pg_attribute attribute ON attribute.attrelid = target_table.oid
      WHERE attribute.attname = 'variableKey'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ), named_index AS (
      SELECT index_meta.indrelid AS indrelid,
             index_meta.indisunique AS is_unique,
             index_meta.indisvalid AS is_valid,
             index_meta.indisready AS is_ready,
             index_meta.indpred IS NOT NULL AS is_partial,
             index_meta.indexprs IS NOT NULL AS is_expression,
             index_meta.indnkeyatts AS key_count,
             index_meta.indnatts AS attribute_count,
             ARRAY(
               SELECT attribute.attname
               FROM unnest(index_meta.indkey) WITH ORDINALITY AS key(attnum, position)
               JOIN pg_attribute attribute
                 ON attribute.attrelid = index_meta.indrelid
                AND attribute.attnum = key.attnum
               WHERE key.position <= index_meta.indnkeyatts
               ORDER BY key.position
             ) AS columns
      FROM pg_class index_class
      JOIN pg_namespace ns ON ns.oid = index_class.relnamespace
      LEFT JOIN pg_index index_meta ON index_meta.indexrelid = index_class.oid
      WHERE ns.nspname = 'public'
        AND index_class.relname = 'contact_custom_fields_tenantId_variableKey_key'
    )
    SELECT
      EXISTS(SELECT 1 FROM target_column) AS column_exists,
      COALESCE((SELECT is_text FROM target_column), false) AS column_is_text,
      COALESCE((SELECT is_not_null FROM target_column), false) AS column_not_null,
      EXISTS(SELECT 1 FROM named_index) AS index_name_exists,
      COALESCE((SELECT indrelid = (SELECT oid FROM target_table) FROM named_index), false)
        AS index_on_target,
      COALESCE((SELECT indrelid = (SELECT oid FROM target_table) FROM named_index), false)
        AS index_exists,
      COALESCE((SELECT is_unique FROM named_index), false) AS index_unique,
      COALESCE((SELECT is_valid FROM named_index), false) AS index_valid,
      COALESCE((SELECT is_ready FROM named_index), false) AS index_ready,
      COALESCE((SELECT is_partial FROM named_index), false) AS index_partial,
      COALESCE((SELECT is_expression FROM named_index), false) AS index_expression,
      COALESCE((SELECT key_count FROM named_index), 0) AS index_key_count,
      COALESCE((SELECT attribute_count FROM named_index), 0) AS index_attribute_count,
      COALESCE((SELECT columns FROM named_index), ARRAY[]::name[]) AS index_columns
  `);
  const catalogDrift = structuralDrift(catalog);

  if (["NOT_APPLIED", "ROLLED_BACK"].includes(migrationState)) {
    if (catalog.column_exists || catalog.index_name_exists) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE", catalogDrift);
    }
    const applicationDrift = await applicationSemanticDrift(prisma, false);
    if (applicationDrift.length > 0) {
      throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_SEMANTIC_DRIFT", applicationDrift);
    }
    return {
      collisions: await prisma.$queryRawUnsafe(collisionReportQuery, nativeKeys, nativeNames),
      migrationState,
      forwardState,
      reconciliationPolicy,
      structuralDrift: [],
      semanticDrift: [],
    };
  }

  if (catalogDrift.length > 0) {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_STRUCTURAL_DRIFT", catalogDrift);
  }
  const [metrics] = await prisma.$queryRawUnsafe(semanticValidationQuery, nativeKeys);
  const dataDrift = semanticDrift(metrics);
  if (dataDrift.length > 0) {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_SEMANTIC_DRIFT", dataDrift);
  }
  const applicationDrift = await applicationSemanticDrift(prisma, true);
  if (applicationDrift.length > 0) {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_SEMANTIC_DRIFT", applicationDrift);
  }
  return {
    collisions: [],
    migrationState,
    forwardState,
    reconciliationPolicy,
    structuralDrift: [],
    semanticDrift: [],
  };
}

async function inspectDatabase(expectedChecksum, options) {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  try {
    const history = await inspectFullMigrationHistory(prisma, expectedChecksum);
    const state = await inspectContactCustomFieldIdentity(prisma, expectedChecksum, options);
    if (state.collisions.length > 0) {
      const error = safeError("CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_FAILED");
      error.collisionReport = anonymizeCollisionRows(state.collisions);
      throw error;
    }
    return { ...state, ...history };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "help") {
    printHelp();
    return;
  }
  if (mode === "version") {
    console.log(`migrate-deploy-safe ${WRAPPER_VERSION}`);
    return;
  }
  if (!process.env.DATABASE_URL) throw safeError("DATABASE_URL_MISSING");

  const expectedChecksum = await migrationChecksum();
  const initial = await inspectDatabase(expectedChecksum, {
    allowPendingReconciliation: allowPendingReconciliationDuringInspection(mode),
  });
  if (mode === "reconcile" && initial.migrationState !== "RECONCILIATION_PENDING") {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_NOT_PENDING");
  }
  if (mode === "reconcile") {
    await assertOnlyReviewedForwardPending(expectedChecksum, initial.reconciliationPolicy);
  }
  if (mode === "deploy" && initial.reconciliationRequired) {
    throw safeError("MIGRATION_RECONCILIATION_REQUIRES_OFFICIAL_RELEASE_EXECUTOR");
  }
  if (mode === "preflight") {
    console.log(
      JSON.stringify({
        code: "CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_OK",
        migration: MIGRATION_NAME,
        state: initial.migrationState,
        forwardState: initial.forwardState,
        checksum: expectedChecksum,
        reconciliationRequired: initial.reconciliationRequired,
      }),
    );
    return;
  }

  const prismaCli = resolve(backendDir, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", "prisma/schema.prisma"],
    { cwd: backendDir, env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  const finalState = await inspectDatabase(expectedChecksum);
  if (
    !["COMPLETED_VALID", "COMPLETED_RECONCILED"].includes(finalState.migrationState) ||
    (finalState.reconciliationPolicy && finalState.forwardState !== "COMPLETED_VALID")
  ) {
    throw safeError("CONTACT_CUSTOM_FIELD_IDENTITY_POST_VALIDATION_FAILED");
  }
}

export function parseMode(args) {
  if (args.length === 0) return "deploy";
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return "help";
  if (args.length === 1 && ["--version", "-v"].includes(args[0])) return "version";
  if (args.length === 1 && args[0] === "--preflight-only") return "preflight";
  if (args.length === 1 && args[0] === "--apply-reviewed-reconciliation") return "reconcile";
  throw safeError("UNSUPPORTED_ARGUMENTS");
}

export function allowPendingReconciliationDuringInspection(mode) {
  return mode === "preflight" || mode === "reconcile" || mode === "deploy";
}

function printHelp() {
  console.log(`Uso: bun run prisma:migrate:deploy [--preflight-only|--apply-reviewed-reconciliation|--help|--version]

Sem argumentos: executa preflight somente leitura, Prisma migrate deploy e pós-validação.
--preflight-only: valida checksum, histórico, catálogo e dados sem executar DDL.
--apply-reviewed-reconciliation: aplica somente a reconciliação forward exata do manifesto.
--help: mostra esta ajuda sem abrir banco.
--version: mostra a versão do wrapper sem abrir banco.`);
}

function safeError(code, details = []) {
  const error = new Error(code);
  error.code = code;
  error.safeDetails = [...details];
  return error;
}

function digest(salt, value) {
  return createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

function safeAlternatives(collisionType) {
  if (collisionType === "native_key" || collisionType === "native_name") {
    return ["Renomear explicitamente o campo adicional para não usar uma chave nativa."];
  }
  if (collisionType === "empty_key") {
    return ["Definir explicitamente um nome que produza uma chave técnica suportada."];
  }
  return [
    "Renomear explicitamente uma das definições após validação funcional.",
    "Manter o bloqueio e decidir separadamente se o registro arquivado deve ser restaurado.",
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(
      JSON.stringify({
        code: error?.code ?? "MIGRATION_WRAPPER_FAILED",
        migration: MIGRATION_NAME,
        details: error?.safeDetails ?? [],
        collisions: error?.collisionReport ?? [],
      }),
    );
    process.exitCode = 1;
  }
}
