# RC Sprint 15 - Auditoria

## Remocao de simulador

- `src/routes/simulador.tsx` removido.
- Entradas de navegacao desktop/mobile removidas de `AppShell`.
- `SIMULATOR` removido de `src/lib/mvp.ts`.
- Teste sentinela garante ausencia de rota/menu em runtime.

## Fontes operacionais

- Dashboard: `operationsApi.dashboard`.
- Historico: `operationsApi.history`, `operationsApi.timeline`, `messageApi.list`.
- Relatorios: `operationsApi.report`, `operationsApi.exportAttendance`.
- Filas: `operationsApi.queues`.

## Observabilidade

`OperationsService` registra eventos sanitizados:

- `operations.dashboard.query`;
- `operations.history.query`;
- `operations.report.query`.

Os logs nao incluem telefone completo, conteudo de mensagem ou payload completo.

## Gate

RC15 tecnica aprovada por testes automatizados. Gate fisico permanece aberto.
