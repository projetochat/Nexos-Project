# Impersonation

Impersonacao e uma sessao platform temporaria, auditada e explicita.

## Regras

- Permitida para `ADMIN` e `SUPPORT` com permissao `platform.impersonation.start`.
- Exige `tenantId`, `membershipId` e motivo.
- TTL definido por `NEXOS_IMPERSONATION_TTL_MINUTES`, com fallback local de 15 minutos.
- O ator real permanece como `actorUserId`.
- A sessao grava `impersonation.started` e `impersonation.stopped`.

## UI

O store de sessao preserva suporte a banner de impersonacao. A tela `/admin/suporte` nao inicia impersonacao local-only; fluxos devem usar `/api/platform/impersonation/start`.

## Alto Risco

Operacoes de alto risco, como alteracao de plano, suspensao, billing e termination, devem ocorrer fora de sessao impersonada.

