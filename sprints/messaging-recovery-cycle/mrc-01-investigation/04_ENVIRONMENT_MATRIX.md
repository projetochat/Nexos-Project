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
- `TRIXUS_QUEUE_ENABLED=true`
- `TRIXUS_QUEUE_WORKER_ENABLED=true`
- `TRIXUS_OUTBOX_DISPATCHER_ENABLED=true`
- `TRIXUS_OUTBOUND_WORKER_CONCURRENCY=5`

## Examples

`.env.example` and `backend/.env.example` include defaults for database, Evolution, Redis, queue, realtime and message storage.

## Drift Risk

Prisma migrate status reported database `trixus`, while some historical sprint references and manual checks used `trixus_0802`.

This matters because:

- `trixus` has 705 messages but does not contain the newly expected messaging core columns.
- `trixus_0802` contains `providerChatId`, `providerParticipantId`, `quotedProviderMessageId`, `mediaStorageKey` and `mediaChecksum`.
- The same codebase can pass build/tests and still fail at runtime if the backend points to the database without the required migration.

MRC-02 must freeze the official homologation database before any correction.
