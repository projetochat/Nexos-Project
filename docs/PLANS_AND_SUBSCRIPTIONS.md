# Plans And Subscriptions

Sprint 13 adiciona catalogo de planos e assinaturas administrativas sem gateway de pagamento.

## Plan

Campos principais:

- `code`, `name`, `status`
- `billingPeriod`
- `features`
- `limits`
- `archivedAt`

Planos arquivados nao devem receber novas assinaturas.

## Limites

Os limites sao validados e normalizados no backend:

- `maxUsers`
- `maxDepartments`
- `maxConnections`
- `maxContacts`
- `maxCampaignRecipients`
- `maxStorageBytes`

Features server-side:

- `campaigns`
- `tickets`
- `multipleConnections`
- `storage`
- `realtime`

## Subscription

Cada assinatura guarda snapshot de `features` e `limits`. Mudancas futuras no catalogo nao alteram contratos existentes sem troca administrativa de assinatura.

Downgrade valida consumo atual e retorna `PLAN_DOWNGRADE_LIMIT_EXCEEDED` quando o tenant ja excede o novo plano. Dados existentes sao preservados.

## Faturas

Faturas sao manuais. Nao ha checkout, cartao, boleto automatico ou webhook financeiro nesta sprint.

## PRC-06 - Limites de Plano

A troca de assinatura deve consultar o consumo real antes de aplicar um plano menor. Se qualquer limite atual for excedido, a Platform API retorna `PLAN_DOWNGRADE_LIMIT_EXCEEDED` e preserva a assinatura existente.

Limites protegidos:

- Usuarios ativos.
- Departamentos.
- Connections.
- Contatos.
- Destinatarios de campanha no periodo.
- Storage.

Esse contrato e coberto por teste e2e e pelo guard `test:prc06-platform-admin-final-contract`.
