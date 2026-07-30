# NEXOS PROJECT - SPRINT 05

## Messages & Messaging Core

Data: 2026-07-30

Branch: `sprint/05-messages`

Commit inicial: `de66c9a`

Commit final: TBD

Status: READY

## Escopo Implementado

- Modelado `Message` em Prisma/PostgreSQL com tenant, conversa, direcao, tipo, status, autor opcional, leitura e idempotencia.
- Criada migration `20260730000400_messages_core`.
- Criada API NestJS aninhada em `/api/conversations/:conversationId/messages`.
- Migrado `/inbox/:conversationId` para listar historico, enviar texto e marcar leitura via Nexos API.
- Criados eventos `SYSTEM` internos para acoes estruturais de conversa.
- Atualizados `lastMessagePreview`, `lastMessageAt` e `unreadCount` a partir do backend.
- Mantido `localhost:5173` -> `localhost:3001/api` sem regressao de CORS.

## Contrato Funcional

Endpoints:

- `GET /api/conversations/:conversationId/messages?limit=50&cursor=<messageId>`
- `POST /api/conversations/:conversationId/messages`
- `PATCH /api/conversations/:conversationId/messages/read`

Regras:

- `tenantId` e sempre derivado do JWT.
- Historico exige `conversations.read`.
- Envio de texto exige `messages.send`.
- Envio so e permitido para o atendente responsavel pela conversa.
- Conversas `fechada` e `aguardando` bloqueiam envio.
- Mensagem vazia e mensagem acima de 4000 caracteres retornam `400`.
- Mensagens `SYSTEM` nao possuem endpoint publico.

## Fronteiras Preservadas

- Sem Evolution API.
- Sem Meta Cloud API.
- Sem adapter/provider.
- Sem QR code.
- Sem webhook.
- Sem Redis/BullMQ.
- Sem Socket.io.
- Sem Cloudflare R2.
- Sem campanhas, bot, IA ou templates.
- Midia (`IMAGE`/`AUDIO`) fica apenas como fronteira de schema; o composer migrado nao persiste data URL fake.

## Preflight

Houve uma estabilizacao minima antes da implementacao do dominio:

- `backend/prisma/seed.ts` foi ajustado para nao reduzir `conversation_protocol_counters.lastNumber` em execucoes repetidas.
- Motivo: banco local continha conversas criadas por verifies/smokes anteriores, e o seed fixo recriava contador menor que protocolos ja existentes.

Depois disso, o preflight `bun run verify` passou.

## Testes Automatizados

Executado durante a sprint:

- `bunx tsc --noEmit` - PASS
- `bun run --cwd backend build` - PASS
- `bun run --cwd backend test` - PASS, 24 testes
- `bun run verify` - PASS
- `bun run verify` - PASS, segunda execucao sem reseed intermediario

Cobertura e2e adicionada:

- historico e cursor pagination;
- envio valido;
- mensagem vazia;
- mensagem oversized;
- requisicao sem auth;
- falta de `messages.send`;
- tenant isolation;
- escopo departamental;
- conversa fechada;
- conversa em stand by;
- idempotencia por `clientMessageId`;
- `unreadCount` e `readAt`;
- `lastMessagePreview` e `lastMessageAt` transacionais;
- conteudo HTML/XSS tratado como texto no contrato de mensagem.

## Validacao Manual Obrigatoria

- [x] `http://localhost:5173` abre corretamente
- [x] Login Nexos funciona
- [x] Frontend comunica com `http://localhost:3001/api`
- [x] `/clientes` funciona com Nexos API
- [x] `/contatos` funciona com Nexos API
- [x] `/clientes` nao tem `Failed to fetch`
- [x] `/contatos` nao tem `Failed to fetch`
- [x] `/inbox` lista conversas via Nexos API
- [x] `/inbox/:conversationId` lista mensagens via Nexos API
- [x] Envio de texto em conversa atribuida funciona
- [x] Mark read zera pendencias da conversa aberta
- [x] Nenhum `Failed to fetch` nas funcionalidades migradas

Validacao feita por smoke HTTP local com frontend em `http://localhost:5173`, Nest temporario ouvindo em `http://localhost:3001/api`, CORS com origin `http://localhost:5173`, login real, CRM listagem e fluxo messages history/send/read.

## Observacoes

- Rotas legadas como `/historico`, `/simulador`, chamados e partes do painel lateral ainda usam Supabase por estarem fora do recorte Sprint 05.
- O realtime Supabase foi removido da rota migrada de conversa; ate existir Socket.io, a tela usa refetch periodico.
- A geracao de chamado nao cria mais mensagem de sistema pelo frontend, pois eventos `SYSTEM` agora sao responsabilidade interna do backend.
