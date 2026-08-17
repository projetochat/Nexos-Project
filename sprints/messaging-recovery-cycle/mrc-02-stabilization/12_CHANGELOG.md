# MRC-02 Changelog

## Runtime

- `.env` now points local runtime to `nexos_0802`.
- Added safe homologation queue cleanup script.
- Applied migrations to `nexos_0802` and `nexos_1200`.

## Schema

- Added `MessageMediaState`.
- Added `Message.mediaState`.
- Backfilled existing media rows to `READY`, `FAILED` or `PENDING`.

## Messaging

- Added inbound reaction translation.
- Added inbound reaction persistence and realtime publishing.
- Preserved Evolution v2.3.7 outbound payload normalization.
- Preserved worker resilience behavior.

## Tests

- Added reaction service tests.
- Extended webhook translator reaction tests.
- Full `bun run verify` passes.
