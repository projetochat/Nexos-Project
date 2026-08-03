# Sprint 10 - Inbox Domain Consolidation & Legacy Runtime Removal

Data: 2026-08-03

## Objetivo

Remover a dependencia operacional da Inbox em Supabase/MVP/mock/fallback e consolidar Tags, Quick Replies,
Contact detail e Conversation detail no dominio oficial Nexos API.

## Baseline

- Sprint 09 encerrada com homologacao fisica final do PO.
- Commit base Sprint 09: `437643e7b630e30fa6c04c23f31bb40b675a3998`.
- Branch Sprint 10: `sprint/10-inbox-domain-legacy-removal`.
- Verify inicial em `nexos_0801`: PASS.

## Implementacao

- `src/routes/inbox.index.tsx` e `src/routes/inbox.$conversationId.tsx` nao importam mais `@/lib/mvp` ou Supabase.
- Quick Replies da Inbox usam `quickReplyApi.list()` e apenas inserem texto no composer, sem auto-send.
- Tags usam Nexos API para listar, criar, aplicar e remover.
- Contact panel e edicao de contato usam CRM API e invalidam queries oficiais.
- Conversation detail inclui Contact enriquecido com customer/tags e resumo de connection.
- Adicionada guarda `scripts/check-inbox-legacy-runtime.mjs`, executada pelo `verify`.

## Backend

- Novo `QuickReply` model e API `/api/quick-replies`.
- Tags ganharam `normalizedName`, `archivedAt` e API oficial `/api/tags`.
- Adicionada permissao `chat.tags.use` para agentes usarem Tags existentes sem gerir catalogo.
- `chat.quick_replies.manage` fica restrita a admin/supervisor; agentes mantem leitura.
- Eventos realtime novos: `contact.updated` e `contact.tags.updated`.
- `CrmModule` importa `RealtimeModule` explicitamente.

## Migration

Migration criada:

```text
backend/prisma/migrations/20260803100000_inbox_domain_tags_quick_replies/migration.sql
```

Validacoes fisicas:

- `nexos_1000`: drop/create, `prisma migrate deploy`, seed e smoke SQL de duplicata global Quick Reply.
- `nexos_0802`: `prisma migrate deploy` aplicado sem reset, seed idempotente executado.
- `nexos_0801`: migration aplicada para suite regressiva automatizada.

## Validacao automatizada

`bun run verify` em `nexos_0801`: PASS.

Incluiu:

- frontend typecheck
- lint baseline
- frontend build
- inbox legacy runtime check
- backend build
- backend tests: 19 files, 101 tests
- Redis queue smoke
- security XSS

## Smoke fisico em nexos_0802

Backend real iniciado contra `nexos_0802`.

Resultado:

- login admin `homologacao`: PASS
- login agente `homologacao`: PASS
- criar Tag via admin: PASS
- agente listar Tag existente: PASS
- criar Quick Reply via admin: PASS
- duplicata de atalho Quick Reply bloqueada com `409`: PASS
- agente listar Quick Reply: PASS
- cleanup por archive da Tag e Quick Reply de smoke: PASS

## Auditoria de legado

Rotas operacionais da Inbox auditadas:

```text
src/routes/inbox.tsx
src/routes/inbox.index.tsx
src/routes/inbox.$conversationId.tsx
```

Resultado: PASS para ausencia de imports/aliases `@/lib/mvp`, Supabase, `CATALOG`, `CONTACTS`,
`CUSTOMERS`, `QUICK_REPLIES` e `TAGS`.

## Pendencia para gate de produto

Nao foi executada navegacao fisica em browser na UI da Inbox durante esta sessao. Por isso, apesar dos
gates automatizados e smoke REST fisico terem passado, o gate final de produto permanece conservador.

Gate:

NOT READY FOR SPRINT 11
