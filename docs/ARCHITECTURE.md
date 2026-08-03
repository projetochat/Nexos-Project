# Arquitetura

## Baseline real do frontend

IMPLEMENTADO: o projeto e um frontend React com TanStack Start, TanStack Router file-based e Vite. O MVP usa Supabase diretamente em parte das telas para Auth, PostgREST e Realtime.

SIMULADO NO MVP: parte da administracao, Super Admin, campanhas, filas e rotas legadas usam `src/lib/mock/*` e arrays hardcoded.

PLANEJADO: backend Node.js + NestJS + TypeScript, PostgreSQL + Prisma, Redis + BullMQ, Socket.io, adaptadores Evolution API/Meta Cloud API, Cloudflare R2 e Docker Compose em VPS.

## Camadas atuais

```text
src/routes
  Paginas, layouts e acoes de tela
src/components
  Shells, UI kit, feedback, modais e filtros
src/lib/mvp.ts
  Camada Supabase real do MVP operacional
src/lib/session.ts
  Sessao, roles de UI, login/logout e contas demo
src/lib/perms.ts
  Permissoes de chat por access profile
src/lib/mock
  Dados simulados e store legado
src/integrations/supabase
  Clientes e middlewares Supabase do MVP
```

## Fluxo de dados atual

```text
Acao do usuario
  -> rota/componente
  -> TanStack Query ou Zustand/local state
  -> Supabase, mock store, array hardcoded ou localStorage
  -> estado React/query cache/store
  -> resultado visual
```

## Fronteiras atuais

- Browser: principal runtime das telas.
- Server function: `ensureDemoUsers`, com `supabaseAdmin`, para criar usuarios demo.
- SSR: `src/server.ts` e `src/start.ts` cuidam de error boundary e middleware de function.
- Banco MVP: migrations Supabase existem, mas nao representam a modelagem final planejada com Prisma.

## Diferencas MVP x arquitetura futura

| Area          | MVP atual                             | Futuro aprovado     |
| ------------- | ------------------------------------- | ------------------- |
| Backend       | Supabase direto + uma server function | NestJS              |
| Banco         | Supabase/Postgres migrations          | PostgreSQL + Prisma |
| Realtime      | Supabase Realtime + barramento local  | Socket.io           |
| Filas         | Nao implementado; algumas simulacoes  | Redis + BullMQ      |
| Midia         | Data URL em tabela/HTML               | Cloudflare R2       |
| Multi-tenancy | UI/mock, sem `tenant_id` operacional  | Multi-tenancy real  |

## Riscos arquiteturais

- Mistura de Supabase real, mocks e hardcodes.
- Rotas protegidas por shell client-side, nao por guard universal.
- Super Admin visualmente pronto, mas sem backend multi-tenant real.
- Permissoes granulares usadas como controle de UI sem garantia completa no backend atual.

## Sprint 01 - Strangler Fig

A Sprint 01 iniciou a migracao incremental sem remover Supabase do MVP. O frontend continua como fonte de UX e ainda pode usar Supabase nas telas existentes. O novo backend NestJS fica isolado em `backend/` e entrega apenas o primeiro contrato funcional multi-tenant.

```text
React/TanStack frontend
  -> fluxo legado Supabase onde ainda nao migrado
  -> Nexos API NestJS para auth/contexto/rotas novas

Nexos API NestJS
  -> Prisma
  -> PostgreSQL local
```

Fronteiras novas:

- `backend/src/auth`: login, refresh, JWT access token e guard.
- `backend/src/users`: `/api/me` com contexto de usuario, tenant e permissoes.
- `backend/src/tenant-records`: rota protegida para provar isolamento por `tenantId`.
- `backend/src/health`: healthcheck com consulta real ao PostgreSQL.

Redis/BullMQ, Socket.io, Evolution/Meta e R2 permanecem planejados, nao implementados nesta sprint.

## Sprint 06 - Universal Messaging Adapter

O envio textual da Inbox agora passa por uma fronteira provider-neutral:

Frontend -> Messages API -> Messaging Core -> MessagingProvider port -> MessagingProviderRegistry -> DevelopmentMessagingProvider.

O dominio central continua dono de Conversation, Message e Contact. Payloads de Evolution, Meta, QR Code, webhooks reais, tokens e detalhes de instancia externa nao entram no dominio.

Fluxo outbound adotado:

1. Validar tenant, RBAC, escopo de departamento e assignee.
2. Persistir Message OUTBOUND como SENDING com connectionId.
3. Chamar o provider por contrato canonico.
4. Atualizar Message para SENT ou FAILED com dados sanitizados e provider-neutral.

Fluxo inbound preparado para Sprint 07:

Provider webhook -> Provider Adapter -> InboundMessageEvent canonico -> MessagingInboundService -> Contact/Conversation/Message.

Eventos inbound sao idempotentes por tenantId + connectionId + externalMessageId. Eventos de status sao processados por contrato canonico e protegidos contra regressao invalida, como READ voltando para SENT.

## Sprint 07 - Evolution API Provider

Evolution API foi implementada como adapter real sobre o contrato da Sprint 06:

```text
Messages API
  -> Messaging Core
  -> MessagingProviderRegistry
  -> EvolutionMessagingProvider
  -> EvolutionClient
  -> Evolution API v2.3.1
```

## Sprint 08 - Redis, BullMQ e Transactional Outbox

Outbound textual passa a ser assincrono:

```text
HTTP Messages API
  -> PostgreSQL transaction
     -> Message QUEUED
     -> OutboxEvent PENDING
  -> OutboxDispatcher
  -> BullMQ queue messaging-outbound
  -> MessagingOutboundWorker
  -> MessagingOutboundService.dispatchQueuedMessage
  -> MessagingProviderRegistry
  -> Provider adapter
  -> Evolution/Development provider
```

PostgreSQL continua fonte da verdade. Redis/BullMQ representa execucao transitoria e pode reconstruir jobs a partir de `OutboxEvent` + `Message QUEUED`.

Inbound permanece direto:

```text
Evolution webhook -> MessagingInboundService -> PostgreSQL
```

Socket.io, Meta Cloud API, R2, historico retroativo e transferencia avancada permanecem fora do escopo desta sprint.

O provider traduz comandos canonicos para `sendText`, usa `externalReference` da connection como `instanceName` e retorna apenas resultado provider-neutral. Payload bruto da Evolution nao entra no core.

Lifecycle de connection:

```text
/messaging/connections/evolution -> create instance
/messaging/connections/:id/qr    -> connect/QR
/messaging/connections/:id/status -> connectionState
/messaging/connections/:id/logout -> logout
```

Webhook:

```text
Evolution webhook
  -> /webhooks/evolution
  -> JWT webhook validation
  -> EvolutionWebhookTranslator
  -> MessagingInboundService / MessagingStatusService / MessagingConnectionsService
```

Eventos suportados: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE_UPDATE`, `QRCODE_UPDATED` e `CONNECTION_UPDATE`. Inbound duplicado continua idempotente por tenant, connection e external message id.

Redis/PostgreSQL adicionados no Compose pertencem a infraestrutura interna da Evolution API. Nexos ainda nao implementa Redis/BullMQ, filas, Socket.io, R2, campanhas, bots, IA ou billing.

## Sprint 07.01 - Evolution E2E hardening

O hardening corrigiu diferencas entre teste automatizado e runtime real:

- `ConfigModule` agora carrega `.env` da raiz quando o backend roda com cwd `backend`.
- Connections Evolution sao reconciliadas contra `fetchInstances`; ausencia da instance vira estado `ERROR` e erro de negocio `INSTANCE_NOT_FOUND`.
- Criacao de connection registra webhook explicitamente via `/webhook/set/:instanceName`.
- Webhook JWT com `jwt_key` foi mantido por ser suportado oficialmente pela Evolution.
- `/instancias` deixa de exibir provider `DEVELOPMENT` como instancia operacional.
- Remocao de connection chama `/instance/delete/:instanceName` quando a instance existe e desvincula dados locais antes de apagar a connection.

Historical WhatsApp synchronization permanece fora de escopo.

## Sprint 01.1 - Regression Gate

O frontend Lovable/TanStack segue como contrato funcional e visual. A Sprint 01.1 nao mudou design, rotas ou navegacao; ela estabilizou o pipeline local para as proximas sprints.

Decisoes:

- NestJS Auth e a autoridade definitiva de identidade da plataforma.
- Supabase Auth permanece como legado temporario do MVP ate os fluxos operacionais serem migrados.
- `routeTree.gen.ts` deve manter o footer gerado pelo TanStack Start com o registro de `@tanstack/react-start`; sem esse footer, o manifest recebe `routeTreeRoutes` indefinido.
- O gate de regressao oficial e `bun run verify`.

## Sprint 02 - Organizacao e RBAC

A primeira camada real de dominio SaaS foi migrada para NestJS/PostgreSQL/Prisma:

```text
React/TanStack
  -> Nexos API
  -> JwtAuthGuard
  -> PermissionsGuard
  -> TenantMembership
  -> RolePermission
  -> Users / Departments / Roles
  -> Prisma
  -> PostgreSQL
```

Fronteiras novas:

- `backend/src/departments`: departamentos reais tenant-owned.
- `backend/src/roles`: perfis de acesso e permission catalog.
- `backend/src/users`: users/memberships com associacao de roles e departments.
- `backend/src/auth/permissions.guard.ts`: autorizacao server-side por permission.

Decisoes:

- Roles sao tenant-scoped.
- Permissions sao catalogo global controlado pelo backend.
- Platform Admin e separado de Tenant Admin.
- `ProtectedRecord` foi removido do dominio de producao.
- As superficies `/login`, `/departamentos`, `/atendentes`, `/perfis`, `/configuracoes/usuarios` e `/configuracoes/permissoes` nao dependem mais de Supabase.

## Sprint 08.01 - Inbound e reconnect

Inbound separa identidade do owner conectado da identidade remota do cliente. `EvolutionWebhookTranslator` extrai `remoteJid`, normaliza JIDs reais (`@s.whatsapp.net`, `@c.us` e device suffix) e envia candidatos canonicos ao `MessagingInboundService`. O inbound procura contato existente por telefone normalizado antes de criar novo registro, evitando que uma resposta real abra outra Conversation.

Reconnect preserva a `MessagingConnection` local. Quando uma connection fica `CONNECTED`, o backend chama `ensureWebhookConfigured(instanceName)` para registrar novamente o callback Evolution de forma idempotente. Falha nesse ensure durante webhook de status e registrada de forma sanitizada e nao derruba a resposta HTTP do webhook.

## Sprint 08.02 - Homologation reset

Homologacao passa a ter reset deterministico via script local com allowlist de database, bloqueio de producao, migrations, Prisma generate, seed minimo e validacao de contagens. Cleanup seletivo permanece auxiliar; a estrategia principal e recriar o banco `nexos_0802`.

Contact lifecycle segue soft delete + restore: `archivedAt` preserva historico, e create com mesmo telefone normalizado restaura o Contact arquivado em vez de criar duplicata ou falhar por unique constraint.

## Sprint 08.03 - Auth consolidation

O acesso passa a seguir um contrato unico:

```text
/login
  -> VITE_NEXOS_API_URL
  -> POST /api/auth/login
  -> User ACTIVE
  -> TenantMembership ACTIVE
  -> JWT access + refresh
  -> GET /api/auth/me
  -> Zustand session
  -> route guards
```

O frontend nao seleciona `acme` por padrao. Em homologacao, o backend auto-seleciona a unica membership ativa do usuario `admin@nexo.app` no tenant `homologacao`.

`GET /api/health` separa API/database de Redis: o login depende de API + database, enquanto Redis down e diagnostico operacional, nao falha de credencial.

Tokens continuam em `localStorage` por compatibilidade; refresh automatico e logout sincronizado entre abas foram consolidados, mas HttpOnly cookie permanece melhoria futura.

## Sprint 08.04 - Operational data e inbound

Outbound:

```text
Frontend -> API -> PostgreSQL + Outbox -> BullMQ -> Worker -> Evolution -> WhatsApp
```

Inbound:

```text
WhatsApp -> Evolution -> authenticated webhook -> translator -> Connection resolution
-> Contact resolution -> Conversation resolution -> Message persistence -> polling/refetch -> Frontend
```

`GET /api/messaging/connections` e a fonte operacional unica para Connections no Inbox. A camada de UI
nao sintetiza instances e nao volta para mock/Supabase quando a API falha.

Webhook auth usa o mesmo contrato configurado por `ensureWebhookConfigured`: header `jwt_key` com
`EVOLUTION_WEBHOOK_SECRET`. Bearer JWT segue aceito para compatibilidade automatizada. Logs estruturados
incluem `requestId`, `authResult`, `eventType`, `kind` e `ignoredReason` sem registrar corpo completo,
telefone completo ou secrets.

## Sprint 09 - Realtime

Socket.io foi adicionado como camada de notificacao, nao como fonte da verdade. O backend expoe namespace
`/realtime` no path `/socket.io`, autentica o handshake com access token e deriva tenant/membership pelo
servidor. Rooms oficiais ficam centralizadas em `backend/src/realtime/realtime-rooms.ts`.

Eventos de Message, Conversation, Connection, presenca e digitacao saem por `RealtimePublisher` apos
persistencia confirmada. REST permanece responsavel por recuperacao e reconciliacao.

No rework da Sprint 09, o bootstrap fisico no `nexos_0802` foi protegido por teste real de `AppModule`.
A dependencia de indice 1 de `ConversationsController` e `MessagesService` e agora usa token explicito
`@Inject(MessagesService)`. O Redis adapter tambem foi corrigido para aplicar `namespace.server.adapter(...)`
quando o Nest entrega um namespace Socket.io no `afterInit`.

## Sprint 09 Rework II - Inbox runtime

`InboxLayout` consome REST como fonte principal e usa Socket.io apenas como atualizacao incremental. O hook
`useRealtimeInbox` nao pode bloquear render: estados `disabled`, `offline`, `degraded`, `connecting` e
`reconnecting` mantem polling REST.

O estado externo de realtime segue o contrato do React:

```text
useSyncExternalStore -> realtimeSnapshot cacheado -> render estavel
```

Snapshots so mudam quando `status` ou `lastEventId` mudam. Subscriptions de Conversation sao idempotentes,
listeners sao registrados uma vez por socket singleton e reconcile REST ocorre somente na transicao real
para `connected`.

## Sprint 10 - Inbox sem runtime legado

A Inbox passa a seguir o limite oficial de dominio:

```text
Inbox UI -> Nexos API -> PostgreSQL
Realtime -> invalida cache/reconcilia via REST
```

`@/lib/mvp`, Supabase client, stores mock e fallbacks nao participam mais das rotas operacionais da
Inbox. A protecao automatizada `scripts/check-inbox-legacy-runtime.mjs` roda no `verify` para impedir
regressao.

Tags sao tenant-scoped, normalizadas por `lower(trim(name))`, arquivaveis e aplicadas a Contacts por API.
Agentes podem usar Tags existentes (`chat.tags.use`), enquanto criacao/edicao/archive exige
`chat.tags.manage`.

Quick Replies sao tenant-scoped, opcionais por departamento e respeitam o escopo operacional do usuario.
Atalhos sao normalizados com `/`, bloqueados contra duplicidade no mesmo escopo e inseridos no composer
sem envio automatico.

Eventos realtime novos (`contact.updated`, `contact.tags.updated`) servem apenas para atualizar a UI; o
estado final continua vindo das queries REST.
