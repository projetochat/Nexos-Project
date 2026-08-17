# Automated Tests

Baseline:
- `bun run verify`: PASS on `nexos_0801`.

Focused tests:
- `evolution-outbound-payload.factory.spec.ts`
- `evolution.client.spec.ts`
- `evolution-messaging.provider.spec.ts`
- `evolution-provider-error.classifier.spec.ts`
- `messaging-outbound.service.spec.ts`
- `messaging-outbound.worker.spec.ts`
- Result: 6 files, 32 tests PASS.

Backend full:
- `bun run --cwd backend build`: PASS.
- `bun run --cwd backend test`: PASS, 26 files, 176 tests.

Verify final:
- `bun run verify`: PASS.
- Frontend typecheck: PASS.
- ESLint baseline: PASS, `917 errors and 12 warnings within legacy baseline`.
- Frontend build: PASS.
- Backend build: PASS.
- Backend tests: PASS, 26 files, 176 tests.
- Redis queue smoke: PASS.
- Security XSS: PASS, 1 file, 3 tests.
