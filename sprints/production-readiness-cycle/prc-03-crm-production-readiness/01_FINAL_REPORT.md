# PRC-03 - CRM Production Readiness

Data: 2026-08-17

## Status

PRC-03 COMPLETE

## Objetivo

Elevar o modulo CRM para readiness tecnico de producao, cobrindo clientes, contatos, etiquetas, vinculos, filtros, busca, permissao por perfil e reflexos do cadastro no Inbox.

## Escopo executado

- Contatos agora podem ser filtrados por etiqueta no backend via `tagId`.
- Contrato frontend `crmApi.listContacts` passou a aceitar `tagId`.
- Tela `/contatos` recebeu filtro visual por etiqueta.
- Tela `/contatos` passou a exibir etiquetas diretamente na listagem.
- Teste e2e principal de CRM passou a criar contato com etiqueta e validar:
  - payload serializado com `tags`;
  - busca de contato;
  - filtro `linked`;
  - filtro `tagId`;
  - atualizacao;
  - desvinculo de cliente;
  - arquivamento;
  - restauracao por telefone duplicado arquivado.
- Suite e2e passou a forcar `SEED_MODE=test`, evitando contaminacao por ambiente de homologacao.
- `scripts/verify.mjs` e e2e passaram a usar `127.0.0.1` para Postgres local de teste, evitando instabilidade de resolucao `localhost` no Windows/Docker.

## Arquivos alterados

- `backend/src/crm/crm.controller.ts`
- `backend/src/crm/dto/list-contacts-query.dto.ts`
- `backend/test/app.e2e-spec.ts`
- `scripts/verify.mjs`
- `src/lib/nexos-api.ts`
- `src/routes/contatos.tsx`

## Decisoes

- O filtro por etiqueta foi implementado no endpoint oficial `/api/crm/contacts`, mantendo tenant scope e ignorando etiquetas arquivadas.
- A UI de contatos passou a mostrar etiquetas na listagem para reduzir dependencia de abrir modal apenas para conferir classificacao.
- A validacao fisica final do PO deve focar em uso real da tela: criar cliente, criar contato, vincular/desvincular, aplicar/remover etiquetas, filtrar por etiqueta, buscar por telefone/nome/cliente e conferir reflexo do contato no Inbox.

## Validacao automatizada

```text
bun run --cwd backend test -- -t "creates, searches, updates and archives CRM contacts"
PASS

bun run typecheck
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
PRC-03 CRM PRODUCTION READINESS COMPLETE
CRM AUTOMATED GATE APPROVED
READY FOR PRC-04 TICKETS & STORAGE
```

