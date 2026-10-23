BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'GEMINI', 'ANTHROPIC', 'DEEPSEEK');
CREATE TYPE "AiAgentBehavior" AS ENUM ('ATTENDANT', 'COPILOT', 'CONSULTATION');
CREATE TYPE "AiExecutionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "ai_connections" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "organization" TEXT,
  "credential_ciphertext" TEXT NOT NULL,
  "credential_iv" TEXT NOT NULL,
  "credential_auth_tag" TEXT NOT NULL,
  "credential_key_version" INTEGER NOT NULL DEFAULT 1,
  "credential_masked" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_agents" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "behavior" "AiAgentBehavior" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_agent_usages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "functionality" TEXT NOT NULL,
  "origin_module" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_module" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_agent_usages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_executions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "functionality" TEXT NOT NULL,
  "status" "AiExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "request_hash" TEXT NOT NULL,
  "result_json" JSONB,
  "warnings_json" JSONB,
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "ai_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_connections_tenantId_id_key" ON "ai_connections"("tenantId", "id");
CREATE UNIQUE INDEX "ai_connections_tenantId_name_key" ON "ai_connections"("tenantId", "name");
CREATE INDEX "ai_connections_tenantId_active_archived_at_idx" ON "ai_connections"("tenantId", "active", "archived_at");
CREATE UNIQUE INDEX "ai_agents_tenantId_id_key" ON "ai_agents"("tenantId", "id");
CREATE UNIQUE INDEX "ai_agents_tenantId_name_key" ON "ai_agents"("tenantId", "name");
CREATE INDEX "ai_agents_tenantId_active_archived_at_idx" ON "ai_agents"("tenantId", "active", "archived_at");
CREATE INDEX "ai_agents_tenantId_connectionId_idx" ON "ai_agents"("tenantId", "connectionId");
CREATE UNIQUE INDEX "ai_agent_usages_tenantId_agentId_functionality_origin_mod_key" ON "ai_agent_usages"("tenantId", "agentId", "functionality", "origin_module", "action", "target_module");
CREATE INDEX "ai_agent_usages_tenantId_functionality_origin_module_act_idx" ON "ai_agent_usages"("tenantId", "functionality", "origin_module", "action", "target_module", "is_default");
CREATE UNIQUE INDEX "ai_executions_tenantId_id_key" ON "ai_executions"("tenantId", "id");
CREATE INDEX "ai_executions_tenantId_conversationId_created_at_idx" ON "ai_executions"("tenantId", "conversationId", "created_at");
CREATE INDEX "ai_executions_tenantId_agentId_created_at_idx" ON "ai_executions"("tenantId", "agentId", "created_at");
CREATE INDEX "ai_executions_tenantId_request_hash_idx" ON "ai_executions"("tenantId", "request_hash");

ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "ai_connections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_agent_usages" ADD CONSTRAINT "ai_agent_usages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agent_usages" ADD CONSTRAINT "ai_agent_usages_tenantId_agentId_fkey" FOREIGN KEY ("tenantId", "agentId") REFERENCES "ai_agents"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_tenantId_agentId_fkey" FOREIGN KEY ("tenantId", "agentId") REFERENCES "ai_agents"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "conversations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets" ADD COLUMN "aiExecutionId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "aiAssisted" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX "tickets_tenantId_aiExecutionId_key" ON "tickets"("tenantId", "aiExecutionId");
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_aiExecutionId_fkey" FOREIGN KEY ("tenantId", "aiExecutionId") REFERENCES "ai_executions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_attachments" ADD COLUMN "sourceMessageId" TEXT;
CREATE UNIQUE INDEX "ticket_attachments_tenantId_ticketId_sourceMessageId_key" ON "ticket_attachments"("tenantId", "ticketId", "sourceMessageId");

COMMIT;
