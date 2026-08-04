# Tenant Lifecycle

## Status

- `PROVISIONING`
- `TRIAL`
- `ACTIVE`
- `PAST_DUE`
- `SUSPENDED`
- `TERMINATED`

Transicoes invalidas retornam `TENANT_STATUS_TRANSITION_INVALID`.

## Suspensao

Suspensao preserva dados, atualiza `authRevokedAt` e bloqueia sessoes existentes em guards operacionais.

Bloqueios server-side incluidos:

- login operacional
- refresh operacional
- criacao de usuarios
- criacao de departamentos
- criacao de connections
- criacao de contatos
- criacao/inicio/agendamento de campanhas
- criacao de tickets e upload de anexos conforme feature/limite

## Reativacao

Reativacao retorna o tenant para `ACTIVE`, preserva roles e dados e nao reconecta connections nem dispara campanhas antigas automaticamente.

## Termination

`TERMINATED` exige confirmacao por slug e motivo. A sprint nao executa hard delete.

