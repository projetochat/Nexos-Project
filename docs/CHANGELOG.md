# Changelog

## 2026-07-29 - Sprint 02 organization, users, departments & RBAC

- Criada migration Prisma da camada organizacional.
- Removido `ProtectedRecord` do dominio de producao.
- Implementados Departments, DepartmentMemberships, Roles, Permissions e RolePermissions.
- Evoluido User/TenantMembership com `platformRole`, `membershipStatus` e role tenant-scoped.
- Criado `@RequirePermissions` + `PermissionsGuard` para RBAC server-side.
- Implementadas APIs reais de users, departments, roles e permissions.
- Atualizado seed com Tenant A/B, roles, permissions, departamentos e usuarios demo.
- Migradas telas `/login`, `/departamentos`, `/atendentes`, `/perfis`, `/configuracoes/usuarios` e `/configuracoes/permissoes` para Nexos API.
- Removido Supabase Auth das superficies migradas.
- Adicionados testes e2e de auth denial, permission denial, tenant isolation, department isolation, role isolation e Platform Admin separado.

## 2026-07-29 - Sprint 01.1 frontend baseline

- Estabilizado build frontend TanStack/Lovable no Windows.
- Documentada causa raiz do manifest TanStack e do EPERM observado na Sprint 01.
- Criado `bun run verify` como gate unificado.
- Criada politica de lint baseline com `scripts/eslint-baseline.json`.
- Excluido Prisma Client gerado do escopo do ESLint.
- Corrigidos erros funcionais pequenos de lint sem alterar UX.
- Documentada decisao: NestJS Auth definitivo, Supabase Auth legado temporario.
- Executado smoke HTTP das rotas principais.

## 2026-07-29 - Sprint 01 foundation

- Inicializado Git e criado branch `sprint/01-foundation`.
- Instalado Bun e atualizadas dependencias via `bun.lock`.
- Criado backend NestJS em `backend/`.
- Criado `docker-compose.yml` com PostgreSQL local.
- Criado Prisma schema, migration inicial e seed multi-tenant.
- Implementados endpoints `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/me` e `/api/tenant-records/:id`.
- Adicionados testes e2e do backend e teste de sanitizacao XSS.
- Login frontend passa a tentar Nexos API antes do fallback Supabase.
- Removida chamada automatica de `ensureDemoUsers` no login e adicionada flag de seguranca.
- HTML de chamados passa por sanitizacao antes de persistir e ao reabrir edicao.

## 2026-07-29 - Sprint 00 baseline

- Executada auditoria estatica do frontend.
- Atualizada documentacao oficial com estado IMPLEMENTADO, SIMULADO, PLANEJADO e NAO IMPLEMENTADO.
- Adicionado roteiro de validacao local da Sprint 00 ao README.
- Registrados gaps frontend -> backend e divergencias MVP x arquitetura futura.
- Nenhuma alteracao funcional, dependencia ou lockfile foi realizada.

## 2026-07-29 - Documentacao consolidada

- Criada documentacao tecnica inicial no padrao oficial de `docs/`.
- Documentos numerados antigos foram substituidos por apontadores para evitar duplicidade.
