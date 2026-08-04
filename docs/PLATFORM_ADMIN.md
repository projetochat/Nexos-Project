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

