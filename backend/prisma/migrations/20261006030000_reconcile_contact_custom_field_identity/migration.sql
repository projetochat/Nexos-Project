BEGIN;

-- Forward-only audit marker for installations that completed the original
-- 20261005210000 artifact. The safe wrapper validates the exact old/new
-- checksums and the application semantics before this migration can run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contact_custom_fields'
      AND column_name = 'variableKey'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_COLUMN_DRIFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class index_class
    JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
    JOIN pg_index index_meta ON index_meta.indexrelid = index_class.oid
    WHERE namespace.nspname = 'public'
      AND index_class.relname = 'contact_custom_fields_tenantId_variableKey_key'
      AND index_meta.indrelid = 'public.contact_custom_fields'::regclass
      AND index_meta.indisunique
      AND index_meta.indisvalid
      AND index_meta.indisready
      AND index_meta.indpred IS NULL
      AND index_meta.indexprs IS NULL
      AND index_meta.indnkeyatts = 2
      AND index_meta.indnatts = 2
      AND ARRAY(
        SELECT attribute.attname
        FROM unnest(index_meta.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_attribute attribute
          ON attribute.attrelid = index_meta.indrelid
         AND attribute.attnum = key.attnum
        ORDER BY key.position
      ) = ARRAY['tenantId', 'variableKey']::name[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_INDEX_DRIFT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM contact_custom_fields
    WHERE "variableKey" IS NULL
       OR btrim("variableKey") = ''
       OR "variableKey" !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ) OR EXISTS (
    SELECT 1
    FROM contact_custom_fields
    GROUP BY "tenantId", "variableKey"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTACT_CUSTOM_FIELD_IDENTITY_RECONCILIATION_DATA_DRIFT';
  END IF;
END $$;

COMMIT;
