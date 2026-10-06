-- Preserve archived identities. Conflicting active definitions intentionally stop the migration.
ALTER TABLE "contact_custom_fields" ADD COLUMN "variableKey" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "contact_custom_fields"
    GROUP BY
      "tenantId",
      lower(regexp_replace(normalize(trim("label"), NFKC), '\s+', ' ', 'g'))
    HAVING count(*) FILTER (WHERE "archivedAt" IS NULL) > 1
  ) THEN
    RAISE EXCEPTION 'Active contact custom fields collide after Unicode normalization';
  END IF;
END $$;

-- Move every old value to a unique staging identity first so historical archive/recreate rows
-- can be ranked without fighting the pre-existing unique index during the UPDATE.
UPDATE "contact_custom_fields"
SET "normalizedName" = '__identity_migration__' || replace("id", '-', '');

WITH normalized AS (
  SELECT
    "id",
    "tenantId",
    "archivedAt",
    "createdAt",
    lower(regexp_replace(normalize(trim("label"), NFKC), '\s+', ' ', 'g')) AS base_name
  FROM "contact_custom_fields"
), ranked_names AS (
  SELECT
    "id",
    base_name,
    row_number() OVER (
      PARTITION BY "tenantId", base_name
      ORDER BY ("archivedAt" IS NOT NULL), "createdAt", "id"
    ) AS name_rank
  FROM normalized
)
UPDATE "contact_custom_fields" AS field
SET "normalizedName" = CASE
  WHEN ranked_names.name_rank = 1 THEN ranked_names.base_name
  ELSE ranked_names.base_name || '__historico__' || replace(field."id", '-', '')
END
FROM ranked_names
WHERE field."id" = ranked_names."id";

WITH generated AS (
  SELECT
    "id",
    "tenantId",
    "archivedAt",
    "createdAt",
    regexp_replace(
      translate(lower(normalize(trim("label"), NFC)),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'),
      '[^a-z0-9]+', '_', 'g'
    ) AS base_key
  FROM "contact_custom_fields"
), cleaned AS (
  SELECT
    "id",
    "tenantId",
    "archivedAt",
    "createdAt",
    trim(both '_' from base_key) AS base_key
  FROM generated
), tokenized AS (
  SELECT
    cleaned."id",
    cleaned."tenantId",
    cleaned."archivedAt",
    cleaned."createdAt",
    cleaned.base_key,
    COALESCE(
      NULLIF(
        string_agg(part.token, '_' ORDER BY part.ordinal)
          FILTER (
            WHERE part.token <> ''
              AND part.token NOT IN ('de','do','dos','da','das','o','a','os','as','um','uns','uma','umas','e','ou')
          ),
        ''
      ),
      cleaned.base_key
    ) AS candidate_key
  FROM cleaned
  LEFT JOIN LATERAL regexp_split_to_table(cleaned.base_key, '_')
    WITH ORDINALITY AS part(token, ordinal) ON true
  GROUP BY cleaned."id", cleaned."tenantId", cleaned."archivedAt", cleaned."createdAt", cleaned.base_key
), ranked AS (
  SELECT
    "id",
    "tenantId",
    CASE
      WHEN candidate_key = '' THEN 'campo'
      WHEN candidate_key IN ('cumprimento','saudacao','contato','nome','telefone','email','instancia','departamento','cliente','empresa')
        THEN 'campo_' || candidate_key
      ELSE candidate_key
    END AS safe_key,
    row_number() OVER (
      PARTITION BY "tenantId", CASE
        WHEN candidate_key = '' THEN 'campo'
        WHEN candidate_key IN ('cumprimento','saudacao','contato','nome','telefone','email','instancia','departamento','cliente','empresa')
          THEN 'campo_' || candidate_key
        ELSE candidate_key
      END
      ORDER BY ("archivedAt" IS NOT NULL), "createdAt", "id"
    ) AS key_rank
  FROM tokenized
)
UPDATE "contact_custom_fields" AS field
SET "variableKey" = CASE
  WHEN ranked.key_rank = 1 THEN ranked.safe_key
  ELSE ranked.safe_key || '_' || ranked.key_rank::text
END
FROM ranked
WHERE field."id" = ranked."id";

ALTER TABLE "contact_custom_fields" ALTER COLUMN "variableKey" SET NOT NULL;
CREATE UNIQUE INDEX "contact_custom_fields_tenantId_variableKey_key"
  ON "contact_custom_fields"("tenantId", "variableKey");
