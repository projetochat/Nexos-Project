# SPRINT 07 - RELATORIO FINAL

## 1. Status

Implementada e validada localmente. Bun continua indisponivel no PATH deste workspace; o gate oficial foi executado via fallback `node scripts/verify.mjs`.

## 2. Resumo executivo

Sprint 07 adicionou Evolution API como primeiro provider real do Universal Messaging Adapter. O core de Contact, Conversation e Message permaneceu provider-neutral. Foram entregues client HTTP isolado, provider Evolution, lifecycle de connections, QR Code, webhook seguro, translator de inbound/status, tela `/instancias` migrada para Nexos API, Compose da Evolution e testes dos gaps da Sprint 06.

## 3. Baseline Git

- Branch inicial: `sprint/06-messaging-adapter`
- SHA inicial Sprint 07: `4107bb1e334841b2feb4459f938105a4a9263402`
- Branch da sprint: `sprint/07-evolution-provider`
- Worktree inicial: limpo

## 4. Preflight

- `bun --version`: falhou, Bun nao esta no PATH.
- `node scripts/verify.mjs`: PASS antes da implementacao.
- Migrations Sprint 06 ja consolidadas.
- Nenhum push realizado.

## 5. Evolution oficial

Implementacao baseada na documentacao oficial Evolution API:

- Instances: `POST /instance/create`, `GET /instance/connect/:instanceName`, `GET /instance/connectionState/:instanceName`.
- Send text: `POST /message/sendText/:instanceName` com header `apikey`.
- Webhooks por instancia: `POST /webhook/set/:instanceName`, eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE_UPDATE`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`.
- Docker: imagem fixada em `evoapicloud/evolution-api:v2.3.1`, com PostgreSQL e Redis internos da Evolution.

## 6. Provider Evolution

Criado em `backend/src/messaging/evolution`:

- `EvolutionClient`
- `EvolutionMessagingProvider`
- `EvolutionWebhookTranslator`
- `EvolutionWebhookController`
- config/types isolados

O provider usa `MessagingConnection.externalReference` como `instanceName`, envia apenas TEXT e traduz respostas para `SendMessageResult`.

## 7. Connections API

Criados endpoints tenant-scoped:

- `GET /api/messaging/connections`
- `GET /api/messaging/connections/:id`
- `GET /api/messaging/connections/health/evolution`
- `POST /api/messaging/connections/evolution`
- `GET /api/messaging/connections/:id/status`
- `GET /api/messaging/connections/:id/qr`
- `PATCH /api/messaging/connections/:id/logout`

Permissoes adicionadas:

- `connections.read`
- `connections.manage`

## 8. Webhook

Criado `POST /api/webhooks/evolution`.

Seguranca:

- exige `Authorization: Bearer <token>`;
- valida assinatura com `EVOLUTION_WEBHOOK_SECRET`;
- exige claims `app=evolution` e `action=webhook`;
- nao aceita JWT de usuario Nexos como auth da rota.

Eventos traduzidos:

- inbound text via `MESSAGES_UPSERT`;
- status via `MESSAGES_UPDATE` e `SEND_MESSAGE_UPDATE`;
- status de connection via `CONNECTION_UPDATE`;
- QR via `QRCODE_UPDATED`.

## 9. Outbound real

`POST /api/conversations/:conversationId/messages` continua com payload publico canonico. A mudanca e interna: a conversa deve possuir `connectionId` e a connection precisa estar conectada. Sem connection configurada, o backend retorna erro explicito e nao escolhe provider automaticamente.

## 10. Frontend

`/instancias` foi migrada para Nexos API:

- lista connections;
- cria connection Evolution;
- mostra QR Code;
- consulta status;
- desconecta instancia.

Nenhuma dependencia em Supabase foi adicionada nessa rota.

## 11. Infra local

`docker-compose.yml` ganhou:

- `evolution-postgres`
- `evolution-redis`
- `evolution-api`

Observacao: Redis/PostgreSQL extras pertencem a Evolution API. Nexos Redis/BullMQ continua fora de escopo.

## 12. Variaveis de ambiente

Atualizadas em `.env.example`:

- `EVOLUTION_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_TIMEOUT_MS`
- `EVOLUTION_WEBHOOK_PUBLIC_URL`
- `EVOLUTION_WEBHOOK_SECRET`
- `EVOLUTION_SERVER_URL`
- `EVOLUTION_POSTGRES_USERNAME`
- `EVOLUTION_POSTGRES_PASSWORD`
- `EVOLUTION_POSTGRES_DATABASE`

## 13. Testes

Backend:

- `evolution.client.spec.ts`
- `evolution-messaging.provider.spec.ts`
- `evolution-webhook.translator.spec.ts`
- registry atualizado para provider Evolution
- E2E de inbound duplicado
- E2E de external message IDs iguais em tenants diferentes
- E2E de webhook sem auth
- E2E de tenant isolation em connections

Resultado apos correcao de homologacao:

- 8 arquivos PASS
- 44 testes PASS

## 14. Verify

Executado durante a sprint:

- `npm run typecheck` - PASS
- `tsc -p backend/tsconfig.build.json` - PASS
- `vitest run --root backend` - PASS, 44 testes
- `node scripts/verify.mjs` - PASS
- `node scripts/verify.mjs` - PASS, segunda execucao

## 15. Fronteiras preservadas

Nao implementado:

- Meta Cloud API
- Redis/BullMQ do Nexos
- Socket.io
- Cloudflare R2 definitivo
- campanhas
- bot
- IA
- billing
- Kubernetes

## 16. Documentacao

Atualizados:

- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/AUTHENTICATION.md`
- `docs/BUSINESS_RULES.md`
- `docs/CODING_GUIDELINES.md`
- `docs/DATABASE.md`
- `docs/DEPLOY.md`
- `docs/README.md`
- `docs/ROADMAP.md`
- `docs/USER_FLOW.md`
- `docs/CHANGELOG.md`

## 17. Riscos e proximos passos

- Ambientes reais precisam configurar `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET` e URL publica alcancavel pela Evolution.
- Sem Socket.io, QR/status ainda dependem de polling/refetch.
- Sem filas Nexos, outbound segue sincrono.
- Midia real permanece para sprint futura com storage.

## 18. Correcao de homologacao manual

Durante homologacao manual foi encontrado bootstrap failure em `MessagingProviderRegistry.register` porque o runtime `tsx watch src/main.ts` nao emite `design:paramtypes` para constructor injection. A camada Messaging nova foi alinhada ao padrao ja usado nos modulos antigos do backend, com `@Inject(...)` explicito nos construtores que dependem do container.

Teste adicionado:

- `backend/src/messaging/messaging.module.spec.ts`

Esse teste inicializa o `MessagingModule` pelo container Nest e confirma que `DEVELOPMENT` e `EVOLUTION` sao resolvidos pelo `MessagingProviderRegistry`.

Validacao da correcao:

- `bun run backend:dev`: bloqueado neste executor porque `bun` nao esta no PATH.
- `tsx watch src/main.ts`: PASS.
- `GET /api/health`: PASS.
- `node scripts/verify.mjs`: PASS.

## 19. Gate

A Evolution API esta conectada ao Universal Messaging Adapter sem vazar payload provider-specific para o dominio central.

READY FOR SPRINT 08
