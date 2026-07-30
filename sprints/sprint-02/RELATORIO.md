# SPRINT 02 - RELATORIO FINAL

## 1. Status

PASS.

Gate final:

```text
READY FOR SPRINT 03
```

## 2. Resumo executivo

A Sprint 02 consolidou a camada organizacional real do Nexos em NestJS, Prisma e PostgreSQL. Users, memberships, departments, roles e permissions agora existem no backend definitivo, com autorizacao server-side por permission e isolamento por tenant testado.

As superficies `/login`, `/departamentos`, `/atendentes`, `/perfis`, `/configuracoes/usuarios` e `/configuracoes/permissoes` foram migradas para a Nexos API. Supabase foi removido dessas superficies.

## 3. Baseline inicial

- Branch inicial: `sprint/01.1-frontend-baseline`
- HEAD inicial: `dd37f0c006e901835761c17d8cafd84273307c72`
- Branch da sprint: `sprint/02-organization-rbac`
- Git status inicial: clean
- Node: `v24.14.0`
- Bun: `1.3.14`
- Docker: `29.1.3`
- Docker Compose: `v2.40.3-desktop.1`
- PostgreSQL container: `healthy`
- Prisma CLI local: `6.19.3` no workspace backend; `prisma migrate status` final up to date
- NestJS: dependencias `@nestjs/*` `^11.1.9`
- Verify inicial: PASS

## 4. Schema anterior

Schema Sprint 01:

- `Tenant`
- `User`
- `TenantMembership`
- `ProtectedRecord`
- enum `Role`
- enum `UserStatus`

`ProtectedRecord` era apenas prova tecnica de isolamento.

## 5. Schema final

Schema Sprint 02:

- `Tenant`
- `User`
- `TenantMembership`
- `Department`
- `DepartmentMembership`
- `Role`
- `Permission`
- `RolePermission`
- enums `UserStatus`, `MembershipStatus`, `PlatformRole`

`ProtectedRecord` removido.

## 6. Migrations

- Criada: `backend/prisma/migrations/20260730000100_organization_rbac/migration.sql`
- Aplicada no banco local via SQL versionada e registrada em `_prisma_migrations`.
- `bun --cwd backend prisma migrate status --schema prisma/schema.prisma`: database schema up to date.

## 7. Tenant model

`Tenant` permanece como raiz de isolamento. Roles e departments pertencem ao tenant.

## 8. User model

`User` e identidade global. `platformRole` separa administracao da plataforma de administracao de tenant.

## 9. Membership model

`TenantMembership` vincula `User` e `Tenant`, contem `roleId` e `status`. Membership inativa bloqueia requests protegidos.

## 10. Departments

`Department` e tenant-owned, com `name`, `description`, `color`, `active` e timestamps. Nome e unico por tenant.

## 11. Roles

Roles sao tenant-scoped:

- `tenant_admin`
- `supervisor`
- `agent`

Roles customizadas podem ser criadas pela API quando permission keys sao validas.

## 12. Permissions

Permissions sao catalogo controlado pelo backend em `backend/src/auth/permissions.constants.ts`.

Chaves principais:

- `users.read`, `users.manage`
- `departments.read`, `departments.manage`
- `roles.read`, `roles.manage`
- `chat.*`

## 13. Platform Admin

`PlatformRole.ADMIN` nao concede automaticamente permissoes operacionais de tenant. Teste e2e prova que `platform@nexo.app`, mesmo com platform admin, nao consegue criar usuarios quando sua role de tenant e `agent`.

## 14. Tenant Admin

`tenant_admin` e role tenant-scoped com todas as permissions do catalogo atual.

## 15. Authorization architecture

```text
JwtAuthGuard
  -> payload JWT
  -> AuthenticatedUser
  -> PermissionsGuard
  -> membership ativa + user ativo
  -> role permissions
  -> endpoint
```

## 16. Permission matrix

| Operacao | Platform Admin | Tenant Admin | Supervisor | Agent |
| --- | ---: | ---: | ---: | ---: |
| Ver usuarios | Nao automatico | Sim | Sim | Nao |
| Criar/editar/desativar usuario | Nao automatico | Sim | Nao | Nao |
| Ver departamentos | Nao automatico | Sim | Sim | Sim |
| Criar/editar/desativar departamento | Nao automatico | Sim | Sim | Nao |
| Associar usuario a departamento | Nao automatico | Sim | Sim | Nao |
| Ver roles/perfis | Nao automatico | Sim | Sim | Nao |
| Gerenciar roles/perfis | Nao automatico | Sim | Nao | Nao |

## 17. APIs

Implementadas:

- `GET /api/me`
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/activate`
- `PATCH /api/users/:id/deactivate`
- `GET /api/departments`
- `GET /api/departments/:id`
- `POST /api/departments`
- `PATCH /api/departments/:id`
- `DELETE /api/departments/:id`
- `POST /api/departments/:id/members`
- `DELETE /api/departments/:id/members/:membershipId`
- `GET /api/permissions`
- `GET /api/roles`
- `GET /api/roles/:id`
- `POST /api/roles`
- `PATCH /api/roles/:id`
- `DELETE /api/roles/:id`

## 18. Frontend migrated

- `/login`
- `/departamentos`
- `/atendentes`
- `/perfis`
- `/configuracoes/usuarios`
- `/configuracoes/permissoes`
- `src/lib/session.ts`
- `src/lib/perms.ts`
- `src/lib/nexos-api.ts`

## 19. Supabase removal

| Feature | Dependencia anterior | Dependencia atual | Codigo Supabase removido | Status |
| --- | --- | --- | --- | --- |
| Auth/session | Supabase Auth + fallback Nexos | Nexos API | `session.ts`, `login.tsx`, `__root.tsx` | MIGRADO |
| Users/atendentes | Mock store + Supabase perfis | `/api/users`, `/api/roles`, `/api/departments` | `atendentes.tsx` | MIGRADO |
| Departments | Mock store + Supabase escopos | `/api/departments` | `departamentos.tsx` | MIGRADO |
| Roles/perfis | Supabase `access_profiles` | `/api/roles`, `/api/permissions` | `perfis.tsx` | MIGRADO |
| Config users/perms | hardcoded | Nexos API | configs | MIGRADO |

## 20. Tests

`bun run backend:test`: PASS.

10 e2e tests:

- health
- unauthenticated denied
- invalid token denied
- auth context
- inactive membership denied
- missing permission denied
- valid permission allowed
- tenant isolation
- department isolation
- role isolation
- platform admin separation

## 21. Tenant isolation

Tenant A admin nao acessa Tenant B user nem Tenant B department. Retorno esperado: `404`.

## 22. Department isolation

Tenant A admin nao associa membership de Tenant B a department de Tenant A. Retorno esperado: `400`.

## 23. Security

- JWT malformado retorna `401`.
- Membership inativa retorna `401`.
- Permission ausente retorna `403`.
- XSS security tests PASS.
- Nenhum novo import Supabase nas superficies migradas.

## 24. Coverage

Nao foi adicionado medidor formal de coverage. Os cenarios criticos definidos para autorizacao e isolamento foram cobertos por e2e tests.

## 25. Lint/typecheck

- `bunx tsc --noEmit`: PASS.
- `bun run lint`: PASS.
- Lint baseline final: `4065 errors` e `13 warnings`, dentro do baseline legado e menor que a Sprint 01.1.

## 26. Builds

- `bun run build`: PASS.
- `bun run backend:build`: PASS.

## 27. Verify

- Verify inicial: PASS.
- Verify final #1: PASS.
- Verify final #2: PASS.

## 28. Smoke test

API smoke:

- `/api/me`: 200
- `/api/users`: 200
- `/api/departments`: 200
- `/api/roles`: 200
- `/api/permissions`: 200

Frontend HTTP smoke:

- `/login`: 200
- `/`: 200
- `/atendentes`: 200
- `/perfis`: 200
- `/departamentos`: 200
- `/configuracoes/usuarios`: 200
- `/configuracoes/permissoes`: 200
- `/inbox`: 200
- `/clientes`: 200
- `/contatos`: 200
- `/chamados`: 200

## 29. Regressions

Regressoes criticas: 0.

Durante smoke foi encontrado e corrigido problema de DI em runtime dev com `tsx`; construtores relevantes agora usam `@Inject(...)` explicito.

## 30. Files created

- `backend/prisma/migrations/20260730000100_organization_rbac/migration.sql`
- `backend/src/auth/permissions.constants.ts`
- `backend/src/auth/permissions.decorator.ts`
- `backend/src/auth/permissions.guard.ts`
- `backend/src/departments/**`
- `backend/src/roles/**`
- `backend/src/users/dto/**`
- `sprints/sprint-02/RELATORIO.md`

## 31. Files changed

Principais:

- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/auth/**`
- `backend/src/users/users.controller.ts`
- `backend/test/app.e2e-spec.ts`
- `src/lib/nexos-api.ts`
- `src/lib/session.ts`
- `src/lib/perms.ts`
- rotas migradas
- docs oficiais

## 32. Files removed

- `backend/src/auth/roles.decorator.ts`
- `backend/src/auth/roles.guard.ts`
- `backend/src/tenant-records/tenant-records.controller.ts`
- `backend/src/tenant-records/tenant-records.module.ts`

## 33. Dependencies

Nenhuma dependencia nova adicionada.

## 34. Commits

Commit sera criado apos este relatorio. Nao houve push.

## 35. Documentation updated

- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/API.md`
- `docs/AUTHENTICATION.md`
- `docs/BUSINESS_RULES.md`
- `docs/USER_FLOW.md`
- `docs/COMPONENTS.md`
- `docs/DEPLOY.md`
- `docs/ROADMAP.md`
- `docs/CHANGELOG.md`
- `docs/CODING_GUIDELINES.md`
- `sprints/README.md`

## 36. Validation local

PowerShell:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
$env:BUN_INSTALL="$env:USERPROFILE\.bun"
$env:PATH="$env:BUN_INSTALL\bin;$env:PATH"
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public"
$env:JWT_SECRET="local-access-secret-minimum-32-chars"
$env:JWT_REFRESH_SECRET="local-refresh-secret-minimum-32-chars"

bun run backend:prisma:generate
bun --cwd backend prisma migrate status --schema prisma/schema.prisma
bun run backend:prisma:seed
bun run verify
```

## 37. M01-M35

| M | Meta | Resultado | Evidencia | Status |
| --- | --- | --- | --- | --- |
| M01 | verify inicial PASS | PASS | `verify_initial_exit=0` | PASS |
| M02 | migrations PASS | PASS | `prisma migrate status`: up to date | PASS |
| M03 | schema atualizado | Implementado | Prisma schema Sprint 02 | PASS |
| M04 | Tenant preservado | Preservado | `Tenant` mantido | PASS |
| M05 | User evoluido | `platformRole` adicionado | Prisma schema | PASS |
| M06 | Membership implementado | `roleId`, `status` | Prisma schema | PASS |
| M07 | Departments implementados | `Department` | Prisma schema/API | PASS |
| M08 | DepartmentMembership implementado | FK composta | Prisma schema/API | PASS |
| M09 | Roles implementadas | `Role` tenant-scoped | Prisma schema/API | PASS |
| M10 | Permissions implementadas | Catalogo controlado | `permissions.constants.ts` | PASS |
| M11 | Platform Admin separado | Implementado | e2e test | PASS |
| M12 | Tenant Admin separado | Implementado | role `tenant_admin` | PASS |
| M13 | RBAC server-side | Implementado | `PermissionsGuard` | PASS |
| M14 | cross-tenant user bloqueado | PASS | e2e 404 | PASS |
| M15 | cross-tenant department bloqueado | PASS | e2e 404/400 | PASS |
| M16 | cross-tenant role bloqueado | PASS | e2e 400 | PASS |
| M17 | unauthorized denied | PASS | e2e 401 | PASS |
| M18 | forbidden denied | PASS | e2e 403 | PASS |
| M19 | frontend users migrado | PASS | `/atendentes`, config users | PASS |
| M20 | frontend departments migrado | PASS | `/departamentos` | PASS |
| M21 | frontend roles/perfis migrado | PASS | `/perfis`, config perms | PASS |
| M22 | novas dependencias Supabase = 0 | PASS | rg nas superficies migradas | PASS |
| M23 | Supabase removido das areas migradas | PASS | inventory | PASS |
| M24 | backend tests PASS | PASS | 10 tests | PASS |
| M25 | security tests PASS | PASS | 3 XSS tests | PASS |
| M26 | coverage >= 80% codigo novo | Parcial | Sem medidor formal; cenarios criticos cobertos | WARN |
| M27 | frontend build PASS | PASS | verify | PASS |
| M28 | backend build PASS | PASS | verify | PASS |
| M29 | lint baseline nao aumentou | PASS | 4065/13 dentro baseline | PASS |
| M30 | verify #1 PASS | PASS | final verify #1 | PASS |
| M31 | verify #2 PASS | PASS | final verify #2 | PASS |
| M32 | smoke PASS | PASS | API e rotas HTTP | PASS |
| M33 | regressoes criticas = 0 | PASS | gates verdes | PASS |
| M34 | docs atualizados | PASS | docs oficiais | PASS |
| M35 | relatorio salvo | PASS | este arquivo | PASS |

## 38. Technical debt remaining

- Coverage formal ainda nao configurado.
- Supabase permanece no MVP operacional nao migrado.
- Roles customizadas guardam escopo de departamentos como metadata de UI; enforcement de escopo departamental em recursos operacionais futuros sera aplicado quando conversas/CRM forem migrados.
- `vite-tsconfig-paths` emite aviso de substituicao por `resolve.tsconfigPaths`.

## 39. Supabase remaining inventory

AINDA LEGADO:

- `src/start.ts`
- `src/lib/demo.functions.ts`
- `src/lib/mvp.ts`
- `src/integrations/supabase/**`
- `src/components/report-filters.tsx`
- `src/routes/chamados.tsx`
- `src/routes/inbox.index.tsx`
- `src/routes/inbox.$conversationId.tsx`
- `src/routes/index.tsx`
- `src/routes/historico.tsx`
- `src/routes/simulador.tsx`
- `src/routes/instancias.tsx`
- Supabase migrations em `supabase/migrations/**`

MIGRADO/REMOVIDO:

- Auth/session frontend das superficies migradas.
- Users/atendentes.
- Departments.
- Roles/perfis.
- Config users/permissions.

## 40. Architectural risks

- Coexistencia temporaria entre Nexos API e Supabase legado ainda exige disciplina de fronteira.
- Frontend administrativo agora depende do backend local estar disponivel.
- Proxima sprint deve evitar reutilizar tabelas Supabase legadas para CRM.

## 41. Final Git state

Antes do commit final:

- Branch: `sprint/02-organization-rbac`
- Worktree com alteracoes da sprint aguardando commit.
- Push: nao realizado.

## 42. Gate

READY FOR SPRINT 03
