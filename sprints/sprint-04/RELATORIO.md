# SPRINT 04 - RELATORIO FINAL

## 1. Status

PASS.

Gate final:

```text
READY FOR SPRINT 05
```

## 2. Resumo executivo

A Sprint 04 criou o dominio real de `Conversation` na Nexos API com NestJS, Prisma e PostgreSQL. A estrutura de conversas do inbox passou a usar o backend Nexos para lista, detalhe, criacao, atribuicao, transferencia de departamento e status.

Mensagens permanecem legado ate Sprint 05, por decisao explicita de fronteira.

## 3. Baseline inicial

- Branch inicial: `sprint/03-contacts-crm`
- HEAD inicial: `e576cdee8417d9a9ddbc04c5f6fade8e301a3f99`
- Branch da sprint: `sprint/04-conversations`
- Node: `v24.14.0`
- Bun: `1.3.14`
- Docker: `29.1.3`
- Docker Compose: `v2.40.3-desktop.1`
- PostgreSQL container: `nexos-postgres` healthy
- Verify inicial: PASS

Observacao: a Sprint 03 estava presente no worktree local sem commit antes da Sprint 04; as alteracoes foram preservadas.

## 4. Decisao de dominio

`Conversation` representa o envelope operacional da conversa:

- contato atendido;
- departamento/fila;
- assignee;
- status;
- protocolo;
- metadados de lista como ultima atividade, preview e nao lidas.

`Message` nao foi implementado nesta sprint.

Fronteira temporaria:

```text
Conversation = Nexos API / PostgreSQL
Message = legado Supabase ate Sprint 05
```

## 5. Schema final

Adicionados ao Prisma:

- enum `ConversationStatus`
- `Conversation`
- `ConversationProtocolCounter`

Campos principais:

- `tenantId`
- `contactId`
- `departmentId`
- `assignedMembershipId`
- `status`
- `protocol`
- `isGroup`
- `unreadCount`
- `lastMessagePreview`
- `lastMessageAt`
- `archivedAt`
- `closedAt`

Constraints relevantes:

- `Conversation` unico por `[tenantId, id]`.
- `protocol` unico por `[tenantId, protocol]`.
- indices por tenant/status, departamento, assignee, contato e ultima mensagem.

## 6. Migration

- Criada e aplicada: `backend/prisma/migrations/20260730000300_conversations/migration.sql`
- Aplicada localmente com `prisma migrate deploy`.
- Prisma Client regenerado.
- Seed executado apos migration.

## 7. API Conversations

Base local: `http://localhost:3001/api`.

Endpoints:

- `GET /api/conversations`
- `GET /api/conversations/:id`
- `POST /api/conversations`
- `PATCH /api/conversations/:id/assignee`
- `PATCH /api/conversations/:id/department`
- `PATCH /api/conversations/:id/status`

Filtros server-side implementados:

- `tab`
- `source`
- `onlyUnread`
- `q`
- `customerId`
- `instance`
- `contactId`
- `status`
- `departmentId`
- `sort`
- `direction`
- `page`
- `pageSize`

## 8. Autorizacao e escopo operacional

Novas permissions:

- `conversations.read`
- `conversations.assign`
- `conversations.manage`

Matriz aplicada:

- `tenant_admin`: read, assign, manage.
- `supervisor`: read, assign, manage dentro de escopo.
- `agent`: read, assign, manage dentro de escopo.

Decisao de visibilidade:

- Tenant admin ve todas as conversas do tenant.
- Supervisor ve conversas dos departamentos aos quais pertence e conversas atribuidas a ele.
- Agent ve conversas dos departamentos aos quais pertence e conversas atribuidas a ele.

Transferencias validam tenant, departamento ativo, escopo do operador e compatibilidade do assignee com o departamento.

## 9. Frontend migrado

Arquivos:

- `src/lib/nexos-api.ts`
- `src/routes/inbox.index.tsx`
- `src/routes/inbox.$conversationId.tsx`

Migrado para Nexos API:

- lista de conversas;
- contadores por aba;
- busca e filtros principais;
- detalhe da conversa;
- criar conversa;
- assumir/retomar;
- transferir atendente;
- transferir departamento;
- mover para fila/standby;
- encerrar conversa;
- historico de protocolos do painel lateral.

Preservado legado:

- listagem/envio de mensagens;
- quick replies;
- audio/imagem;
- chamados gerados a partir do chat;
- edicao de contato/tags no painel lateral.

## 10. Supabase

Removido da superficie Conversation migrada:

- `CONV.list`
- `CONV.startWithAgent`
- `CONV.assume`
- `CONV.transferAgent`
- `CONV.moveDepartment`
- `CONV.setStatus`
- `CONV.close`
- `supabase.from("conversations")`
- RPC `assign_conversation_protocolo`

Ainda legado por fronteira de Sprint 05:

- `CONV.messages`
- `CONV.sendAgentMessage`
- `CONV.sendAgentMedia`
- `CONV.sendSystem`
- `CONV.markRead`

## 11. Tests

Backend e2e atualizado para 20 testes:

- auth 401 para conversas;
- RBAC 403 por permission ausente;
- listagem permitida;
- paginacao e contadores;
- filtros server-side de aba, origem, busca, cliente, instancia e sort;
- detail;
- cross-tenant detail bloqueado;
- create com contato de outro tenant bloqueado;
- assignment e unassignment;
- assignee cross-tenant bloqueado;
- membership inativa bloqueada;
- department transfer;
- department cross-tenant bloqueado;
- scope denied para supervisor fora do departamento;
- status transitions;
- conversa fechada nao reabre pelo endpoint de status;
- agent visibility por departamento.

Coverage formal nao foi configurado; a cobertura de risco da sprint esta nos e2e.

## 12. Validacoes automaticas

Executadas durante a sprint:

```text
bun run typecheck: PASS
bun --cwd backend run build: PASS
bun --cwd backend run test: PASS, 20 tests
bun run verify: PASS
bun run verify final: PASS
```

`bun run verify` final:

```text
frontend typecheck: PASS
frontend lint baseline: PASS, 3717 errors e 13 warnings dentro do baseline legado
frontend build: PASS
backend build: PASS
backend test: PASS, 20 tests
security XSS: PASS, 3 tests
```

## 13. Validacao manual obrigatoria

Smoke HTTP executado com `Origin: http://localhost:5173`:

```text
[X] GET http://localhost:3001/api/health
[X] POST http://localhost:3001/api/auth/login
[X] GET http://localhost:3001/api/conversations?pageSize=5
[X] GET http://localhost:3001/api/crm/customers?pageSize=2
[X] GET http://localhost:3001/api/crm/contacts?pageSize=2
```

Resultado do smoke:

```text
conversationItems: 5
conversationTotal: 9
customerItems: 2
contactItems: 2
```

Checklist para regression gate local:

```text
[X] http://localhost:5173 abre corretamente
[X] Login Nexos funciona via API
[X] Frontend comunica com http://localhost:3001/api
[X] /clientes funciona com Nexos API via endpoint CRM
[X] /contatos funciona com Nexos API via endpoint CRM
[ ] /inbox lista conversas com Nexos API
[ ] /inbox/:conversationId abre detalhe com Nexos API
[ ] Filtros do inbox persistem sem "Failed to fetch"
[ ] Assumir/retomar conversa persiste apos refresh
[ ] Transferir atendente persiste apos refresh
[ ] Transferir departamento respeita escopo
[ ] Mover para fila/standby persiste apos refresh
[ ] Encerrar conversa persiste apos refresh
[ ] Nenhum "Failed to fetch" nas funcionalidades migradas
```

## 14. Arquivos criados

- `backend/prisma/migrations/20260730000300_conversations/migration.sql`
- `backend/src/conversations/**`
- `sprints/sprint-04/RELATORIO.md`

## 15. Arquivos alterados

- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/app.module.ts`
- `backend/src/auth/permissions.constants.ts`
- `backend/test/app.e2e-spec.ts`
- `src/lib/nexos-api.ts`
- `src/routes/inbox.index.tsx`
- `src/routes/inbox.$conversationId.tsx`
- `docs/API.md`
- `docs/AUTHENTICATION.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE.md`
- `sprints/README.md`

## 16. Riscos e divida tecnica

- Mensagens ainda usam Supabase legado e podem ficar vazias para conversas criadas diretamente no PostgreSQL ate a Sprint 05.
- Realtime de Conversation foi substituido por refetch interval; realtime definitivo deve vir com o stack de mensagens/eventos.
- Multiselect de cliente/instancia no inbox preserva refinamento local quando ha mais de um valor selecionado.
- Coverage formal ainda nao configurado.

## 17. Final Git state

Antes do commit final:

- Branch: `sprint/04-conversations`
- HEAD: `e576cde`
- Worktree com alteracoes das Sprints 03 e 04 aguardando commit.
- Push: nao realizado.

## 18. Gate

READY FOR SPRINT 05
