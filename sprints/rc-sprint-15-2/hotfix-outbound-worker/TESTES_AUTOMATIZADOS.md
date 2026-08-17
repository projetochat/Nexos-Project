# Testes Automatizados

Baseline antes do hotfix:
- `bun run verify`: PASS em `nexos_0801`.

Testes focados:
- `messaging-outbound.worker.spec.ts`
- `messaging-outbound.service.spec.ts`
- `evolution-provider-error.classifier.spec.ts`
- `evolution.client.spec.ts`
- Resultado: 4 arquivos, 22 testes PASS.

Backend completo:
- `bun run --cwd backend build`: PASS.
- `bun run --cwd backend test`: PASS, 25 arquivos, 167 testes.

Verify final apos hotfix:
- `bun run verify`: PASS.
- Frontend typecheck: PASS.
- ESLint baseline: PASS, `917 errors and 12 warnings within legacy baseline`.
- Frontend build: PASS.
- Backend build: PASS.
- Backend test: PASS, 25 arquivos, 167 testes.
- Redis queue smoke: PASS.
- Security XSS: PASS, 1 arquivo, 3 testes.

Cobertura nova:
- HTTP 500 retryable.
- HTTP 401 permanente.
- HTTP 422 permanente.
- HTTP 429 retryable.
- ECONNREFUSED retryable.
- timeout/ECONNRESET como unknown outcome.
- redaction de segredos.
- regressao de unhandled rejection no worker lock.
