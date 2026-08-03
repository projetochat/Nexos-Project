# NEXOS PROJECT - SPRINT 09

## Realtime Messaging, Presence & Live Inbox

Data: 2026-08-03

Branch: `sprint/09-realtime-socketio-live-inbox`

Baseline declarado: `16540a5 fix: recover sprint 08.04 evolution session`

Baseline efetivo desta execucao: `c5b27a3 docs: record sprint 08.04 physical approval`

## Resultado

Implementacao tecnica concluida para o realtime oficial do Nexos:

- Socket.io NestJS em namespace `/realtime` e path `/socket.io`.
- Auth de handshake por `socket.auth.accessToken`, com tenant/membership/role derivados server-side.
- Rooms tenant-scoped para tenant, membership, departamento e conversa.
- Publisher central para eventos post-commit de mensagens, status, conversas, atribuicoes, unread e connections.
- Adapter Redis para Socket.io com degradacao controlada para adapter local.
- Presence heartbeat com TTL em Redis.
- Typing start/stop com rate limit e TTL.
- Inbox com singleton `src/lib/realtime`, reconexao, dedupe por `eventId` e fallback REST.
- Health REST com campos `queue`, `realtime` e `realtimeAdapter`.
- Documentacao tecnica em `docs/REALTIME.md` e atualizacoes transversais.

## Evidencias automatizadas

PASS:

- `bun run typecheck`
- `bun run --cwd backend build`
- `bun test --cwd backend`: 62 tests, 128 expects
- `bun run verify`: PASS
- `bun run verify`: PASS novamente

Detalhes do `verify`:

- frontend typecheck: PASS
- lint baseline: PASS, dentro do baseline legado
- frontend build: PASS
- backend build: PASS
- backend test: PASS, 18 files, 99 tests
- Redis queue smoke: PASS
- security XSS: PASS, 3 tests

## Evidencia fisica isolada

PASS:

- Backend compilado subiu em porta isolada `3019`.
- Login REST real em `/api/auth/login` com `admin@nexo.app`, tenant `acme`.
- Socket.io client conectou em `http://localhost:3019/realtime`, path `/socket.io`, transporte websocket.
- Evento `realtime.ready` recebido com `tenantId`, `membershipId` e `departmentIds`.

## Ajustes de ambiente local

Durante o gate, o banco local `nexos` estava com schema atrasado para migrations anteriores:

- faltava `messaging_connections.ownerExternalId`;
- a migration antiga de outbox existia no historico do banco com nome diferente;
- faltava fisicamente `outbox_events.processingAt`.

Foi feita recuperacao local sem reset:

- `prisma migrate deploy` no banco `nexos`;
- `migrate resolve --applied 20260803080000_redis_bullmq_outbox` para reconciliar migration duplicada;
- `ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS processingAt TIMESTAMP(3)`.

O banco de homologacao fisica `nexos_0802` nao foi resetado.

## Escopo nao concluido fisicamente

Ainda falta a homologacao fisica completa exigida pelo sprint:

- dois usuarios reais simultaneos em navegadores distintos;
- inbound WhatsApp real causando `message.created` visual sem F5;
- outbound real causando `message.created` e `message.status.updated` visual sem F5;
- presence visual entre atendentes;
- typing visual entre participantes;
- reconnect real com F5, queda do socket, retomada e reconcile REST;
- validacao de isolamento tenant/department/conversation em clientes reais;
- matriz M01-M126 completa com evidencia fisica ponto a ponto.

## Matriz M01-M126

Resumo executivo:

- M01-M24 Backend Socket.io/Auth/Rooms/Redis/Health: PASS automatizado, PASS smoke fisico de handshake.
- M25-M48 Publishers post-commit e contratos de eventos: PASS automatizado.
- M49-M72 Frontend realtime, dedupe, reconnect e REST fallback: PASS build/typecheck, pendente homologacao visual completa.
- M73-M90 Presence e typing: PASS tecnico backend/client, pendente validacao visual completa.
- M91-M108 Messaging inbound/outbound/status via eventos reais: PASS testes de dominio, pendente WhatsApp fisico completo.
- M109-M120 Segurança, tenant isolation e degradacao: PASS tecnico, pendente matriz fisica multiusuario.
- M121-M126 Documentacao, verify duplo, smoke e decisao de gate: PASS com ressalva fisica.

## Decisao

O incremento esta tecnicamente integrado e verificavel, mas nao deve abrir Sprint 10 ate a homologacao fisica completa do realtime/live inbox.

NOT READY FOR SPRINT 10
