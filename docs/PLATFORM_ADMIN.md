# Platform Admin

Sprint 13 introduz um plano de controle separado do plano operacional.

## Identidade

- Usuarios com `User.platformRole = ADMIN`, `SUPPORT` ou `READONLY` acessam `/api/platform/*`.
- `tenant_admin` operacional nao ganha acesso platform por conhecer endpoints.
- Login platform pode ocorrer sem `TenantMembership` quando nenhum `tenantSlug` e informado.

## Permissoes

- `ADMIN`: leitura e escrita completa do plano de controle.
- `SUPPORT`: leitura, usage, audit e impersonacao controlada.
- `READONLY`: leitura de tenants, planos, assinaturas, usage, audit e health.

Todas as permissoes platform sao resolvidas no backend por `PlatformAuthGuard`.

## Auditoria

Eventos administrativos gravam `PlatformAuditLog` com ator real, role platform, alvo, tenant opcional e metadata sanitizada. Nao ha endpoint de remocao ou edicao.

## PRC-06 - Platform Admin Final

A PRC-06 revalida o plano de controle SaaS antes do piloto de producao. O contrato final cobre tenants, planos, assinaturas, financeiro manual, auditoria, impersonation com banner visivel e limites por plano.

Gate obrigatorio:

- Tenants: listagem, detalhe, criacao, suspensao, reativacao e encerramento sem hard delete.
- Planos: catalogo ativo/arquivado, detalhe e alteracoes auditadas.
- Assinaturas: criacao, troca, cancelamento e historico com snapshot de limites/features.
- Financeiro manual: faturas criadas e baixadas pela Platform API, sem gateway automatico.
- Auditoria: eventos administrativos sem senha, token ou segredo em metadata serializada.
- Impersonation: acesso temporario por `ADMIN`/`SUPPORT`, com banner visivel no shell operacional.
- Limites por plano: downgrade bloqueado quando o consumo atual excede o novo plano.

O guard `test:prc06-platform-admin-final-contract` deve passar junto ao `verify`.
