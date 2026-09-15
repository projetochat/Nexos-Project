# PRC-02 - Legacy Surface Cleanup

Data: 2026-08-17

## Status

PRC-02 COMPLETE

## Objetivo

Remover ou neutralizar superficies legadas que ainda permitiam navegacao por telas antigas, facade API obsoleta ou dependencia runtime de mock/Supabase legacy em areas operacionais.

## Escopo executado

- `/atendimento/clientes` convertido em redirect para `/clientes`.
- `/atendimento/historico` convertido em redirect para `/historico`.
- `/atendimento/favoritos` convertido em redirect para `/inbox`.
- `/atendimento/perfil` convertido em redirect para `/perfil`.
- `/empresas` convertido em redirect para `/clientes`.
- Navegacao principal operacional atualizada para usar apenas rotas canonicas.
- `src/lib/api/index.ts` removido.
- `src/routes/atendentes.tsx` deixou de depender de `@/lib/mock/types`.
- Gate automatizado `test:prc02-legacy-surface-runtime` criado.
- `bun run verify` atualizado para executar o gate da PRC-02.

## Decisoes

- A rota SaaS real de empresas permanece em `/admin/empresas`.
- A rota tenant `/empresas` foi redirecionada para `/clientes`, pois o cadastro operacional de empresas/clientes ja esta consolidado nessa superficie.
- `/atendimento/favoritos` foi redirecionada para `/inbox`, pois favoritos ainda nao existe como feature operacional aprovada.
- As rotas antigas foram mantidas apenas como compatibilidade de URL, sem UI propria e sem runtime mock.

## Validacao automatizada

```text
bun run test:prc02-legacy-surface-runtime
PASS

bun run verify
PASS
```

Resumo do `verify`:

- frontend typecheck: PASS
- frontend lint baseline: PASS
- frontend build: PASS
- legacy runtime gates: PASS
- backend build: PASS
- backend tests: PASS, 27 arquivos e 189 testes
- redis queue smoke: PASS
- security XSS: PASS

## Gate final

```text
PRC-02 LEGACY SURFACE CLEANUP COMPLETE
LEGACY MOCK RUNTIME BLOCKED
READY FOR PRC-03 CRM PRODUCTION READINESS
```

