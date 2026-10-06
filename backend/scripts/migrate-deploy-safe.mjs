import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../src/generated/prisma/index.js";

const MIGRATION_NAME = "20261005210000_contact_custom_field_identity";
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
), technical_collisions AS (
  SELECT
    identities."tenantId" AS tenant_id,
    identities.candidate_key AS conflicting_key,
    CASE
      WHEN identities.candidate_key = '' THEN 'empty_key'
      WHEN identities.candidate_key IN (
        'cumprimento','saudacao','contato','nome','telefone','email',
        'instancia','departamento','cliente','empresa'
      ) THEN 'native_key'
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
    OR identities.candidate_key IN (
      'cumprimento','saudacao','contato','nome','telefone','email',
      'instancia','departamento','cliente','empresa'
    )
    OR count(*) > 1
)
SELECT * FROM normalized_collisions
UNION ALL
SELECT * FROM technical_collisions
ORDER BY tenant_id, collision_type, conflicting_key
`;

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

export async function inspectContactCustomFieldIdentity(prisma) {
  const [state] = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('public.contact_custom_fields') IS NOT NULL AS table_exists,
      to_regclass('public._prisma_migrations') IS NOT NULL AS history_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'contact_custom_fields'
          AND column_name = 'variableKey'
      ) AS column_exists,
      to_regclass('public."contact_custom_fields_tenantId_variableKey_key"') IS NOT NULL
        AS index_exists
  `);
  if (!state.table_exists) return { collisions: [], migrationFinished: false };

  let migrationRows = [];
  if (state.history_exists) {
    migrationRows = await prisma.$queryRawUnsafe(
      `SELECT "finished_at", "rolled_back_at" FROM "_prisma_migrations" WHERE "migration_name" = $1`,
      MIGRATION_NAME,
    );
  }
  const migrationFinished = migrationRows.some((row) => row.finished_at && !row.rolled_back_at);
  const unresolvedMigration = migrationRows.some((row) => !row.finished_at && !row.rolled_back_at);
  if (migrationFinished && (!state.column_exists || !state.index_exists)) {
    throw new Error("CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE");
  }
  if (!migrationFinished && (state.column_exists || state.index_exists || unresolvedMigration)) {
    throw new Error("CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE");
  }
  if (migrationFinished) return { collisions: [], migrationFinished: true };

  return {
    collisions: await prisma.$queryRawUnsafe(collisionReportQuery),
    migrationFinished: false,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  const prisma = new PrismaClient();
  try {
    const state = await inspectContactCustomFieldIdentity(prisma);
    if (state.collisions.length > 0) {
      console.error(
        JSON.stringify(
          {
            code: "CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_FAILED",
            migration: MIGRATION_NAME,
            collisions: anonymizeCollisionRows(state.collisions),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }
  } finally {
    await prisma.$disconnect();
  }

  const prismaCli = resolve(backendDir, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", "prisma/schema.prisma"],
    { cwd: backendDir, env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function digest(salt, value) {
  return createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

function safeAlternatives(collisionType) {
  if (collisionType === "native_key") {
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
  await main();
}
