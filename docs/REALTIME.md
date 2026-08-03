# Realtime

## Arquitetura

PostgreSQL continua sendo a fonte da verdade. REST continua responsavel por consulta, recovery,
paginação, autorização e consistência. Socket.io apenas notifica mudanças ja persistidas.

Fluxos:

```text
WhatsApp -> Evolution -> webhook -> PostgreSQL -> RealtimePublisher -> Socket.io -> browser
Frontend -> REST -> PostgreSQL + Outbox -> RealtimePublisher -> Socket.io -> browser
```

## Configuração

- Namespace: `/realtime`
- Path: `/socket.io`
- Token: `socket.auth.accessToken`
- Feature flag: `NEXOS_REALTIME_ENABLED`
- Redis adapter: `NEXOS_REALTIME_REDIS_ADAPTER_ENABLED`
- Redis usado: `REDIS_URL`, o Redis do Nexos, nunca `evolution-redis`
- Presence TTL: `NEXOS_PRESENCE_TTL_SECONDS`

## Autenticação

O handshake valida JWT access token, tipo `access`, user ativo, membership ativa, tenant derivado do
token e membership real do banco. O cliente nao escolhe tenant, membership ou departamentos confiaveis.

Codigos canonicos:

- `REALTIME_TOKEN_MISSING`
- `REALTIME_TOKEN_INVALID`
- `REALTIME_TOKEN_EXPIRED`
- `REALTIME_USER_INACTIVE`
- `REALTIME_MEMBERSHIP_INACTIVE`

## Rooms

- `tenant:{tenantId}`
- `membership:{membershipId}`
- `department:{departmentId}`
- `conversation:{conversationId}`

O socket entra automaticamente nas rooms de tenant, membership e departamentos autorizados. Para
`conversation.subscribe`, o servidor valida visibilidade da Conversation antes de entrar na room.

## Envelope

Todos os eventos server -> client usam:

```json
{
  "eventId": "uuid",
  "event": "message.created",
  "version": 1,
  "occurredAt": "ISO-8601",
  "data": {}
}
```

`eventId` permite deduplicação no frontend. Alterações incompatíveis futuras devem incrementar `version`.

## Eventos

- `message.created`
- `message.status.updated`
- `conversation.created`
- `conversation.updated`
- `conversation.assignment.updated`
- `conversation.unread.updated`
- `connection.status.updated`
- `presence.updated`
- `typing.started`
- `typing.stopped`

Payloads são mínimos e não carregam secrets, tokens, QR, payload Evolution bruto ou histórico completo.

## Emissão Pós-Commit

Serviços de domínio chamam `RealtimePublisher` somente depois de transações Prisma concluídas. Falha de
publish não altera o dado persistido; a UI recupera por REST no fallback ou reconciliação.

## Presença

Presença é efêmera. O servidor mantém contador de sockets por membership para multi-tab/multi-device e
usa Redis Nexos com TTL:

```text
nexos:presence:{tenantId}:{membershipId}
```

Estados iniciais: `online`, `away`, `offline`.

## Typing

Eventos client -> server:

- `typing.start`
- `typing.stop`

O servidor valida acesso à Conversation. Conteúdo digitado não é enviado, persistido ou logado. O estado
expira automaticamente por timeout curto.

## Frontend

`src/lib/realtime` mantém um singleton Socket.io por aba. A Inbox usa realtime quando conectado e mantém
polling como fallback quando offline/degradado. Ao reconectar, React Query invalida Conversations,
Conversation aberta, Messages e Connections para catch-up por REST.

## Modo Degradado

Se Redis adapter falhar, o health informa `realtime=degraded` e `realtimeAdapter=redis_degraded`. REST,
PostgreSQL, webhook e Outbox continuam sendo caminhos de consistência.

## Rework Sprint 09 - Bootstrap e Redis adapter

A falha fisica de startup no `nexos_0802` foi isolada em `ConversationsController`:

```text
index 0 = PrismaService
index 1 = MessagesService
index 2 = RealtimePublisher
```

O indice 1 agora usa token explicito `@Inject(MessagesService)`. O teste
`backend/src/app.module.spec.ts` compila o `AppModule` real e valida `design:paramtypes`, evitando que
build/typecheck substituam teste de metadata de DI.

No mesmo rework, o Redis adapter passou a detectar corretamente quando o Nest entrega um `Namespace` do
Socket.io no `afterInit`. Para namespace `/realtime`, o adapter deve ser aplicado no servidor raiz
(`namespace.server.adapter(...)`), nao na propriedade `namespace.adapter`.

## Segurança

Não enviar pelo socket:

- JWT ou refresh token
- webhook secret ou API key
- QR Code
- payload Evolution bruto
- telefone completo sem necessidade
- histórico completo
- dados de outro tenant
