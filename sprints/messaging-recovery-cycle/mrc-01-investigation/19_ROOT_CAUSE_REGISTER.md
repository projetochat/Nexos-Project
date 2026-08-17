# Root Cause Register

## RC-001 Database And Migration Drift

Evidence:

- Prisma reports local migration `20260806120000_messaging_core_completion` not applied to database `nexos`.
- Database has migration `20260730132000_redis_bullmq_outbox` not present locally.
- `nexos` lacks expected message core columns while `nexos_0802` has them.

Impact:

- Runtime failures can occur on message queries even when health/build/tests pass.

## RC-002 Evolution v2.3.7 Payload Contract Mismatch

Evidence:

- Historical failed shapes used nested text/reaction payloads.
- Current dirty tree changes payloads to root fields and multipart `file`.

Impact:

- Provider rejects outbound messages with `400`.

## RC-003 Queue Residue And Orphan Jobs

Evidence:

- `messaging-outbound` has 30 failed jobs.
- Sample failures include disconnected connection and missing message.

Impact:

- Retry/idempotency evidence is contaminated until failed residue is classified.

## RC-004 Incomplete Physical Evidence

Evidence:

- MRC-01 did not run full WhatsApp real matrix.

Impact:

- No final messaging approval can be declared.

## RC-005 Dirty Worktree Baseline Ambiguity

Evidence:

- Functional messaging changes already exist before MRC-01 and are uncommitted.

Impact:

- Investigation cannot cleanly distinguish baseline failure from correction candidate without branch hygiene.
