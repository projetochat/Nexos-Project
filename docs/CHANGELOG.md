# Changelog

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
