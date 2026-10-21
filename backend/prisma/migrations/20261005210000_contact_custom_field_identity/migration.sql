BEGIN;

-- This migration has not been applied outside disposable resources. Keep every preflight check
-- before the first DDL so a known collision cannot leave a partial column, index or data rewrite.
DO $$
DECLARE
  -- CONTACT_CUSTOM_FIELD_NATIVE_NAMES_START
  native_names CONSTANT text[] := ARRAY[
    'nome','whatsapp','telefone','e-mail','email','instância','instâncias','empresa',
    'empresa do contato','cliente','departamento','departamento do contato','perfil',
    'perfil do contato','etiqueta','etiquetas'
  ];
  -- CONTACT_CUSTOM_FIELD_NATIVE_NAMES_END
  -- CONTACT_CUSTOM_FIELD_RESERVED_KEYS_START
  native_keys CONSTANT text[] := ARRAY[
    'cumprimento','saudacao','contato','nome','telefone','email','instancia','departamento',
    'cliente','empresa','whatsapp','perfil','etiqueta','mail','instancias','empresa_contato',
    'departamento_contato','perfil_contato','etiquetas'
  ];
  -- CONTACT_CUSTOM_FIELD_RESERVED_KEYS_END
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "contact_custom_fields"
    WHERE lower(regexp_replace(normalize(trim("label"), NFKC), '\s+', ' ', 'g')) = ANY(native_names)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CONTACT_CUSTOM_FIELD_NATIVE_NAME_COLLISION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "contact_custom_fields"
    GROUP BY
      "tenantId",
      lower(regexp_replace(normalize(trim("label"), NFKC), '\s+', ' ', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CONTACT_CUSTOM_FIELD_NORMALIZED_NAME_COLLISION';
  END IF;

  IF EXISTS (
    WITH generated AS (
      SELECT
        "id",
        "tenantId",
        trim(both '_' from regexp_replace(
          translate(lower(normalize(trim("label"), NFKC)),
            'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
            'aaaaaaeeeeiiiiooooouuuucnyy'),
          '[^a-z0-9]+', '_', 'g'
        )) AS base_key
      FROM "contact_custom_fields"
    ), tokenized AS (
      SELECT
        generated."id",
        generated."tenantId",
        generated.base_key,
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
      GROUP BY generated."id", generated."tenantId", generated.base_key
    )
    SELECT 1
    FROM tokenized
    GROUP BY "tenantId", candidate_key
    HAVING
      candidate_key = ''
      OR candidate_key = ANY(native_keys)
      OR count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CONTACT_CUSTOM_FIELD_VARIABLE_KEY_COLLISION';
  END IF;
END $$;

ALTER TABLE "contact_custom_fields" ADD COLUMN "variableKey" TEXT;

UPDATE "contact_custom_fields"
SET "normalizedName" = lower(regexp_replace(normalize(trim("label"), NFKC), '\s+', ' ', 'g'));

WITH generated AS (
  SELECT
    "id",
    trim(both '_' from regexp_replace(
      translate(lower(normalize(trim("label"), NFKC)),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'),
      '[^a-z0-9]+', '_', 'g'
    )) AS base_key
  FROM "contact_custom_fields"
), tokenized AS (
  SELECT
    generated."id",
    generated.base_key,
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
  GROUP BY generated."id", generated.base_key
)
UPDATE "contact_custom_fields" AS field
SET "variableKey" = tokenized.candidate_key
FROM tokenized
WHERE field."id" = tokenized."id";

ALTER TABLE "contact_custom_fields" ALTER COLUMN "variableKey" SET NOT NULL;
CREATE UNIQUE INDEX "contact_custom_fields_tenantId_variableKey_key"
  ON "contact_custom_fields"("tenantId", "variableKey");

COMMIT;
