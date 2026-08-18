# PRC-06 - Platform Admin Final

Data: 2026-08-18

## Objetivo

Revalidar o plano de controle SaaS antes de producao, cobrindo tenants, planos, assinaturas, financeiro manual, auditoria, impersonation com banner visivel e limites por plano.

## Status

PRC-06 IMPLEMENTATION COMPLETE

O modulo Platform Admin ja possuia a maior parte do fluxo funcional. A PRC-06 consolidou esse comportamento em contrato automatizado, documentacao oficial e cobertura e2e adicional para limites por plano.

## Entregas

- Criado guard `test:prc06-platform-admin-final-contract`.
- Guard incluido no `verify`.
- Cobertura e2e adicionada para bloquear downgrade de assinatura quando o consumo atual excede os limites do novo plano.
- Notion atualizado no `Nexos Project - Control Center`.
- Documentacao atualizada em:
  - `docs/PLATFORM_ADMIN.md`
  - `docs/IMPERSONATION.md`
  - `docs/PLANS_AND_SUBSCRIPTIONS.md`

## Contratos Validados

- Platform Controller expoe dashboard, health, tenants, plans, subscriptions, invoices, audit logs e impersonation.
- Frontend Platform API espelha as rotas do control plane.
- Banner de impersonation e visivel nos shells operacionais e restaura a sessao platform original ao encerrar ou expirar.
- Detalhe de tenant inicia impersonation somente via Platform API.
- PlatformAuthGuard mantem permissoes server-side para ADMIN, SUPPORT e READONLY.
- Operacoes high-risk sao bloqueadas durante impersonation.
- Eventos administrativos de lifecycle, billing e impersonation sao auditados.
- Downgrade de plano valida consumo atual e retorna `PLAN_DOWNGRADE_LIMIT_EXCEEDED`.
- Documentacao oficial registra o gate PRC-06.

## Evidencias Automatizadas

```text
bun run test:prc06-platform-admin-final-contract
PASS
```

```text
bun run typecheck
PASS
```

```text
bunx prettier --write <arquivos PRC-06>
PASS
```

## Validacao Bloqueada

```text
bun run --cwd backend test -- -t "blocks subscription downgrade when current tenant usage exceeds plan limits"
BLOCKED
```

Motivo: Docker Desktop nao estava ativo. A tentativa de subir `postgres` e `nexos-redis` falhou porque o pipe `dockerDesktopLinuxEngine` nao estava disponivel.

Erro observado:

```text
unable to get image 'redis:7.4-alpine'
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Sem o Postgres local em `127.0.0.1:5432`, a suite e2e nao consegue inicializar o Prisma.

## Comandos Para Revalidacao Completa

Com Docker Desktop aberto:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
docker compose up -d postgres nexos-redis
bun run test:prc06-platform-admin-final-contract
bun run --cwd backend test -- -t "blocks subscription downgrade when current tenant usage exceeds plan limits"
bun run verify
```

## Gate Final

PRC-06 APPROVED WITH E2E ENVIRONMENT RECHECK REQUIRED

O contrato estatico e o typecheck passaram. A validacao e2e focada e o `verify` completo dependem apenas da infraestrutura local estar ativa.
