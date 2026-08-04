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

## Rework — RBAC, Tags & Quick Reply Runtime Recovery

### Falhas físicas

Falhas reavaliadas em `nexos_0802`:

- F01: backend permitia `POST /api/conversations` para `tenant_admin`, mas a UI mapeava `403` operacional
  para erro generico de ambiente. Corrigido o mapeamento de erro para preservar `message` da Nexos API.
- F02: `/etiquetas` ainda usava store/mock local; Tag criada fora do dominio oficial nao aparecia no modal
  do Contact. Corrigido para catalogo Nexos API.
- F03: `/mensagens-rapidas` ainda chamava Supabase `quick_replies`; removido caminho Supabase/RLS.

### Admin RBAC

`tenant_admin` auditado com membership ativa no tenant `homologacao`, departamento `Atendimento` e 28
permissions, incluindo Conversation, Tags, CRM, Connections, Messages e Quick Replies. O backend preserva
escopo global do tenant para admin e nao aplica bloqueio departamental indevido.

### Permission seed

Seed idempotente executado em `nexos_0802` sem reset. Confirmado:

- `admin@nexo.app`: `tenant_admin`, `chat.tags.use`, `chat.tags.manage`,
  `chat.quick_replies.read`, `chat.quick_replies.manage`.
- `atendente@nexo.app`: `agent`, `chat.tags.use`, `chat.quick_replies.read`, sem manage de Tags/Quick Replies.
- Preset frontend de atendente em `/perfis` inclui `chat.tags.use`.

### Conversation create

`POST /api/conversations` validado fisicamente contra backend real em `nexos_0802` como admin:

```text
HTTP 201
protocol: 000011
```

### Tag catalog

`/etiquetas` agora usa `crmApi.listTags/createTag/updateTag/archiveTag` e query key canonica
`["nexos", "tags"]`. Catalogo e associacao foram separados: catalogo vem de Tags ativas do tenant; Contact
detail carrega as Tags associadas ao Contact.

### Contact Tag modal

Modal da Inbox lista o catalogo do tenant mesmo quando o Contact ainda nao tem Tags. `chat.tags.use`
controla aplicar/remover; `chat.tags.manage` controla criar nova Tag no catalogo.

### Tag assignment

Smoke fisico em `nexos_0802` confirmou criar Tag, listar por admin/agente, associar ao Contact, consultar
Contact detail com Tag, remover associacao e arquivar Tag de smoke.

### Quick Reply legacy path

`src/routes/mensagens-rapidas.tsx` deixou de importar `@/lib/mvp` e nao chama Supabase. O controle visual
`Encerrar conversa` foi removido porque `closeConversationAfterSend` nao possui comportamento backend real
nesta sprint.

### Supabase removal

`scripts/check-inbox-legacy-runtime.mjs` cobre Inbox, `/etiquetas` e `/mensagens-rapidas` contra:

- `@/lib/mvp`
- Supabase client
- `.from("tags")`
- `.from("quick_replies")`
- aliases legados `CATALOG`, `CONTACTS`, `CUSTOMERS`, `QUICK_REPLIES`, `TAGS`

### Quick Reply API

`/mensagens-rapidas` usa `quickReplyApi.list/create/update/archive`. Smoke fisico em `nexos_0802` confirmou
create, list por admin/agente, duplicata `409`, bloqueio de create por agente `403` e archive de cleanup.

### Agent RBAC

Agente lista Tags e Quick Replies, aplica/remove Tag existente, mas recebe `403` ao criar/editar/arquivar
catalogos restritos. Isolamento cross-tenant coberto em e2e.

### Automated tests

Validacoes executadas:

- `bun run test:inbox-legacy-runtime`: PASS.
- `bun run typecheck`: PASS.
- `bun run backend:test`: PASS, 19 files, 103 tests.
- `bun run backend:build`: PASS.
- `bun run build`: PASS.
- `bun run lint`: PASS dentro do baseline legado.
- `git diff --check`: PASS.
- `bun run verify` #1 em `nexos_0801` com Redis local: PASS.
- `bun run verify` #2 em `nexos_0801` com Redis local: PASS.

### Physical tests

Smoke fisico REST em `nexos_0802`:

```json
{
  "adminTenant": "homologacao",
  "agentTenant": "homologacao",
  "conversationCreated": true,
  "conversationProtocol": "000011",
  "tagCatalogVisible": true,
  "agentTagCatalogVisible": true,
  "tagAssigned": true,
  "contactDetailHasTag": true,
  "tagRemoved": true,
  "quickReplyCreated": true,
  "quickReplyDuplicateStatus": 409,
  "agentSeesQuickReply": true,
  "agentQuickReplyCreateStatus": 403,
  "cleanup": "archived smoke tag and quick reply"
}
```

### Regressions

Regressoes preservadas por testes existentes e `verify`: inbound, outbound, realtime publisher, Redis queue
smoke, BullMQ/Outbox, Contact lifecycle, security XSS, backend build e frontend build.

### Commit

Commit final do rework preparado na branch `sprint/10-inbox-domain-legacy-removal`.

### Métricas

| ID   | Meta                                 | Resultado                                                                                                  | Evidencia                                                                      | Status    |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| M103 | admin failure reproduced             | Admin auditado; backend criava Conversation, erro generico vinha do mapeamento UI/API                      | Repro REST `POST /api/conversations` 201 e audit de `readError`                | PASS      |
| M104 | admin role audit                     | `tenant_admin` ativo em `homologacao`                                                                      | Seed/audit `nexos_0802`                                                        | PASS      |
| M105 | tenant admin permissions audit       | 28 permissions confirmadas                                                                                 | Audit SQL/Prisma                                                               | PASS      |
| M106 | missing permissions identified       | UI/preset nao reconhecia `chat.tags.use`; Quick Replies page usava legado                                  | `rg` e diff                                                                    | PASS      |
| M107 | seed permissions corrected           | Seed idempotente aplicado; roles existentes atualizados                                                    | `bun run backend:prisma:seed` em `nexos_0802`                                  | PASS      |
| M108 | admin create Conversation            | Conversation criada                                                                                        | HTTP 201, protocol `000011`                                                    | PASS      |
| M109 | admin Tag manage                     | Admin cria/arquiva Tag                                                                                     | Smoke REST `nexos_0802`                                                        | PASS      |
| M110 | admin Quick Reply manage             | Admin cria/edita/arquiva Quick Reply                                                                       | Smoke REST e e2e                                                               | PASS      |
| M111 | Tag catalog API audit                | Catalogo vem da Nexos API                                                                                  | `/etiquetas` usa `crmApi`                                                      | PASS      |
| M112 | Contact Tag modal audit              | Modal lista catalogo do tenant                                                                             | `crmApi.listTags`, key `["nexos","tags"]`                                      | PASS      |
| M113 | catalog vs assignment fix            | Catalogo separado de Contact tags                                                                          | Contact detail + assign/remove endpoints                                       | PASS      |
| M114 | Tag cache fix                        | Invalidacao canonica adicionada                                                                            | `["nexos","tags"]` e contact queries                                           | PASS      |
| M115 | Tag assign physical                  | Tag associada ao Contact                                                                                   | Smoke REST `tagAssigned=true`                                                  | PASS      |
| M116 | Tag remove physical                  | Tag removida                                                                                               | Smoke REST `tagRemoved=true`                                                   | PASS      |
| M117 | Quick Reply Supabase path identified | `/mensagens-rapidas` importava `QUICK_REPLIES`                                                             | `rg` inicial                                                                   | PASS      |
| M118 | Supabase path removed                | Rota recriada API-only                                                                                     | Guarda anti-legado PASS                                                        | PASS      |
| M119 | Quick Reply API client               | `quickReplyApi` usado para CRUD                                                                            | `src/routes/mensagens-rapidas.tsx`                                             | PASS      |
| M120 | Quick Reply create physical          | Criacao via Nexos API                                                                                      | Smoke REST `quickReplyCreated=true`                                            | PASS      |
| M121 | Quick Reply list physical            | Admin/agente listam                                                                                        | Smoke REST `agentSeesQuickReply=true`                                          | PASS      |
| M122 | agent Quick Reply read               | Agente tem leitura e manage negado                                                                         | Smoke REST/e2e                                                                 | PASS      |
| M123 | zero RLS error                       | Caminho Supabase removido                                                                                  | Sem `.from("quick_replies")` operacional                                       | PASS      |
| M124 | closeConversationAfterSend rule      | Controle removido da UI                                                                                    | Campo nao exposto sem backend real                                             | PASS      |
| M125 | architectural legacy check           | Guarda expandida                                                                                           | `bun run test:inbox-legacy-runtime`                                            | PASS      |
| M126 | frontend Tag tests                   | Coberto por typecheck/build/guarda; sem teste component isolado                                            | `verify` + smoke REST                                                          | PARTIAL   |
| M127 | frontend Quick Reply tests           | Coberto por typecheck/build/guarda; sem teste component isolado                                            | `verify` + smoke REST                                                          | PARTIAL   |
| M128 | admin Conversation tests             | Coberto por REST/e2e existente                                                                             | `backend:test` + smoke                                                         | PASS      |
| M129 | agent RBAC tests                     | Coberto em e2e novo                                                                                        | `backend:test` 103 tests                                                       | PASS      |
| M130 | cross-tenant tests                   | Coberto em e2e Tags/Quick Replies                                                                          | `backend:test`                                                                 | PASS      |
| M131 | seed idempotency                     | Seed reaplicado sem reset                                                                                  | `nexos_0802`                                                                   | PASS      |
| M132 | nexos_0802 audit                     | Admin/agente auditados                                                                                     | SQL/Prisma audit                                                               | PASS      |
| M133 | realtime Tag event                   | Publisher preservado                                                                                       | `verify` regressivo                                                            | PASS      |
| M134 | inbound regression                   | Testes automatizados preservados; inbound WhatsApp fisico reaberto por webhook 401/ECONNREFUSED            | `backend:test` logs `messaging.inbound.processed`; homologacao fisica pendente | PARTIAL   |
| M135 | outbound regression                  | Testes outbound preservados                                                                                | `backend:test` logs `messaging.outbound.*`                                     | PASS      |
| M136 | realtime regression                  | Testes realtime preservados                                                                                | `verify`                                                                       | PASS      |
| M137 | verify #1                            | Suite completa passou                                                                                      | `bun run verify` em `nexos_0801`                                               | PASS      |
| M138 | verify #2                            | Suite completa passou                                                                                      | segunda execucao `bun run verify`                                              | PASS      |
| M139 | frontend tests                       | Typecheck, build, security XSS e guarda passaram                                                           | `verify`                                                                       | PASS      |
| M140 | backend tests                        | 20 files, 110 tests                                                                                        | `bun run backend:test`                                                         | PASS      |
| M141 | builds                               | Frontend e backend build passaram                                                                          | `bun run build`, `backend:build`                                               | PASS      |
| M142 | docs                                 | Docs atualizados                                                                                           | `docs/*` Sprint 10 Rework                                                      | PASS      |
| M143 | report                               | Adendo adicionado                                                                                          | Este bloco                                                                     | PASS      |
| M144 | commit                               | Commit final preparado                                                                                     | Branch atual                                                                   | PARTIAL   |
| M145 | final git clean                      | A validar apos commit                                                                                      | `git status` final                                                             | PARTIAL   |
| M146 | gate                                 | Reaberto por falha fisica Evolution webhook: `ECONNREFUSED` e depois `HTTP 401` correlacionados ao inbound | Ver Gate                                                                       | NOT READY |

## Complemento Obrigatorio — Webhook Connectivity & Auth Recovery

### Diagnostico

Falhas fisicas reais observadas na Evolution API v2.3.7:

- `ECONNREFUSED` em `http://host.docker.internal:3001/api/webhooks/evolution`;
- `HTTP 401` apos o backend ficar acessivel.

Conclusao: inbound WhatsApp -> Nexos nao pode ser considerado preservado ate prova fisica sem esses erros.

### Correcoes aplicadas

- `EVOLUTION_WEBHOOK_SECRET` agora e normalizado no backend contra espacos externos e aspas externas
  pareadas.
- Startup registra configuracao sanitizada: `EVOLUTION_WEBHOOK_SECRET configured=true/false`.
- Se Evolution esta habilitada mas webhook URL/secret estao ausentes, a integracao e marcada como
  `degraded` nos logs, sem imprimir segredo.
- Webhook registra `requestId`, `event`, `instanceName`, `authStrategy`, `authResult` e `httpResult`.
- `jwt_key` incorreto, ausente ou Bearer invalido retornam `401` com log sanitizado.
- `ensureWebhookConfigured` reaplica sempre o secret atual carregado pelo processo.
- Regressao automatizada final aprovada: `bun run verify` em `nexos_0801` com Redis local, 20 arquivos
  backend e 110 testes backend PASS.
- Script operacional criado: `bun run --cwd backend audit:evolution-webhook -- --ensure`.
- Tentativa local de auditoria/reconfigure da instancia `26293569-whatsapp-nata-cffd5f5c` carregou a
  configuracao da Evolution, mas retornou `EVOLUTION_HTTP_ERROR` com `404 Instance not found`. Reconfigure
  fisico permanece pendente ate confirmar a Connection/instancia real. Nao houve impressao de secrets.

### Auditoria sanitizada esperada

```text
secretBackendConfigured=true
secretEvolutionConfigured=true
secretMatch=true
headerJwtKeyPresent=true
```

### Smoke de conectividade

Com backend ativo na porta 3001:

```powershell
bun run --cwd backend audit:evolution-webhook -- --container-health --instance=nome-da-instancia
```

Resultado obrigatorio: HTTP 200 em `http://host.docker.internal:3001/api/health` a partir do container
Evolution.

### Teste fisico pendente

PASS somente quando uma mensagem real do WhatsApp B provar:

- Evolution recebe;
- zero `ECONNREFUSED` correlacionado;
- zero `HTTP 401` correlacionado;
- webhook retorna 2xx;
- backend autentica por `jwt_key`;
- Message inbound persiste;
- mesma Conversation;
- Inbox exibe sem F5;
- zero duplicacao.

### Gate

NOT READY FOR SPRINT 11
