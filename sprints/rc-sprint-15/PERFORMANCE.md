# RC Sprint 15 - Performance

## Medidas implementadas

- Historico usa paginacao server-side (`page`, `pageSize`, limite maximo 100).
- Dashboard busca snapshot, graficos e recentes em paralelo.
- Filas agregam por departamento ativo e nao materializam listas completas no frontend.
- Relatorios limitam detalhamento inicial e exportam dataset filtrado.

## Riscos conhecidos

- `OperationsService.chartData` ainda busca dimensoes auxiliares em memoria para rotular agregacoes.
- Export suporta CSV, Excel compativel (`.xls` HTML table) e PDF basico pelo backend.
- Medicao de tempo medio depende de conversas fechadas com `closedAt` e mensagens outbound no periodo.

## Proxima medicao fisica

Medir em homologacao com base real:

- tempo de resposta de `/api/operations/dashboard`;
- tempo de resposta de `/api/operations/history/conversations?page=1&pageSize=25`;
- tempo de exportacao CSV com volume real;
- FPS/tempo de render das rotas `/`, `/historico`, `/relatorios` e `/filas`.
