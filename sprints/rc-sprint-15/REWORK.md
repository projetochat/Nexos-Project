# RC Sprint 15 - Rework Operational Runtime

## Status

REWORK TECNICO IMPLEMENTADO. Homologacao fisica ainda pendente, portanto a RC Sprint 15 nao esta
APPROVED nem READY FOR RC SPRINT 16.

## Correcoes

- Historico passou a consultar somente conversas `FECHADA` com `closedAt` preenchido.
- `OperationsMetricsService` virou a fonte unica de snapshot e graficos para Dashboard e Relatorios.
- Relatorios removeram polling e passaram a invalidar por realtime.
- Exportacao continua derivada do mesmo payload de relatorio exibido na tela.
- Encerramento de conversa preserva `lastMessageAt` e registra mensagem de sistema sem alterar a ultima mensagem operacional.
- Lead ativo exclui leads vinculados a conversa fechada com `closedAt`.
- Criada rotina `backend/scripts/cleanup-operational-residue.mjs` para auditar/higienizar residuos operacionais.

## Evidencias

- Pre-flight branch: `rc/15-operational-attendance`.
- SHA inicial: `2a39b7a511b5a12de875c063e641a925c8e88a38`.
- Verify inicial em `nexos_0801`: PASS duas vezes.
- `bun run --cwd backend build`: PASS.
- `bun run --cwd backend test`: PASS, 161 testes.
- `bun run typecheck`: PASS.
- `bun run test:operational-runtime`: PASS, 5 testes.
- Cleanup dry-run em tenant `acme`: zero Departamento `Teste`, zero inconsistencia `FECHADA/closedAt`, zero orfaos detectados.

## Gate

REWORK REQUIRED ate a homologacao fisica validar Historico, Dashboard, Relatorios e Fila sem F5,
sem duplicidade e sem lead/departamento fantasma.
