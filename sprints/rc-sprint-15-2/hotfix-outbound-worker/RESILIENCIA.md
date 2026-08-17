# Resiliencia

Worker:
- processor retorna/aguarda a promise do lock.
- listeners seguros: `active`, `completed`, `failed`, `error`, `stalled`, `progress`, `closing`, `closed`.
- falha retryable volta ao BullMQ para attempts/backoff.
- falha permanente vira `UnrecoverableError`.
- falha final marca Outbox como `FAILED`.

Service:
- uma chamada de provider por execucao de job.
- BullMQ continua sendo a fonte oficial de retry.
- mensagens terminalmente enviadas sao ignoradas idempotentemente.
- sucesso sem `providerMessageId` e tratado como resposta insegura.

Limites:
- nao foi criado processo separado para o worker.
- nao foi executado restart fisico do backend nesta sessao.
- Redis degraded e Evolution offline fisicos precisam de janela controlada.

