# Operations

## Messaging outbound worker

Hotfix scope: RC Sprint 15.2 outbound dispatcher resilience.

Queue:
- `messaging-outbound`

Expected runtime behavior:
- A queued outbound message is processed through the transactional outbox and BullMQ worker.
- Provider requests are logged with tenant, conversation, message, connection, provider, endpoint, method and attempt.
- Secrets and tokens are masked before logs or persisted diagnostics.
- Retryable Evolution/network failures keep the job retryable.
- Permanent provider failures are converted to `UnrecoverableError` and the related outbox event is marked `FAILED`.
- Per-conversation locking serializes sends without creating orphan rejected promises.

Operational checks:
- Watch for `messaging.outbound.retry_scheduled` during provider outages.
- Watch for `messaging.outbound.worker_failed` only when attempts are exhausted or the error is permanent.
- Watch for `messaging.outbound.worker_error`, `messaging.outbound.worker_stalled`, `messaging.outbound.worker_closing` and `messaging.outbound.worker_closed` during Redis or process incidents.
- Unknown outcome failures (`unknownOutcome=true`) require provider-side reconciliation before manually replaying messages.

Required physical validation before approval:
- Stop Evolution while sending outbound text and media.
- Confirm the backend process stays alive.
- Confirm jobs retry instead of duplicating messages.
- Restart Evolution and confirm pending jobs recover.
- Confirm inbound webhooks continue after outage recovery.
- Confirm no duplicate WhatsApp messages and no duplicate Nexos messages.

Gate:
- `OUTBOUND DISPATCHER HOTFIX REQUIRED` until physical evidence is attached.

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
