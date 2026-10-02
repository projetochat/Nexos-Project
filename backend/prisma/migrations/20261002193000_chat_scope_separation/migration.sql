-- Perfis anteriores à ativação do escopo de departamento no Chat não possuíam
-- a chave departmentIds. Preserve a visibilidade histórica concedendo todos os
-- departamentos ativos somente nesses casos. Arrays vazios explícitos continuam
-- representando nenhum departamento liberado no Chat.
UPDATE "roles" role
SET "metadata" = COALESCE(role."metadata", '{}'::jsonb) || jsonb_build_object(
  'departmentIds', COALESCE((
    SELECT jsonb_agg(department."id" ORDER BY department."createdAt", department."id")
    FROM "departments" department
    WHERE department."tenantId" = role."tenantId"
      AND department."active" = true
  ), '[]'::jsonb)
)
WHERE NOT (COALESCE(role."metadata", '{}'::jsonb) ? 'departmentIds');

-- Materialize a instância das notificações de Chat para que a listagem possa
-- revalidar os dois eixos do perfil sem expor título/corpo após revogação.
ALTER TABLE "notifications" ADD COLUMN "connectionId" TEXT;

UPDATE "notifications" notification
SET "connectionId" = CASE
  WHEN notification."entityType" = 'conversation' THEN (
    SELECT conversation."connectionId"
    FROM "conversations" conversation
    WHERE conversation."tenantId" = notification."tenantId"
      AND conversation."id" = notification."entityId"
  )
  WHEN notification."entityType" = 'lead' THEN (
    SELECT conversation."connectionId"
    FROM "leads" lead
    JOIN "conversations" conversation
      ON conversation."tenantId" = lead."tenantId"
     AND conversation."id" = lead."conversationId"
    WHERE lead."tenantId" = notification."tenantId"
      AND lead."id" = notification."entityId"
  )
  ELSE NULL
END
WHERE notification."entityType" IN ('conversation', 'lead');

CREATE INDEX "notifications_tenantId_connectionId_status_idx"
ON "notifications"("tenantId", "connectionId", "status");

-- Grupos históricos eram criados sem departamento. Vincule-os ao departamento
-- padrão da instância (quando ativo) ou ao primeiro departamento ativo da tenant,
-- para que também respeitem o novo escopo do Chat sem desaparecer após o deploy.
UPDATE "conversations" conversation
SET "departmentId" = COALESCE(
  (
    SELECT connection."defaultDepartmentId"
    FROM "messaging_connections" connection
    JOIN "departments" department
      ON department."tenantId" = connection."tenantId"
     AND department."id" = connection."defaultDepartmentId"
     AND department."active" = true
    WHERE connection."tenantId" = conversation."tenantId"
      AND connection."id" = conversation."connectionId"
  ),
  (
    SELECT department."id"
    FROM "departments" department
    WHERE department."tenantId" = conversation."tenantId"
      AND department."active" = true
    ORDER BY department."createdAt", department."id"
    LIMIT 1
  )
)
WHERE conversation."conversationType" = 'GROUP'
  AND conversation."departmentId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "departments" department
    WHERE department."tenantId" = conversation."tenantId"
      AND department."active" = true
  );
