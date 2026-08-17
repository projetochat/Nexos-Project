# RC Sprint 15.2 - Critical Hotfix - Outbound Dispatcher & Worker Resilience

## 1. Status
OUTBOUND DISPATCHER HOTFIX REQUIRED

## 2. Resumo Executivo
Hotfix cirurgico aplicado no pipeline Outbox -> BullMQ -> MessagingOutboundWorker -> MessagingOutboundService -> Evolution API. A causa raiz da queda por rejeicao nao tratada foi corrigida, os erros da Evolution agora sao classificados com diagnostico sanitizado, e a regressao automatizada de unhandled rejection foi adicionada.

O gate final ainda nao pode ser aprovado porque os testes fisicos de outage/recovery/zero duplicacao nao foram executados nesta sessao.

## 3. Baseline
- Branch inicial: `rc/15-2-messaging-core-completion`
- Branch hotfix: `hotfix/rc-15-2-outbound-worker-resilience`
- SHA inicial: `1e6091f7bc2b151fc1f3eabbb2042c647dfb6c1e`
- Baseline verify em `nexos_0801`: PASS
- Evolution API: `evoapicloud/evolution-api:v2.3.7`
- Bun: `1.3.14`
- Node: `v24.14.0`
- BullMQ: `^6.0.5`
- NestJS: `^11.1.9`

## 4. Evidencia do Erro Original
Fluxo reportado: `outbox.messaging_outbound.enqueued` -> `messaging.outbound.failed` retrying -> `OutboundDispatchError: Internal Server Error` -> `triggerUncaughtException` -> backend offline.

## 5. Root Cause
`withConversationLock` retornava `next`, mas criava `tracked = next.finally(...)`. Quando `next` rejeitava, `tracked` tambem rejeitava sem `await`/`catch`, gerando uma promise orfa fora do controle do BullMQ.

## 6. Worker Antes
Processor chamava `this.process(job)`, mas o lock interno deixava uma rejeicao paralela nao observada. Listeners eram basicos e sem wrapper defensivo.

## 7. Worker Depois
Processor usa `return await`. O lock retorna `tracked`. Listeners `active`, `completed`, `failed`, `error`, `stalled`, `progress`, `closing` e `closed` foram adicionados com logging seguro.

## 8. Error Classifier
Criado `classifyEvolutionProviderError` para HTTP 400/401/403/404/408/422/429/500/502/503/504 e erros de rede.

## 9. Evolution Response Diagnostics
Erros carregam `httpStatus`, `providerCode`, `endpointPath`, `method` e `unknownOutcome`.

## 10. Retry e Backoff
BullMQ permanece como fonte oficial de retry: `attempts: 5`, exponential backoff. O service faz uma tentativa de provider por job.

## 11. Message State
Retryable antes da tentativa final mantem Message em `QUEUED`. Falha final marca `FAILED`.

## 12. Outbox State
Outbox continua idempotente por `aggregateId`. Falha final do worker marca o evento como `FAILED`.

## 13. Idempotencia
JobId deterministico permanece `message-{messageId}`. Mensagens ja `SENT`, `DELIVERED` ou `READ` sao ignoradas sem reenvio.

## 14. Unknown Outcome
Timeout, `ECONNRESET` e `ETIMEDOUT` sao sinalizados como resultado desconhecido para diagnostico e reconciliacao segura.

## 15. Realtime
Status segue publicado por `publishMessageStatusUpdated` quando o service altera estado.

## 16. Logs
Adicionados: `messaging.outbound.started`, `provider_request`, `provider_response`, `retry_scheduled`, `failed_final`, `worker_error`, `worker_failed`, `worker_stalled`.

## 17. Seguranca dos Logs
Segredos, authorization, tokens e base64 sao redigidos ou nao emitidos. Conteudo integral da mensagem nao e logado.

## 18. Testes Unitarios
25 arquivos, 167 testes backend PASS.

## 19. Testes de Integracao
`bun run verify` baseline PASS em `nexos_0801` antes do hotfix.

Verify final apos hotfix:
- Comando: `bun run verify`
- Ambiente: `DATABASE_URL=postgresql://nexos:nexos_dev_password@localhost:5432/nexos_0801?schema=public`, `REDIS_URL=redis://localhost:6379`
- Resultado: PASS
- Frontend typecheck: PASS
- ESLint baseline: PASS, `917 errors and 12 warnings within legacy baseline`
- Frontend build: PASS
- Backend build: PASS
- Backend test: PASS, 25 arquivos, 167 testes
- Redis queue smoke: PASS
- Security XSS: PASS, 1 arquivo, 3 testes

## 20. Teste de Unhandled Rejection
PASS em `messaging-outbound.worker.spec.ts`.

## 21. Teste de Disponibilidade
Nao executado fisicamente.

## 22. Teste Evolution Offline
Nao executado fisicamente.

## 23. Teste Evolution Recovery
Nao executado fisicamente.

## 24. Teste Redis Degraded
Nao executado fisicamente.

## 25. Teste de Restart
Nao executado fisicamente.

## 26. Testes Fisicos
Pendentes.

## 27. Regressoes
Nao houve alteracao intencional em CRM, Dashboard, Tickets, Automacoes, Bot, SaaS ou Control Plane. `backend/src/operations/operations.service.ts` ja estava alterado antes.

## 28. Arquivos Alterados
Principais: worker, service outbound, Evolution client/classifier, contratos e specs.

## 29. Commits
Nenhum commit criado nesta sessao.

## 30. Git Status
Worktree permanece sujo por WIP do Final Rework + hotfix.

## 31. Metricas H001-H050
H001 PASS preflight. H002 PASS baseline verify. H003 PASS root cause. H004 PASS processor await/return. H005-H007 PASS listeners. H008-H010 PASS classifier/log sanitization. H011-H018 PASS automatizado parcial. H019 PASS existente. H020 PARTIAL sem fisico. H021-H030 PASS unitario automatizado. H031-H038 PARTIAL sem fisico. H039-H044 PENDING fisico/log real. H045 PASS build. H046 PASS backend tests. H047 PASS typecheck. H048 PASS baseline verify. H049 PASS verify final. H050 FAIL git nao limpo.

## 32. Riscos Remanescentes
Validacao fisica de outage/recovery ainda e obrigatoria. Resultado desconhecido ainda depende de reconciliacao operacional/provider quando a Evolution nao retorna ID.

## 33. Gate
OUTBOUND DISPATCHER HOTFIX REQUIRED
