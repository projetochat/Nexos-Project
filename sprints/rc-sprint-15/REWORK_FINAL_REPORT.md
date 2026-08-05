# RC Sprint 15 - Rework Final Report

## Status

Rework tecnico implementado e validado por testes automatizados. Homologacao fisica ainda pendente.

## Root Cause

- Historico usava consulta ampla por periodo e status dinamico.
- Dashboard e Relatorios tinham fontes de agregacao duplicadas.
- Lead ativo nao excluia explicitamente conversa encerrada.
- Encerramento registrava evento de sistema alterando `lastMessageAt`.
- Residuos operacionais nao tinham rotina administrativa dedicada.

## Correcoes

- `OperationsMetricsService` centraliza KPIs e graficos.
- Historico oficial filtra apenas `FECHADA + closedAt`.
- Relatorios invalidam por realtime, sem polling.
- Exportacao usa o mesmo resultado do relatorio.
- Encerramento preserva `lastMessageAt`.
- `cleanup:operations` audita orfaos, departamento `Teste`, conexoes arquivadas e inconsistencias de fechamento.

## Testes

- Verify inicial em `nexos_0801`: PASS duas vezes.
- Backend build: PASS.
- Backend test: PASS, 161 testes.
- Frontend typecheck: PASS.
- Operational runtime frontend: PASS, 5 testes.
- Cleanup dry-run em `acme`: PASS.

## Homologacao Fisica

Pendente. Nao foi executado o fluxo real WhatsApp -> Lead -> Inbox -> Encerramento -> Dashboard/Fila/Historico/Relatorios.

## Regressoes

Regressoes automatizadas de backend, frontend typecheck e runtime operacional passaram. Regressao fisica ainda pendente.

## Metricas

- M244 History Runtime: PASS tecnico, fisico pendente.
- M245 Dashboard Runtime: PASS tecnico, fisico pendente.
- M246 Reports Runtime: PASS tecnico, fisico pendente.
- M247 Metrics Consistency: PASS tecnico via `OperationsMetricsService`.
- M248 Department Cleanup: PASS dry-run em `acme`.
- M249 Seed Cleanup: PASS por auditoria, seed nao cria `Teste`.
- M250 Realtime Validation: PASS tecnico em relatorios/historico/dashboard/filas por invalidacao.
- M251 Physical Validation: PENDING.
- M252 Regression: PASS automatizado.
- M253 Commit: nenhum commit criado.
- M254 Git Clean: FAIL, worktree permanece suja.

## Arquivos

- `backend/src/operations/operations-metrics.service.ts`
- `backend/src/operations/operations.service.ts`
- `backend/src/conversations/messages.service.ts`
- `backend/scripts/cleanup-operational-residue.mjs`
- `src/routes/historico.tsx`
- `src/routes/relatorios.tsx`
- `src/lib/operational-runtime-rules.test.ts`

## Commits

Nenhum commit criado nesta sessao.

## Git Status

Worktree permanece suja, incluindo mudancas pre-existentes preservadas fora do escopo.

## Gate

REWORK REQUIRED
