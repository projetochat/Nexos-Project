# Changelog

## 2026-08-03 - Sprint 08.04 Rework II

- Criado backup fisico da Evolution antes de qualquer atualizacao: `backups/evolution-before-0804.dump`.
- Evolution API fixada em `evoapicloud/evolution-api:v2.3.7`; `latest` e `2.4.0-rc*` foram descartados.
- Reconciliada a connection fisica do Nexos para a instancia conectada `26293569-whatsapp-nata-cffd5f5c`.
- Confirmados login admin/agente em `homologacao`, webhook da instancia e owner normalizado.
- Adicionada regressao E2E para `PATCH /api/conversations/:id/status` criando mensagem de sistema.
- Documentado diagnostico inbound: falha permanece antes do webhook por decriptacao Signal/Baileys.
- Gate final permanece `NOT READY FOR SPRINT 09`.

## 2026-08-03 - Sprint 08.03 Authentication, Login & Access Consolidation

- Removido login generico/demo da tela `/login`.
- Frontend passa a autenticar sem `tenantSlug=acme` fixo, permitindo o tenant `homologacao`.
- Adicionado endpoint oficial `GET /api/auth/me`.
- Login agora normaliza email antes da validacao e retorna erros canonicos para credencial invalida, usuario inativo, ausencia de membership e rate limit.
- Health pre-login diferencia API/database de Redis.
- Seed minimo aceita `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` sem imprimir senha.
- Criado smoke script `backend/scripts/verify-homologation-login.mjs`.
- Adicionados testes E2E de auth e testes frontend do client Nexos API.

## 2026-08-03 - Sprint 08.02 Homologation Reset & Contact Lifecycle Recovery

- Criado reset oficial de homologacao com allowlist, production guard, confirm guard, migrations, generate, seed minimo e validacao de contagens.
- Criado audit de homologacao para contagens, duplicidades mascaradas e orfaos.
- Contact create passa a restaurar Contact arquivado com mesmo telefone normalizado.
- Contact ativo duplicado retorna erro canonico `CONTACT_ALREADY_EXISTS`.
- Frontend de contatos mostra sucesso especifico para Contact restaurado.
- Documentado ciclo de banco `nexos_0802`, seed modes e regra soft delete + restore.

## 2026-08-03 - Sprint 08.01 Inbound Conversation Resolution & Reconnect Recovery

- Corrigida resolucao inbound para reutilizar Contact canonico e Conversation aberta compativel.
- Adicionada normalizacao de `remoteJid` para `@s.whatsapp.net`, `@c.us`, device suffix e variantes brasileiras com/sem nono digito.
- Reconnect passa a garantir webhook Evolution novamente por operacao idempotente.
- Replay pelo mesmo `externalMessageId` nao cria Message, Conversation, unread ou lastMessage falso.
- Seed Prisma padrao passa a ser minimo; dados demo exigem `SEED_DEMO_DATA=true`.
- Criado `backend/scripts/cleanup-homologation-data.mjs` tenant-scoped e dry-run por padrao.

## 2026-08-03 - Sprint 07.02 Real WhatsApp Acceptance Closure

- Preservado o WIP parcial da Sprint 08 em branch local de backup antes de iniciar a 07.02.
- Criada branch `sprint/07.02-real-whatsapp-acceptance` a partir da baseline 07.01 confirmada.
- Corrigido mapeamento de QR da Evolution para aceitar `base64` no topo do payload de `/instance/connect/:instanceName`.
- Corrigido lookup de instance Evolution ausente para orfa canonica em vez de 500.
- Validado create, QR, delete, recreate, orphan handling, Docker/Evolution health, builds, testes e dois verifies.
- Gate final permanece `NOT READY FOR SPRINT 08` porque CONNECTED/outbound/inbound/lifecycle fisicos nao foram comprovados nesta execucao.

## 2026-07-30 - Sprint 05 messages

- Criada migration Prisma para `messages` com `MessageDirection`, `MessageType` e `MessageStatus`.
- Adicionada permission `messages.send` ao catalogo RBAC e aos roles operacionais seedados.
- Implementada API NestJS aninhada em `/api/conversations/:conversationId/messages` para historico, envio de texto e leitura.
- Integradas acoes estruturais de conversa com mensagens `SYSTEM` internas, sem endpoint publico generico.
- Migrado o historico, envio de texto e mark read de `/inbox/:conversationId` para Nexos API/PostgreSQL.
- Bloqueado envio de midia no composer migrado sem criar data URL fake ou provider improvisado.
- Seed atualizado com mensagens reais por conversa e contador de protocolos idempotente em execucoes repetidas.
- Adicionados testes e2e para paginacao, envio, idempotencia, validacao, RBAC, tenant isolation, escopo departamental, estados bloqueados e leitura.

## 2026-07-29 - Sprint 04 conversations

- Criada migration Prisma para `conversations` e `conversation_protocol_counters`.
- Adicionadas permissions `conversations.read`, `conversations.assign` e `conversations.manage`.
- Implementada API NestJS `/api/conversations/*` com tenant isolation, escopo operacional por departamento, filtros, busca, sort, paginação e contadores por aba.
- Migradas as superficies estruturais de `/inbox` e `/inbox/:conversationId` para Nexos API, sem fallback Supabase para Conversation.
- Mantida fronteira temporaria: mensagens, quick replies e composer continuam legados ate a Sprint 05.
- Seed atualizado com conversas por tenant em estados ativa, standby, fila, lead, fechada e escopo financeiro restrito.
- Adicionados testes e2e de RBAC, filtros, detail, assignment/unassignment, cross-tenant, inactive membership, transfer, status e agent visibility.

## 2026-07-29 - Sprint 03 contacts / CRM

- Criada migration Prisma para `customers`, `contacts`, `tags` e `contact_tags`.
- Adicionadas permissions `crm.read` e `crm.manage`.
- Implementada API NestJS `/api/crm/*` com tenant server-side, DTO validation, paginacao, filtros e busca.
- Implementada normalizacao canonica de telefone e unicidade por tenant.
- Migradas telas `/clientes` e `/contatos` para Nexos API, removendo Supabase dessas superficies.
- Preservado default local `http://localhost:5173` -> `http://localhost:3001/api`.
- CORS ajustado para allowlist explicita por ambiente via `FRONTEND_ORIGIN`, sem wildcard de producao.
- Seed atualizado com clientes, contatos e tags por tenant.
- Adicionados testes e2e de CRUD CRM, tenant isolation, permissions, input invalido e telefone duplicado.

## 2026-07-29 - Sprint 02 organization, users, departments & RBAC

- Criada migration Prisma da camada organizacional.
- Removido `ProtectedRecord` do dominio de producao.
- Implementados Departments, DepartmentMemberships, Roles, Permissions e RolePermissions.
- Evoluido User/TenantMembership com `platformRole`, `membershipStatus` e role tenant-scoped.
- Criado `@RequirePermissions` + `PermissionsGuard` para RBAC server-side.
- Implementadas APIs reais de users, departments, roles e permissions.
- Atualizado seed com Tenant A/B, roles, permissions, departamentos e usuarios demo.
- Migradas telas `/login`, `/departamentos`, `/atendentes`, `/perfis`, `/configuracoes/usuarios` e `/configuracoes/permissoes` para Nexos API.
- Removido Supabase Auth das superficies migradas.
- Adicionados testes e2e de auth denial, permission denial, tenant isolation, department isolation, role isolation e Platform Admin separado.

## 2026-07-29 - Sprint 01.1 frontend baseline

- Estabilizado build frontend TanStack/Lovable no Windows.
- Documentada causa raiz do manifest TanStack e do EPERM observado na Sprint 01.
- Criado `bun run verify` como gate unificado.
- Criada politica de lint baseline com `scripts/eslint-baseline.json`.
- Excluido Prisma Client gerado do escopo do ESLint.
- Corrigidos erros funcionais pequenos de lint sem alterar UX.
- Documentada decisao: NestJS Auth definitivo, Supabase Auth legado temporario.
- Executado smoke HTTP das rotas principais.

## 2026-07-29 - Sprint 01 foundation

- Inicializado Git e criado branch `sprint/01-foundation`.
- Instalado Bun e atualizadas dependencias via `bun.lock`.
- Criado backend NestJS em `backend/`.
- Criado `docker-compose.yml` com PostgreSQL local.
- Criado Prisma schema, migration inicial e seed multi-tenant.
- Implementados endpoints `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/me` e `/api/tenant-records/:id`.
- Adicionados testes e2e do backend e teste de sanitizacao XSS.
- Login frontend passa a tentar Nexos API antes do fallback Supabase.
- Removida chamada automatica de `ensureDemoUsers` no login e adicionada flag de seguranca.
- HTML de chamados passa por sanitizacao antes de persistir e ao reabrir edicao.

## 2026-07-29 - Sprint 00 baseline

- Executada auditoria estatica do frontend.
- Atualizada documentacao oficial com estado IMPLEMENTADO, SIMULADO, PLANEJADO e NAO IMPLEMENTADO.
- Adicionado roteiro de validacao local da Sprint 00 ao README.
- Registrados gaps frontend -> backend e divergencias MVP x arquitetura futura.
- Nenhuma alteracao funcional, dependencia ou lockfile foi realizada.

## 2026-07-29 - Documentacao consolidada

- Criada documentacao tecnica inicial no padrao oficial de `docs/`.
- Documentos numerados antigos foram substituidos por apontadores para evitar duplicidade.

## Sprint 06 - Universal Messaging Adapter

- Criado modelo `MessagingConnection` tenant-scoped.
- Adicionados contratos canonicos de outbound, inbound, result, errors e status.
- Adicionados `MessagingProviderRegistry` e `DevelopmentMessagingProvider`.
- Refatorado envio textual para persistir SENDING, chamar provider e atualizar SENT/FAILED.
- Preparados processors canonicos de inbound e status sem webhooks reais.
- Adicionados campos provider-neutral em Message e idempotencia inbound por connection/externalMessageId.
- Adicionados testes de contrato, registry e status progression.
- Atualizado verify para fallback local quando Bun nao esta no PATH.

## Sprint 07 - Evolution API Provider

- Adicionado `EvolutionClient`, `EvolutionMessagingProvider` e translator de webhooks.
- Criadas APIs tenant-scoped de connections, QR Code, status e logout.
- Criado webhook seguro `/api/webhooks/evolution` com JWT de provider.
- Migrada tela `/instancias` para Nexos API.
- Adicionado Docker Compose da Evolution API v2.3.1 com Postgres/Redis internos.
- Adicionadas permissoes `connections.read` e `connections.manage`.
- Fechadas lacunas de teste de inbound duplicado e external IDs iguais em tenants diferentes.
- Corrigido wiring de DI sob `tsx watch src/main.ts` com `@Inject(...)` explicito na camada Messaging.
- Adicionado teste de bootstrap do `MessagingModule` pelo container Nest para validar registro Development/Evolution.

## Sprint 07.01 - Evolution E2E Hardening

- Corrigido carregamento de `.env` da raiz no backend rodando com cwd `backend`.
- Criacao Evolution agora registra webhook explicitamente via `/webhook/set/:instanceName`.
- Adicionada reconciliação de connections contra `fetchInstances` e erro `INSTANCE_NOT_FOUND` para QR orfao.
- Adicionado `DELETE /messaging/connections/:id` para cleanup local/provider.
- `/instancias` deixa de exibir Development Provider como instancia operacional.
- Adicionado script `backend/scripts/cleanup-messaging-connections.mjs`.
- Ampliados testes de webhook registration, payload realista, grupos, lifecycle, orfa e tenant isolation.

# Sprint 08

- Adicionado Redis Nexos separado de `evolution-redis`.
- Integrado BullMQ com queue `messaging-outbound`.
- Implementado Transactional Outbox para outbound.
- `POST /messages` passa a retornar Message `QUEUED`.
- Worker outbound processa `QUEUED -> SENDING -> SENT/FAILED`.
- Adicionados retries com backoff exponencial e final failure.
- Preservados adapter provider-neutral, owner identity Sprint 07.03 e inbound direto.
- Adicionado smoke real de Redis/BullMQ ao `bun run verify`.

# Sprint 08.04

- Removida dependencia operacional de lista legada para dropdowns de Connections no Inbox.
- Adicionado helper testado para exibir apenas Connections Evolution conectadas.
- Webhook Evolution agora aceita o header real `jwt_key` configurado pela propria integracao.
- Webhook registra `authResult`, `requestId`, tipo de evento e `ignoredReason` canonico.
- Translator passou a retornar motivos canonicos como `FROM_ME`, `GROUP_MESSAGE` e `UNSUPPORTED_EVENT`.
- Adicionado teste E2E para inbound autenticado via `jwt_key`.
- Documentada separacao `nexos_0801` para regressao e `nexos_0802` para homologacao fisica preservada.

## Sprint 08.04 Rework

- Removidos `ENORE`, `FLOWID` e `ZYVO` dos seletores runtime de Contatos, Inbox, filtros de relatorio e simulador.
- Adicionado hook canonico `useConnectedMessagingConnections` com query key unica.
- Modal de Novo/Editar contato passa a exibir somente Connections Evolution conectadas.
- Seed de homologacao cria Admin e Atendente idempotentes.
- Reconcile de status da Connection Evolution persiste owner identity quando a Evolution informa `ownerJid`.
