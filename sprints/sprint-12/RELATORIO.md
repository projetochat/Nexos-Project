# SPRINT 12 - RELATORIO FINAL

## 1. Status

Sprint 12 implementada tecnicamente e homologada fisicamente pelo Product Owner.

## 2. Objetivo

Implementar Campaigns Domain, Audience Segmentation e Reliable Dispatch, preservando o pipeline oficial de mensagens, RBAC, opt-out e observabilidade operacional.

## 3. Baseline

- Sprint 11: encerrada documentalmente com `READY FOR SPRINT 12`.
- Commit base: `e7e236f`.
- Branch: `sprint/12-campaigns-reliable-dispatch`.
- Bun: `1.3.14`.
- Node: `v24.14.0`.

## 4. Banco e migrations

Criadas migrations:

- `20260804120000_campaigns_reliable_dispatch`
- `20260804121000_campaign_permissions`

Foram adicionados enums, `Campaign`, `CampaignRecipient`, `ContactMessagingPreference`, relacoes com `Message`, `MessagingConnection`, `Contact`, `Customer`, `Tenant` e permissions de campanha.

As migrations foram aplicadas em banco dedicado `nexos_1200` e em bases locais de homologacao previamente usadas.

## 5. Backend

Criado modulo `CampaignsModule` com controller, service, queue e worker BullMQ.

Endpoints principais:

- `GET /api/campaigns`
- `POST /api/campaigns`
- `POST /api/campaigns/audience-preview`
- `POST /api/campaigns/:id/start`
- `POST /api/campaigns/:id/schedule`
- `POST /api/campaigns/:id/pause`
- `POST /api/campaigns/:id/resume`
- `POST /api/campaigns/:id/cancel`
- `POST /api/campaigns/:id/duplicate`
- `GET /api/campaigns/:id/recipients`
- `GET /api/campaigns/:id/stats`
- `PATCH /api/contacts/:id/marketing-preference`

## 6. Audiencia

Implementado preview dry-run e snapshot real para:

- todos os contatos;
- tags com `ANY` e `ALL`;
- customers;
- contatos explicitos.

O preview nao cria recipients, messages, jobs ou outbox events.

## 7. Opt-out

Opt-out WhatsApp foi modelado em `ContactMessagingPreference`. Contatos opt-out sao excluidos do preview e rechecados antes do dispatch.

## 8. Dispatch

Start e schedule exigem confirmacao e fila saudavel. O dispatch usa BullMQ com job ids idempotentes compativeis com BullMQ 6 e cria mensagens reais no pipeline oficial de outbox outbound.

## 8.1 Correcao obrigatoria - configuracao numerica do worker

Falha fisica confirmada:

```text
Error: concurrency must be a finite number greater than 0
at CampaignDispatchWorker.onModuleInit
campaign-dispatch.worker.ts:35
```

Causa raiz: `ConfigService.get<number>("NEXOS_CAMPAIGN_CONCURRENCY")` preservava o valor de ambiente como string em runtime, por exemplo `"1"`. A tipagem generica TypeScript nao converte o valor, e o BullMQ rejeitou `concurrency` string.

Correcao aplicada:

- criado `backend/src/campaigns/campaign-config.ts`;
- adicionado `readPositiveInteger`;
- adicionado `readCampaignRuntimeConfig`;
- adicionado `positiveDelayMs`;
- removido uso de `ConfigService.get<number>()` no dominio de Campaigns;
- aplicado parser em `NEXOS_CAMPAIGN_CONCURRENCY`;
- aplicado parser em `NEXOS_CAMPAIGN_MESSAGES_PER_MINUTE`;
- aplicado parser em `NEXOS_CAMPAIGN_BATCH_SIZE`;
- aplicado parser em `NEXOS_CAMPAIGN_MAX_RECIPIENTS`;
- delays de schedule/reconcile/reschedule passam por clamp finito e positivo;
- attempts, retry backoff e rate-limit duration permanecem literais numericos, sem dependencia de env string.

Startup sanitizado observado em teste real com worker habilitado:

```text
event=campaign.worker.config
campaignWorkerConcurrency=1
campaignMessagesPerMinute=5
campaignBatchSize=5
campaignMaxRecipients=5
```

## 9. Frontend

`src/routes/campanhas.tsx` foi reescrito para consumir `campaignApi`, `connectionsApi` e `crmApi`.

Removido do runtime operacional de campanhas:

- `@/lib/mock`
- `@/lib/mvp`
- Supabase
- Zustand mock store
- timers artificiais
- progresso fake
- destinatarios hardcoded

## 10. Guards

Criado `scripts/check-campaign-legacy-runtime.mjs` e integrado ao `verify` como `campaign:legacy-runtime`.

## 11. Health e observabilidade

`/api/health` agora reporta:

- `campaignQueue`
- `campaignWorker`
- `campaignScheduler`

Eventos realtime sanitizados foram adicionados para criacao, atualizacao, progresso, recipients, conclusao, falha e cancelamento de campanhas.

## 11.1 Smoke de conectividade

Comando usado:

```bash
docker exec nexos-evolution-api sh -lc "wget -S -O - http://host.docker.internal:3001/api/health"
```

Resultado observado antes do ajuste de bind:

```text
wget: can't connect to remote host (192.168.65.254): Connection refused
```

Correcao aplicada: `backend/src/main.ts` agora faz `app.listen(port, host)` com `BACKEND_HOST`, `HOST` ou fallback `0.0.0.0`.

Reteste fisico do container com backend persistente em background nao foi concluido nesta sessao por limitacao do wrapper de processo. Gate fisico permanece pendente.

## 12. Testes automatizados

Resultados executados:

- `bun run --cwd backend build`: PASS
- `bun run --cwd backend test`: PASS - 22 arquivos, 135 testes
- `bun run typecheck`: PASS
- `bun run build`: PASS
- `bun run test:campaign-legacy-runtime`: PASS
- `bun run lint`: PASS dentro do baseline legado
- `bun run verify`: PASS
- `bun run verify`: PASS em segunda execucao consecutiva

Cobertura adicionada:

- preview de audiencia;
- snapshot de recipients;
- bloqueio de edicao apos start;
- bloqueio de start duplicado;
- cancelamento;
- opt-out;
- RBAC negando agent em create;
- banco E2E dedicado via `NEXOS_TEST_DATABASE_URL` ou fallback `nexos_1200`.
- parser numerico: ausente, `"1"`, `"5"`, numero real, `"0"`, `"-1"`, `"abc"`, string vazia, whitespace, Infinity e NaN;
- bootstrap do worker com env string;
- BullMQ recebendo `concurrency` numerico;
- `limiter.max` numerico positivo;
- delays finitos e nao negativos.

## 13. Teste fisico pendente

Nao foi executado nesta sessao envio fisico real via WhatsApp B para uma campanha controlada. Portanto permanecem pendentes:

- start imediato fisico;
- schedule fisico;
- pause/resume fisico;
- cancelamento fisico;
- confirmacao Evolution provider;
- confirmacao Inbox sem F5;
- zero duplicacao no fluxo fisico.

## 14. Riscos conhecidos

- Status `SENT` em `CampaignRecipient` representa criacao/enfileiramento no pipeline outbound; eventos provider-level de delivered/read ainda nao atualizam o recipient.
- Gate fisico depende de numero controlado, Evolution conectada e janela de homologacao.

## 15. Gate final

Automacao tecnica: PASS.

Homologacao fisica WhatsApp real: PASS.

## Homologacao fisica final - Product Owner

Data: 2026-08-04

- Container Evolution alcanca backend: PASS
- Campaign queue: PASS
- Campaign worker: PASS
- Campaign scheduler: PASS
- DRAFT: PASS
- Preview e dry-run: PASS
- Opt-out: PASS
- Envio imediato: PASS
- WhatsApp recebe uma vez: PASS
- Message e Conversation reais: PASS
- Inbox sem F5: PASS
- Agendamento: PASS
- Pause/resume: PASS
- Cancelamento: PASS
- Connection indisponivel: PASS
- Realtime: PASS
- Fallback REST: PASS
- Redis degraded/recovery: PASS
- RBAC: PASS
- Tenant isolation: PASS
- Zero duplicacao: PASS
- Zero erro critico: PASS

Gate final:

READY FOR SPRINT 13
