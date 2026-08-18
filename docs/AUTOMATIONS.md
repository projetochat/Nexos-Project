# Automations

## Escopo

Automacoes operacionais usam somente Nexos API e Prisma. A rota `/automacoes` nao usa Supabase, MVP
store, mocks locais ou execucao artificial no frontend.

## Tipos de regra

- `BOT_REPLY`: resposta automatica quando `matchText` combina com a mensagem.
- `ASSIGN_DEPARTMENT`: direcionamento para departamento ativo do tenant.
- `NOTIFY_TEAM`: notificacao operacional para equipe.

## Contrato

- `GET /api/automations`: lista regras tenant-scoped.
- `POST /api/automations`: cria regra.
- `PATCH /api/automations/:id`: atualiza regra, status, acao ou departamento.
- `DELETE /api/automations/:id`: arquiva regra e define status `DISABLED`.

## Regras

- `BOT_REPLY` exige `responseText`.
- `ASSIGN_DEPARTMENT` deve apontar para departamento ativo do mesmo tenant.
- `matchText` e normalizado em lowercase no backend.
- Agentes podem ler automacoes; somente perfis com `automations.manage` podem criar, alterar ou
  arquivar.
- Regras arquivadas nao aparecem na listagem operacional.

## PRC-05

Validar automacoes junto ao ciclo de campanhas e filas:

- criacao dos tres tipos de regra;
- permissao de leitura vs gerenciamento;
- tenant isolation;
- arquivamento sem hard delete operacional;
- logs operacionais sem secrets;
- rollback por desativacao da regra.
