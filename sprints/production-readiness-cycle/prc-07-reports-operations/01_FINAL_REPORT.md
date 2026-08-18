# PRC-07 - Reports & Operations

Data: 2026-08-18

## Objetivo

Aprovar dashboards, historico, relatorios e export operacional antes do deploy controlado.

## Escopo Oficial

- indicadores;
- filtros;
- consistencia com mensagens reais;
- CSV/XLSX/PDF;
- filas e SLA.

## Status

PRC-07 IMPLEMENTATION COMPLETE

O modulo Reports & Operations ja possuia endpoints, telas e cobertura e2e ampla. A PRC-07 consolidou o contrato em guard dedicado, documentacao oficial e corrigiu o export XLSX para gerar arquivo `.xlsx` real em vez de HTML com extensao `.xls`.

## Entregas

- Criado guard `test:prc07-reports-operations-contract`.
- Guard incluido no `verify`.
- Export `xlsx` ajustado para `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` e filename `nexos-atendimento.xlsx`.
- Teste e2e operacional ampliado para validar CSV, XLSX e PDF.
- Documentacao `docs/OPERATIONS.md` atualizada com o gate PRC-07.
- Notion atualizado no `Nexos Project - Control Center`.

## Contratos Validados

- Dashboard operacional usa `OperationsMetricsService`.
- Historico lista apenas conversas encerradas no fluxo de historico.
- Timeline combina conversa, lead, mensagens, tickets e encerramento.
- Relatorios usam dados reais via Prisma, sem store mock.
- Export suporta `csv`, `xlsx` e `pdf`.
- Filas calculam leads, conversas ativas, conversas encerradas, capacidade, transferencias, tempo medio e SLA por departamento.
- Telas operacionais invalidam consultas em eventos realtime de mensagem, conversa e lead.

## Evidencias Automatizadas

```text
bun run test:prc07-reports-operations-contract
PASS
```

```text
bun run test:operational-runtime
PASS - 5 tests
```

```text
bun run typecheck
PASS
```

```text
bun run backend:build
PASS
```

```text
bun run build
PASS
```

## Validacao Bloqueada

```text
bun run --cwd backend test -- -t "serves operational dashboard, history, timeline, queues and report exports from Prisma data"
BLOCKED
```

Motivo: Docker Desktop nao estava ativo. A consulta `docker compose ps postgres nexos-redis` falhou porque o pipe `dockerDesktopLinuxEngine` nao estava disponivel.

Sem Postgres e Redis locais ativos, a suite e2e com Prisma nao pode ser executada de forma confiavel.

## Comandos Para Revalidacao Completa

Com Docker Desktop aberto:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
docker compose up -d postgres nexos-redis
bun run test:prc07-reports-operations-contract
bun run --cwd backend test -- -t "serves operational dashboard, history, timeline, queues and report exports from Prisma data"
bun run verify
```

## Gate Final

PRC-07 APPROVED WITH E2E ENVIRONMENT RECHECK REQUIRED

Os contratos estaticos, typecheck, backend build, frontend build e runtime operacional passaram. A revalidacao e2e focada e o `verify` completo dependem apenas da infraestrutura local estar ativa.
