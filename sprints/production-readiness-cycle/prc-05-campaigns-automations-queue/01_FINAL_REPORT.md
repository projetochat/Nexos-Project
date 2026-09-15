# PRC-05 - Campaigns, Automations & Queue

Status: COMPLETE

Data: 2026-08-17

## Objetivo

Aprovar o contrato tecnico de campanhas, automacoes e filas com Redis/BullMQ, cobrindo audiencia,
preview, agendamento, cancelamento, retry, limites de plano e logs operacionais.

## Escopo Executado

- Tela `/automacoes` passou a expor os tres tipos suportados pelo backend:
  - `BOT_REPLY`
  - `ASSIGN_DEPARTMENT`
  - `NOTIFY_TEAM`
- UI de automacoes agora carrega departamentos ativos para regras de atribuicao.
- UI de automacoes passou a permitir arquivamento operacional de regras.
- E2E backend de Automations criado para validar:
  - criacao dos tres tipos de regra;
  - obrigatoriedade de `responseText` em `BOT_REPLY`;
  - normalizacao de `matchText`;
  - atribuicao de departamento tenant-scoped;
  - tenant isolation;
  - permissao de leitura vs gerenciamento;
  - desativacao e arquivamento.
- Gate PRC-05 criado:
  - `test:prc05-campaign-automation-queue-contract`.
- Gate PRC-05 integrado ao `bun run verify`.
- Documentacao criada/atualizada:
  - `docs/AUTOMATIONS.md`
  - `docs/CAMPAIGNS.md`
  - `docs/OPERATIONS.md`

## Arquivos Alterados

- `backend/test/app.e2e-spec.ts`
- `docs/AUTOMATIONS.md`
- `docs/CAMPAIGNS.md`
- `docs/OPERATIONS.md`
- `package.json`
- `scripts/check-prc05-campaign-automation-queue-contract.mjs`
- `scripts/verify.mjs`
- `src/routes/automacoes.tsx`

## Validacao

```text
bun run test:prc05-campaign-automation-queue-contract
PASS

bun run --cwd backend test -- -t "manages automation rules with action types, permissions and tenant scope"
PASS

bun run --cwd backend test -- -t "creates campaigns, previews audience, snapshots recipients and blocks duplicate starts"
PASS

bun run typecheck
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
prc05:campaign-automation-queue-contract PASS
operational:runtime PASS
backend:build PASS
backend:test PASS - 27 arquivos, 190 testes
redis:queue-smoke PASS
security:xss PASS
```

## Gate Final

```text
PRC-05 CAMPAIGNS, AUTOMATIONS & QUEUE COMPLETE
CAMPAIGN/AUTOMATION/QUEUE CONTRACT APPROVED
AUTOMATED GATES PASSING
READY FOR PRC-06 PLATFORM ADMIN FINAL
```

## Observacao

A PRC-05 aprova o contrato tecnico automatizado. Homologacao fisica de disparo real com Evolution/WhatsApp
continua recomendada antes de liberar campanhas para usuarios externos em producao.
