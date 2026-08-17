# Database Forensics

## Counts

Observed through generated Prisma client against active environment:

- messaging connections: 4
- conversations: 359
- messages: 705
- outbox events: 21

## Migration Drift

`prisma migrate status` reported:

- local migration not applied: `20260806120000_messaging_core_completion`
- database migration not present locally: `20260730132000_redis_bullmq_outbox`

## Column Drift

Database `nexos`:

- has 705 messages
- missing new fields such as `providerChatId`, `providerParticipantId`, `quotedProviderMessageId`, `mediaStorageKey`, `mediaChecksum`

Database `nexos_0802`:

- contains the sampled new message core columns

## Root Cause Candidate

Runtime and diagnostics are not pinned to one database. This can produce:

- green health checks
- green builds
- runtime query failures
- inconsistent homologation evidence

MRC-02 must reconcile migrations before any messaging correction.
