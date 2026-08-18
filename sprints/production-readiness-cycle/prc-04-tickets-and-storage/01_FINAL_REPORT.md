# PRC-04 - Tickets & Storage

Status: COMPLETE

Data: 2026-08-17

## Objetivo

Aprovar Chamados/Tickets com anexos em storage privado para a base atual, removendo drift documental do contrato antigo e adicionando gate automatizado contra regressao.

## Escopo Executado

- Validado fluxo backend de tickets: abertura, comentario interno, status, tenant isolation, upload, preview inline, download e delete de anexos.
- Corrigido contrato documental de anexos: removido fluxo legado `init/complete`.
- Oficializado upload binario direto em `POST /api/tickets/:id/attachments`.
- Oficializado preview autenticado em `GET /api/tickets/:id/attachments/:attachmentId/inline`.
- Oficializado download autenticado em `GET /api/tickets/:id/attachments/:attachmentId/download`.
- Registrada decisao de storage PRC-04:
  - `local` aprovado para desenvolvimento, homologacao local e deploy single-host controlado.
  - `r2` permanece boundary reservado para ciclo de deploy; ainda nao e provider funcional de upload/download nesta base.
- Adicionado gate `test:prc04-ticket-storage-contract`.
- Integrado gate PRC-04 ao `bun run verify`.
- Ampliado e2e de Tickets para validar delete de anexo, remocao da listagem e bloqueio de download apos delete.

## Arquivos Alterados

- `backend/test/app.e2e-spec.ts`
- `docs/API.md`
- `docs/DEPLOY.md`
- `docs/STORAGE.md`
- `docs/TICKETING.md`
- `package.json`
- `scripts/check-prc04-ticket-storage-contract.mjs`
- `scripts/verify.mjs`

## Validacao

```text
bun run test:prc04-ticket-storage-contract
PASS

bun run --cwd backend test -- -t "manages tickets with sanitized content, comments, attachments and tenant isolation"
PASS

bun run verify
PASS
```

Resultado do verify:

```text
frontend:typecheck PASS
frontend:lint-baseline PASS
frontend:build PASS
inbox:legacy-runtime PASS
ticket:legacy-runtime PASS
campaign:legacy-runtime PASS
platform-admin:legacy-runtime PASS
prc02:legacy-surface-runtime PASS
prc04:ticket-storage-contract PASS
operational:runtime PASS
backend:build PASS
backend:test PASS - 27 arquivos, 189 testes
redis:queue-smoke PASS
security:xss PASS
```

## Gate Final

```text
PRC-04 TICKETS & STORAGE COMPLETE
TICKET STORAGE CONTRACT APPROVED FOR LOCAL PRIVATE STORAGE
R2/S3 PRODUCTION STORAGE REMAINS DEPLOY-CYCLE BLOCKER
READY FOR PRC-05
```
