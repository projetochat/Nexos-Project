# Environment Matrix

Secrets were not copied into this report.

## Root `.env`

Observed keys:

- `EVOLUTION_BASE_URL=http://localhost:8080`
- `EVOLUTION_API_KEY` present
- `EVOLUTION_TIMEOUT_MS=10000`
- `EVOLUTION_WEBHOOK_PUBLIC_URL=http://host.docker.internal:3001/api/webhooks/evolution`
- `EVOLUTION_WEBHOOK_SECRET` present
- `DATABASE_URL` present
- `REDIS_URL=redis://localhost:6379`
- `NEXOS_QUEUE_ENABLED=true`
- `NEXOS_QUEUE_WORKER_ENABLED=true`
- `NEXOS_OUTBOX_DISPATCHER_ENABLED=true`
- `NEXOS_OUTBOUND_WORKER_CONCURRENCY=5`

## Examples

`.env.example` and `backend/.env.example` include defaults for database, Evolution, Redis, queue, realtime and message storage.

## Drift Risk

Prisma migrate status reported database `nexos`, while some historical sprint references and manual checks used `nexos_0802`.

This matters because:

- `nexos` has 705 messages but does not contain the newly expected messaging core columns.
- `nexos_0802` contains `providerChatId`, `providerParticipantId`, `quotedProviderMessageId`, `mediaStorageKey` and `mediaChecksum`.
- The same codebase can pass build/tests and still fail at runtime if the backend points to the database without the required migration.

MRC-02 must freeze the official homologation database before any correction.
