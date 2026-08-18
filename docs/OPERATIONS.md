# Operations

## Messaging outbound worker

Hotfix scope: RC Sprint 15.2 outbound dispatcher resilience.

Queue:

- `messaging-outbound`
- `campaign-dispatch`

Expected runtime behavior:

- A queued outbound message is processed through the transactional outbox and BullMQ worker.
- Provider requests are logged with tenant, conversation, message, connection, provider, endpoint, method and attempt.
- Secrets and tokens are masked before logs or persisted diagnostics.
- Retryable Evolution/network failures keep the job retryable.
- Permanent provider failures are converted to `UnrecoverableError` and the related outbox event is marked `FAILED`.
- Per-conversation locking serializes sends without creating orphan rejected promises.

Campaign queue behavior:

- `campaign.prepare` cria o snapshot de audiencia.
- `campaign.recipient.send` dispara recipients pelo pipeline outbound oficial.
- `campaign.finalize` consolida contadores finais.
- `campaign.cancel` cancela recipients pendentes.
- Retry usa backoff exponencial e mantem failed jobs para analise operacional.
- O scheduler reconcilia campanhas agendadas quando o worker inicia.

Operational checks:

- Watch for `messaging.outbound.retry_scheduled` during provider outages.
- Watch for `messaging.outbound.worker_failed` only when attempts are exhausted or the error is permanent.
- Watch for `messaging.outbound.worker_error`, `messaging.outbound.worker_stalled`, `messaging.outbound.worker_closing` and `messaging.outbound.worker_closed` during Redis or process incidents.
- Unknown outcome failures (`unknownOutcome=true`) require provider-side reconciliation before manually replaying messages.
- Watch `campaign.worker.config` when the backend starts.
- Watch `campaign.job.failed` for retry/failure analysis.
- Check `/api/health` for `campaignQueue`, `campaignWorker` and `campaignScheduler`.

PRC-05 gate:

- audiencia, preview, agendamento, cancelamento, retry, limites de plano e logs operacionais devem
  permanecer cobertos por `bun run verify`.

Required physical validation before approval:

- Stop Evolution while sending outbound text and media.
- Confirm the backend process stays alive.
- Confirm jobs retry instead of duplicating messages.
- Restart Evolution and confirm pending jobs recover.
- Confirm inbound webhooks continue after outage recovery.
- Confirm no duplicate WhatsApp messages and no duplicate Nexos messages.

Gate:

- `OUTBOUND DISPATCHER HOTFIX REQUIRED` until physical evidence is attached.

## PRC-07 - Reports & Operations

A PRC-07 aprova dashboards, historico, relatorios e export operacional sobre dados reais do banco Nexos.

Contrato final:

- Indicadores: dashboard e relatorio usam `OperationsMetricsService` e calculam conversas, leads, mensagens, chamados, clientes, instancias, tempos medios e SLA.
- Filtros: periodo, status, cliente, departamento, busca, contato e atendente sao resolvidos pela Operations API por tenant.
- Consistencia com mensagens reais: historico e timeline leem conversas, mensagens, tickets e leads via Prisma, sem store mock.
- Export: `/api/operations/reports/attendance/export` suporta `csv`, `xlsx` e `pdf`.
- Filas e SLA: `/api/operations/queues` consolida leads, conversas ativas, conversas encerradas, capacidade, transferencias, tempo medio e SLA por departamento.
- Realtime: dashboard, historico, relatorios e filas invalidam consultas quando eventos de mensagem, conversa ou lead chegam.

Gate automatizado:

- `test:operational-runtime`
- `test:prc07-reports-operations-contract`
- e2e `serves operational dashboard, history, timeline, queues and report exports from Prisma data`

## Evolution contract incidents

For Evolution v2.3.7 validation failures:

- `instance requires property "text"` means Nexos sent an invalid provider payload, not an invalid recipient.
- `instance requires property "key"` or `instance requires property "reaction"` means the reaction contract is invalid.
- These cases must be classified as `INVALID_PROVIDER_PAYLOAD`, `providerCode=VALIDATION_ERROR`, retryable=false.

Physical smoke evidence from 2026-08-06:

- Direct Evolution text: PASS.
- Direct Evolution reaction add/remove: PASS.
- Direct Evolution image/document/audio: PASS.

Operational gate remains pending until the same flows pass through Nexos, Outbox and authenticated media endpoints.
