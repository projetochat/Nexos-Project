ALTER TABLE "departments"
ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'department';

CREATE TABLE "department_messaging_connections" (
  "tenantId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_messaging_connections_pkey"
    PRIMARY KEY ("tenantId", "departmentId", "connectionId"),
  CONSTRAINT "department_messaging_connections_tenantId_departmentId_fkey"
    FOREIGN KEY ("tenantId", "departmentId") REFERENCES "departments"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "department_messaging_connections_tenantId_connectionId_fkey"
    FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "department_messaging_connections_tenantId_connectionId_idx"
ON "department_messaging_connections"("tenantId", "connectionId");

CREATE INDEX "department_messaging_connections_tenantId_departmentId_idx"
ON "department_messaging_connections"("tenantId", "departmentId");

-- Antes desta versão qualquer departamento podia ser combinado com qualquer
-- instância permitida. Este backfill preserva exatamente essa disponibilidade.
INSERT INTO "department_messaging_connections" (
  "tenantId", "departmentId", "connectionId"
)
SELECT d."tenantId", d.id, c.id
FROM "departments" d
JOIN "messaging_connections" c ON c."tenantId" = d."tenantId"
WHERE c."archivedAt" IS NULL
ON CONFLICT DO NOTHING;

-- Converte os dois conjuntos legados no novo escopo hierárquico e aproveita o
-- antigo padrão somente como favorito do perfil quando ele já era permitido.
UPDATE "roles" r
SET "metadata" = COALESCE(r."metadata", '{}'::jsonb) || jsonb_build_object(
  'chatScopes',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'connectionId', connection_id,
        'departmentIds', department_ids,
        'favoriteDepartmentId', favorite_department_id
      ) ORDER BY connection_id
    )
    FROM (
      SELECT
        c.id AS connection_id,
        COALESCE((
          SELECT jsonb_agg(did ORDER BY did)
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r."metadata"->'departmentIds') = 'array'
              THEN r."metadata"->'departmentIds' ELSE '[]'::jsonb END
          ) did
          WHERE EXISTS (
            SELECT 1 FROM "department_messaging_connections" dc
            WHERE dc."tenantId" = r."tenantId"
              AND dc."connectionId" = c.id
              AND dc."departmentId" = did
          )
        ), '[]'::jsonb) AS department_ids,
        CASE WHEN c."defaultDepartmentId" IS NOT NULL
          AND (r."metadata"->'departmentIds') ? c."defaultDepartmentId"
          THEN to_jsonb(c."defaultDepartmentId") ELSE 'null'::jsonb END AS favorite_department_id
      FROM "messaging_connections" c
      WHERE c."tenantId" = r."tenantId"
        AND c."archivedAt" IS NULL
        AND (r."metadata"->'connectionIds') ? c.id
    ) converted
  ), '[]'::jsonb)
)
WHERE r."key" <> 'tenant_admin';

DROP INDEX IF EXISTS "messaging_connections_tenantId_defaultDepartmentId_idx";
ALTER TABLE "messaging_connections"
DROP CONSTRAINT IF EXISTS "messaging_connections_tenantId_defaultDepartmentId_fkey";
ALTER TABLE "messaging_connections"
DROP COLUMN "defaultDepartmentId";
