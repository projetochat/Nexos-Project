-- Preserve the oldest active instance name and disambiguate any pre-existing
-- duplicates before enforcing tenant-scoped, case-insensitive uniqueness.
WITH ranked_connections AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", LOWER(BTRIM("name"))
      ORDER BY "createdAt", "id"
    ) AS duplicate_rank
  FROM "messaging_connections"
  WHERE "archivedAt" IS NULL
)
UPDATE "messaging_connections" AS connection
SET "name" = LEFT(BTRIM(connection."name"), 40) || ' (' || connection."id" || ')'
FROM ranked_connections
WHERE connection."id" = ranked_connections."id"
  AND ranked_connections.duplicate_rank > 1;

CREATE UNIQUE INDEX "messaging_connections_tenant_active_name_key"
ON "messaging_connections" ("tenantId", LOWER(BTRIM("name")))
WHERE "archivedAt" IS NULL;
