# RC Sprint 15 - Atendimento Operacional

## Status

PARTIAL PASS. A consolidacao tecnica foi implementada e testada, mas a RC nao declara piloto fisico
nem READY de producao sem homologacao operacional real.

## Entregue

- Criado `OperationsModule` no backend NestJS.
- Adicionados endpoints de dashboard, historico, timeline, relatorios e filas.
- Migradas as telas `/`, `/historico`, `/relatorios` e `/filas` para `operationsApi`.
- Removidos rota, menu e servico de simulador de conversa.
- `ReportFiltersBar` passou a usar Nexos API para clientes e departamentos.
- Dashboard/historico/relatorios/filas nao importam `@/lib/mvp` nem Supabase direto.

## Causa de risco tratada

As superficies operacionais ainda usavam agregacoes e mutacoes locais/Supabase legado em pontos criticos,
especialmente dashboard, historico e relatorios. Isso permitia divergencia entre a operacao real do backend
e o que o usuario via na UI.

## Evidencia automatizada

- `bun run --cwd backend build`: PASS.
- `bun run --cwd backend test`: PASS, 161 testes.
- `bun run typecheck`: PASS.
- `bun run verify`: PASS em duas execucoes consecutivas.

Foi necessario aplicar migrations existentes no banco de teste `nexos_1200` com `prisma migrate deploy`,
sem reset, porque a tabela `impersonation_sessions` ainda nao existia nessa base.
O `scripts/verify.mjs` tambem foi alinhado para usar `nexos_1200` como banco padrao de verificacao quando
`NEXOS_TEST_DATABASE_URL` nao estiver definido, mantendo a suite isolada do banco local de desenvolvimento.

## Gate fisico

Nao declarado READY. Falta homologacao fisica completa do ciclo: WhatsApp real -> lead -> fila -> agente
-> atendimento -> encerramento -> historico/relatorio sem F5 e sem duplicidade.

## Rework 2026-08-05

- Corrigido Historico para somente `FECHADA + closedAt`.
- Criado `OperationsMetricsService` como fonte unica de Dashboard e Relatorios.
- Corrigido encerramento para preservar `lastMessageAt`.
- Removido polling de Relatorios; atualizacao por realtime.
- Criada rotina `cleanup:operations` para residuos operacionais e departamento `Teste`.
- Resultado formal pos-rework tecnico: `REWORK REQUIRED` ate homologacao fisica.
