# MRC-02 Test Plan

## Automated

- `bun run verify`
- targeted backend messaging tests
- payload factory tests for v2.3.7 fixtures
- webhook translator tests for real captured events
- storage authorization tests
- queue retry/idempotency tests
- frontend inbox tests for reply/media/audio/reaction/status

## Physical WhatsApp

For direct conversation:

- text
- reply
- image
- document PDF/DOC/XLS/TXT
- audio/voice
- reaction add/change/remove
- delivered/read receipts
- download/inline media

For group conversation:

- text
- reply
- image
- document
- audio/voice
- reaction add/change/remove
- participant metadata update

Resilience:

- backend restart
- Evolution restart
- Redis restart if safe
- worker retry
- duplicate webhook replay
- browser realtime reconnection

## Evidence Format

Each test must record:

- timestamp
- tenant
- conversation id
- connection id
- provider message id
- Evolution endpoint/event
- database row
- realtime event
- UI observation
- pass/fail
