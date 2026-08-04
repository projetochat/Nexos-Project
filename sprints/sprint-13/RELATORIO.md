# SPRINT 13 - RELATORIO FINAL

## 1. Status

Status: NOT READY.

A Sprint 13 entregou o plano de controle SaaS inicial na Nexos API, com autenticacao server-side de platform roles, governanca de tenants, planos, assinaturas, faturas manuais, usage, entitlements, auditoria e remocao dos principais mocks de runtime em `/admin/*`.

O gate para Sprint 14 permanece bloqueado porque a homologacao fisica completa do Super Admin, tenant lifecycle, limites, impersonacao, realtime offline e Redis offline ainda nao foi executada nesta rodada.

## 2. Resumo executivo

- Platform Admin deixou de depender de autorizacao apenas visual e passou a usar `/api/platform/*` com JWT, role de plataforma e permissoes resolvidas no backend.
- Tenants receberam status operacional, dados cadastrais, timestamps de lifecycle e `authRevokedAt` para invalidacao de sessoes antigas.
- Foram criados modelos Prisma para planos, assinaturas, historico, faturas, snapshots de uso, sessoes de impersonacao e audit log de plataforma.
- O frontend `/admin/*` passou a consumir dados reais da Nexos API nas telas principais e o `verify` passou a bloquear retornos a mocks/fake runtime nessas rotas.
- Limites e features de plano passaram a ser validados no backend em usuarios, departamentos, Connections, contatos, campanhas, tickets e attachments.

## 3. Baseline Sprint 12

- Sprint 12: CONCLUIDA E HOMOLOGADA.
- Commit final Sprint 12: `6ce8650 docs: approve sprint 12 physical homologation`.
- Branch base usada para Sprint 13: `sprint/13-saas-control-plane-super-admin`.

## 4. Fechamento Sprint 12

O fechamento documental da Sprint 12 foi consolidado antes da abertura desta branch. O gate anterior permanece `READY FOR SPRINT 13`.

## 5. Preflight

- Worktree inicial: sem alteracoes de escopo da Sprint 13.
- Alteracoes preexistentes preservadas: `.local-storage/` permanece nao rastreado e fora do commit.
- Banco de regressao: `nexos_0801`.
- Banco fisico preservado sem reset: `nexos_0802`.
- Banco isolado criado para Sprint 13: `nexos_1300`.

## 6. Legacy audit

Foi auditado o runtime administrativo e criado guard automatizado:

- `scripts/check-platform-admin-legacy-runtime.mjs`
- `bun run test:platform-admin-legacy-runtime`
- Integracao no `bun run verify`

Resultado: as rotas principais de `/admin/*` nao podem voltar a depender de mock tenants, mock plans, mock invoices, fake metrics, Supabase operacional, role hardcoded ou impersonacao local-only.

## 7. Control plane architecture

Modulo criado:

- `backend/src/platform/platform.module.ts`
- `backend/src/platform/platform.controller.ts`
- `backend/src/platform/platform.service.ts`
- `backend/src/platform/platform-auth.guard.ts`
- `backend/src/platform/platform-auth.decorator.ts`
- `backend/src/platform/plan-entitlement.service.ts`
- `backend/src/platform/platform-audit.service.ts`

Separacao aplicada:

- Plano de controle: `/api/platform/*`, platform roles, tenants, planos, assinaturas, faturas, usage e auditoria.
- Plano operacional: tenant memberships, Inbox, CRM, Tickets, Campanhas e Connections.

## 8. Platform identity

`User.platformRole` agora suporta `ADMIN`, `SUPPORT`, `READONLY` e `USER`. Login sem `tenantSlug` e com role de plataforma retorna contexto `platform`, sem exigir `TenantMembership` operacional.

## 9. Platform roles and permissions

Permissoes server-side criadas para tenants, planos, assinaturas, usage, audit, impersonation e health administrativo. `ADMIN` tem permissao total; `SUPPORT` tem leitura e impersonacao controlada; `READONLY` tem leitura.

## 10. Platform authentication

Todas as rotas `/api/platform/*` passam por JWT e `PlatformAuthGuard`. `tenant_admin` sem platform role recebe HTTP 403.

## 11. Tenant domain

`Tenant` foi consolidado com dados cadastrais, status oficial, emails administrativo/tecnico, timezone, locale e campos de lifecycle.

## 12. Tenant lifecycle

Implementado lifecycle com suspensao, reativacao e encerramento sem hard delete. Transicoes invalidas retornam erro canonico `TENANT_STATUS_TRANSITION_INVALID`.

## 13. Session revocation

Suspensao e encerramento atualizam `authRevokedAt`. Login, refresh e guards operacionais rejeitam tenant inativo ou token anterior a revogacao.

## 14. Plan domain

Modelo `Plan` criado com status, periodo, moeda, preco, trial, features e limits validados no servico.

## 15. Plan features and limits

Features e limites aplicados server-side via `PlanEntitlementService`.

## 16. Subscription domain

Modelo `TenantSubscription` criado com status, vigencia, trial, cancelamento e snapshots de limits/features.

## 17. Upgrade and downgrade

Alteracao administrativa de assinatura registra historico e valida consumo antes de downgrade. Excesso retorna `PLAN_DOWNGRADE_LIMIT_EXCEEDED`.

## 18. Invoice domain

Faturas manuais implementadas com numeracao server-side `INV-YYYY-000001`, status administrativo e sem gateway de pagamento.

## 19. Usage

`PlanEntitlementService.getUsage()` calcula consumo real por tenant para usuarios, departamentos, Connections, contatos, conversas, mensagens do periodo, tickets, campanhas, destinatarios e storage.

## 20. Entitlements

`PlanEntitlementService` centraliza `getEntitlements`, `getUsage`, `assertTenantOperational`, `assertFeature` e `assertWithinLimit`.

## 21. Limit enforcement

Enforcement inicial aplicado em:

- criacao de usuario;
- criacao de departamento;
- criacao de Connection Evolution;
- criacao de contato;
- preview/start/schedule de campanhas;
- criacao de ticket;
- upload de attachment.

## 22. Impersonation

Modelo e API de impersonacao implementados com motivo obrigatorio, TTL configuravel por `NEXOS_IMPERSONATION_TTL_MINUTES`, start, stop e current. A UI dedicada e o banner permanente ainda precisam de homologacao/fechamento.

## 23. Audit log

`PlatformAuditLog` criado e gravado para acoes administrativas principais. Metadata passa por sanitizacao para nao registrar senha, token, secret, API key ou conteudo sensivel.

## 24. Platform API

Rotas implementadas:

- `GET /api/platform/dashboard`
- `GET/POST /api/platform/tenants`
- `GET/PATCH /api/platform/tenants/:id`
- `POST /api/platform/tenants/:id/suspend`
- `POST /api/platform/tenants/:id/reactivate`
- `POST /api/platform/tenants/:id/terminate`
- `GET /api/platform/tenants/:id/usage`
- `GET/POST/PATCH/DELETE /api/platform/plans`
- `GET /api/platform/subscriptions`
- `POST /api/platform/tenants/:tenantId/subscriptions`
- `PATCH /api/platform/subscriptions/:id`
- `POST /api/platform/subscriptions/:id/cancel`
- `GET /api/platform/subscriptions/:id/history`
- `GET/POST /api/platform/invoices`
- `PATCH /api/platform/invoices/:id/status`
- `GET /api/platform/audit-logs`
- `POST /api/platform/impersonation/start`
- `POST /api/platform/impersonation/:id/stop`
- `GET /api/platform/impersonation/current`

## 25. Frontend dashboard

`/admin` consome dashboard real da Platform API e remove metricas fake.

## 26. Tenant management UI

`/admin/empresas` lista tenants reais e permite suspender/reativar. Fluxos completos de criacao em etapas, detalhe completo e termination reforcado ainda nao foram fechados fisicamente.

## 27. Plans UI

`/admin/planos` lista planos reais, features e limites.

## 28. Subscriptions UI

`/admin/assinaturas` lista assinaturas reais.

## 29. Invoices UI

`/admin/financeiro` lista faturas reais e informa cobranca manual, sem gateway integrado.

## 30. Usage UI

Usage aparece em dashboard, tenants e licencas com dados vindos da API.

## 31. Audit UI

`/admin/auditoria` e `/admin/logs` usam `PlatformAuditLog` real.

## 32. Impersonation UI

API implementada. Banner permanente e fluxo completo de UI permanecem pendentes.

## 33. Realtime

Realtime administrativo dedicado nao foi implementado nesta sprint. REST permanece a fonte da verdade.

## 34. REST fallback

As telas principais funcionam por REST e refetch.

## 35. Security

- Role de plataforma resolvida no servidor.
- Tenant admin recebe 403 em platform API.
- Sessoes antigas sao invalidadas por `authRevokedAt`.
- Audit metadata sanitizada.
- Sem senha platform admin no bundle.

## 36. Tenant isolation

Rotas operacionais continuam tenant-scoped. Acesso cross-tenant agregado ficou restrito a `/api/platform/*` com permissao server-side.

## 37. Migration

Migration criada:

- `backend/prisma/migrations/20260804130000_saas_control_plane/migration.sql`

Aplicada em:

- `nexos_1300`: drop/create, migrate deploy e seed homologation.
- `nexos_0802`: migrate deploy sem reset.
- `nexos_0801`: migrate deploy sem reset.

`psql` nao estava no PATH; a gestao do banco isolado foi feita via container Docker `nexos-postgres`.

## 38. Backfill

Tenants existentes recebem `ACTIVE`, campos cadastrais basicos e assinatura inicial quando necessario. Seeds idempotentes criam planos Starter/Professional e platform admin local/homologacao sem imprimir senha.

## 39. Automated tests

Backend:

- `backend/test/app.e2e-spec.ts` cobre denial de tenant admin, login platform, listagem de tenants, suspensao/reativacao com revogacao, planos, fatura manual e audit log sanitizado.
- Suite completa: 22 arquivos, 138 testes PASS.

Frontend/guards:

- Typecheck PASS.
- Lint baseline PASS.
- Build PASS.
- Platform admin legacy runtime check PASS.
- Security XSS PASS.

## 40. Physical tests

Nao executados nesta rodada:

- Platform admin fisico.
- Tenant create fisico.
- Limites fisicos.
- Upgrade/downgrade fisicos.
- Suspensao/reativacao fisicas.
- Impersonacao fisica.
- Readonly fisico.
- Multiusuario.
- Realtime offline.
- Redis offline.

## 41. Regressions

Regressoes automatizadas preservadas por `bun run verify`, incluindo backend tests, Redis queue smoke, guards anti-legado e security XSS. Homologacao fisica de Inbox, Tickets, Campanhas e Evolution nao foi reexecutada nesta Sprint 13.

## 42. Performance

Uso e dashboard usam consultas agregadas no backend. Auditoria, tenants, assinaturas e faturas possuem paginacao basica por query params.

## 43. Typecheck/lint

- `bunx tsc --noEmit`: PASS.
- `bun run lint`: PASS com baseline legado existente de 1091 errors e 13 warnings.

## 44. Builds

- `bun run --cwd backend build`: PASS.
- `bun run build`: PASS.

Warnings conhecidos do frontend:

- `vite-tsconfig-paths` agora pode ser substituido por `resolve.tsconfigPaths`.
- Chunks acima de 500 kB.
- `inlineDynamicImports` ignorado quando `codeSplitting` esta especificado.

## 45. Verify

Ambiente:

- `DATABASE_URL=postgresql://nexos:nexos_dev_password@localhost:5432/nexos_0801?schema=public`
- `REDIS_URL=redis://localhost:6379`

Resultados:

- `bun run verify`: PASS.
- `bun run verify`: PASS.

Evidencia do segundo verify:

- frontend:typecheck PASS
- frontend:lint-baseline PASS
- frontend:build PASS
- inbox/ticket/campaign/platform-admin legacy runtime checks PASS
- backend:build PASS
- backend:test PASS, 22 arquivos e 138 testes
- redis:queue-smoke PASS
- security:xss PASS

## 46. Files created

- `backend/prisma/migrations/20260804130000_saas_control_plane/migration.sql`
- `backend/src/platform/*`
- `docs/PLATFORM_ADMIN.md`
- `docs/PLANS_AND_SUBSCRIPTIONS.md`
- `docs/TENANT_LIFECYCLE.md`
- `docs/IMPERSONATION.md`
- `scripts/check-platform-admin-legacy-runtime.mjs`
- `sprints/sprint-13/RELATORIO.md`

## 47. Files changed

Arquivos principais alterados:

- Prisma schema e seed.
- Auth, guards e realtime auth.
- Users, Departments, Messaging, CRM, Campaigns e Tickets para entitlement enforcement.
- Frontend `/admin/*` e `src/lib/nexos-api.ts`.
- `scripts/verify.mjs`, `package.json`, `docs/CHANGELOG.md` e `sprints/README.md`.

## 48. Files removed

Nenhum arquivo removido.

## 49. Documentation

Criados documentos dedicados de Platform Admin, Planos e Assinaturas, Tenant Lifecycle e Impersonation. `docs/CHANGELOG.md` atualizado.

Documentacao geral ampla (`docs/README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/AUTHENTICATION.md`, `docs/BUSINESS_RULES.md`, `docs/COMPONENTS.md`, `docs/DATABASE.md`, `docs/DEPLOY.md`, `docs/REALTIME.md`, `docs/ROADMAP.md`, `docs/USER_FLOW.md`) permanece como pendencia de consolidacao transversal.

## 50. M01-M161

| Metrica | Meta | Resultado | Evidencia | Status |
|---|---|---|---|---|
| M01 | baseline Sprint 12 | baseline confirmado | commit `6ce8650` | PASS |
| M02 | fechamento Sprint 12 | fechado documentalmente | Sprint 12 READY | PASS |
| M03 | branch Sprint 13 | branch criada | `sprint/13-saas-control-plane-super-admin` | PASS |
| M04 | worktree inicial | sem escopo conflitante | `.local-storage/` preservado | PASS |
| M05 | verify inicial | passou antes da implementacao | `bun run verify` | PASS |
| M06 | admin legacy audit | principais rotas auditadas | guard anti-legado | PASS |
| M07 | mock tenant sources | runtime bloqueado | `check-platform-admin-legacy-runtime` | PASS |
| M08 | mock plan sources | runtime bloqueado | `check-platform-admin-legacy-runtime` | PASS |
| M09 | mock invoice sources | runtime bloqueado | `check-platform-admin-legacy-runtime` | PASS |
| M10 | fake dashboard sources | runtime bloqueado | dashboard real | PASS |
| M11 | platform user model | consolidado em User.platformRole | Prisma/Auth | PASS |
| M12 | platform roles | ADMIN/SUPPORT/READONLY | guard | PASS |
| M13 | platform permissions | permissoes server-side | decorator/guard | PASS |
| M14 | platform auth guard | criado | `PlatformAuthGuard` | PASS |
| M15 | platform route isolation | `/api/platform/*` protegido | e2e 403 | PASS |
| M16 | tenant admin platform denial | negado | e2e HTTP 403 | PASS |
| M17 | tenant model | expandido | Prisma migration | PASS |
| M18 | tenant statuses | enum oficial | `TenantStatus` | PASS |
| M19 | tenant transitions | validacao server-side | service | PASS |
| M20 | tenant create | transacional | API/service | PASS |
| M21 | tenant admin provisioning | role preset aplicado | seed helper | PASS |
| M22 | tenant slug | normalizado/unico | DTO/service/schema | PASS |
| M23 | tenant suspension | implementada | API/e2e | PASS |
| M24 | session revocation | `authRevokedAt` | auth/guards/e2e | PASS |
| M25 | tenant reactivation | implementada | API/e2e | PASS |
| M26 | tenant termination | sem hard delete | API/service | PASS |
| M27 | plan model | criado | Prisma | PASS |
| M28 | plan statuses | DRAFT/ACTIVE/ARCHIVED | Prisma | PASS |
| M29 | plan features | JSON controlado | service/docs | PASS |
| M30 | plan limits | JSON controlado | service/docs | PASS |
| M31 | plan snapshot | assinatura preserva snapshot | Prisma/service | PASS |
| M32 | plan archive | delete arquiva | API/service | PASS |
| M33 | subscription model | criado | Prisma | PASS |
| M34 | subscription statuses | enum oficial | Prisma | PASS |
| M35 | subscription history | criado | Prisma/service | PASS |
| M36 | upgrade | implementado | service | PASS |
| M37 | downgrade validation | consumo validado | service | PASS |
| M38 | cancellation | implementado | API/service | PASS |
| M39 | trial | suportado | schema/seed | PASS |
| M40 | invoice model | criado | Prisma | PASS |
| M41 | invoice protocol | server-side | `InvoiceCounter` | PASS |
| M42 | invoice lifecycle | status manual | API/e2e | PASS |
| M43 | manual billing notice | UI explicita | `/admin/financeiro` | PASS |
| M44 | usage service | criado | `PlanEntitlementService` | PASS |
| M45 | usage snapshots | modelo criado | Prisma | PASS |
| M46 | active user usage | contado | service | PASS |
| M47 | Connection usage | contado | service | PASS |
| M48 | contacts usage | contado | service | PASS |
| M49 | storage usage | contado | service | PASS |
| M50 | campaign usage | contado | service | PASS |
| M51 | entitlement service | centralizado | service | PASS |
| M52 | user limit | aplicado | UsersController | PASS |
| M53 | department limit | aplicado | DepartmentsController | PASS |
| M54 | Connection limit | aplicado | MessagingConnectionsService | PASS |
| M55 | Contact limit | aplicado | CrmController | PASS |
| M56 | campaign limit | aplicado | CampaignsService | PASS |
| M57 | storage limit | aplicado | TicketsService | PASS |
| M58 | feature enforcement | aplicado | campaigns/tickets/connections/storage | PASS |
| M59 | concurrent limit enforcement | basico por transacao/servico | precisa teste fisico de corrida | PARTIAL |
| M60 | grandfathering | documentado e bloqueia novas criacoes | docs/service | PASS |
| M61 | impersonation model | criado | Prisma | PASS |
| M62 | impersonation start | API criada | controller/service | PASS |
| M63 | impersonation stop | API criada | controller/service | PASS |
| M64 | impersonation TTL | parser numerico seguro | service | PASS |
| M65 | real actor preservation | campos dedicados | Prisma/audit | PASS |
| M66 | banner | nao implementado na UI | pendente | FAIL |
| M67 | high-risk block | politica documentada, nao integrada a UI | pendente | PARTIAL |
| M68 | impersonation audit | implementado | audit service | PASS |
| M69 | audit model | criado | Prisma | PASS |
| M70 | audit immutability | sem endpoint delete/update | controller | PASS |
| M71 | tenant audit events | implementados | service | PASS |
| M72 | plan audit events | implementados | service | PASS |
| M73 | subscription audit events | implementados | service | PASS |
| M74 | invoice audit events | implementados | service | PASS |
| M75 | sanitized metadata | implementado | audit service/e2e | PASS |
| M76 | tenants API | implementada | controller | PASS |
| M77 | plans API | parcial sem GET detalhe dedicado | controller | PARTIAL |
| M78 | subscriptions API | parcial sem GET detalhe dedicado | controller | PARTIAL |
| M79 | invoices API | parcial sem GET detalhe dedicado | controller | PARTIAL |
| M80 | usage API | implementada | controller | PASS |
| M81 | audit API | parcial sem GET detalhe dedicado | controller | PARTIAL |
| M82 | impersonation API | implementada | controller | PASS |
| M83 | frontend dashboard | real | `/admin` | PASS |
| M84 | frontend tenant list | real | `/admin/empresas` | PASS |
| M85 | frontend tenant create | nao implementado | pendente | FAIL |
| M86 | frontend tenant detail | nao implementado | pendente | FAIL |
| M87 | frontend suspension | parcial sem confirmacao digitada | UI | PARTIAL |
| M88 | frontend reactivation | implementada simples | UI | PASS |
| M89 | frontend termination | nao implementada | pendente | FAIL |
| M90 | frontend plans | lista real | `/admin/planos` | PASS |
| M91 | frontend subscriptions | lista real | `/admin/assinaturas` | PASS |
| M92 | frontend invoices | lista real | `/admin/financeiro` | PASS |
| M93 | frontend usage | parcial em telas agregadas | UI | PARTIAL |
| M94 | frontend audit | real | `/admin/auditoria` | PASS |
| M95 | frontend impersonation | nao implementado | pendente | FAIL |
| M96 | realtime platform | nao implementado | pendente | FAIL |
| M97 | REST fallback | implementado | platformApi | PASS |
| M98 | platform health | nao consolidado | pendente | FAIL |
| M99 | Redis degraded | nao homologado para platform | pendente | FAIL |
| M100 | migration nexos_1300 | aplicada | migrate deploy | PASS |
| M101 | migration nexos_0802 | aplicada sem reset | migrate deploy | PASS |
| M102 | migration nexos_0801 | aplicada sem reset | migrate deploy | PASS |
| M103 | backfill tenants | aplicado | migration/seed | PASS |
| M104 | data preservation | sem reset em 0801/0802 | migrate deploy | PASS |
| M105 | orphan audit | nao documentado em consulta propria | pendente | PARTIAL |
| M106 | index audit | indices criados | migration | PASS |
| M107 | platform auth tests | e2e basico | app e2e | PARTIAL |
| M108 | tenant lifecycle tests | susp/reactivate coberto | app e2e | PARTIAL |
| M109 | plan tests | listagem coberta | app e2e | PARTIAL |
| M110 | subscription tests | criacao/lista indiretamente | app e2e | PARTIAL |
| M111 | invoice tests | create/status coberto | app e2e | PASS |
| M112 | entitlement tests | coberto por services/e2e parcial | test suite | PARTIAL |
| M113 | concurrency limit tests | nao coberto | pendente | FAIL |
| M114 | suspension tests | login/token antigo cobertos | app e2e | PARTIAL |
| M115 | impersonation tests | nao coberto em e2e amplo | pendente | PARTIAL |
| M116 | audit tests | sanitizacao coberta | app e2e | PASS |
| M117 | usage tests | nao exaustivo | pendente | PARTIAL |
| M118 | tenant isolation tests | tenant admin 403 | app e2e | PARTIAL |
| M119 | frontend tests | typecheck/build/guard | verify | PARTIAL |
| M120 | anti-legacy test | criado e integrado | verify | PASS |
| M121 | secret audit | sem vazamento novo | guard/testes existentes | PASS |
| M122 | platform admin physical | nao executado | pendente | FAIL |
| M123 | tenant create physical | nao executado | pendente | FAIL |
| M124 | limits physical | nao executado | pendente | FAIL |
| M125 | upgrade physical | nao executado | pendente | FAIL |
| M126 | downgrade physical | nao executado | pendente | FAIL |
| M127 | suspension physical | nao executado | pendente | FAIL |
| M128 | reactivation physical | nao executado | pendente | FAIL |
| M129 | impersonation physical | nao executado | pendente | FAIL |
| M130 | invoice physical | nao executado | pendente | FAIL |
| M131 | readonly physical | nao executado | pendente | FAIL |
| M132 | tenant admin denial physical | nao executado | pendente | FAIL |
| M133 | multiuser physical | nao executado | pendente | FAIL |
| M134 | realtime offline physical | nao executado | pendente | FAIL |
| M135 | Redis offline physical | nao executado | pendente | FAIL |
| M136 | auth regression | automatizada | verify | PASS |
| M137 | Inbox regression | automatizada | verify | PASS |
| M138 | Ticket regression | automatizada | verify | PASS |
| M139 | Campaign regression | automatizada | verify | PASS |
| M140 | Evolution regression | automatizada parcial | tests/logs sanitizados | PARTIAL |
| M141 | queue regression | smoke Redis | verify | PASS |
| M142 | performance audit | agregacoes revisadas | service | PARTIAL |
| M143 | pagination | basica em listas | API | PASS |
| M144 | typecheck | passou | `bunx tsc --noEmit`/verify | PASS |
| M145 | lint | passou baseline | `bun run lint`/verify | PASS |
| M146 | frontend tests | security XSS passou | verify | PASS |
| M147 | backend tests | 138 testes | verify | PASS |
| M148 | frontend build | passou | verify | PASS |
| M149 | backend build | passou | verify | PASS |
| M150 | verify #1 | passou | `bun run verify` | PASS |
| M151 | verify #2 | passou | `bun run verify` | PASS |
| M152 | docs platform | criado | `docs/PLATFORM_ADMIN.md` | PASS |
| M153 | docs plans | criado | `docs/PLANS_AND_SUBSCRIPTIONS.md` | PASS |
| M154 | docs tenant lifecycle | criado | `docs/TENANT_LIFECYCLE.md` | PASS |
| M155 | docs impersonation | criado | `docs/IMPERSONATION.md` | PASS |
| M156 | docs general | parcial | changelog + docs dedicados | PARTIAL |
| M157 | changelog | atualizado | `docs/CHANGELOG.md` | PASS |
| M158 | report | criado | este arquivo | PASS |
| M159 | commit | commit principal criado | `a0fbc57 feat: add saas control plane` | PASS |
| M160 | final git clean | limpo para escopo rastreado; `.local-storage/` preservado fora do commit | `git status --short` | PASS |
| M161 | gate | bloqueado | fisico pendente | FAIL |

## 51. Technical debt

- Completar UI de criacao/detalhe/termination de tenants.
- Implementar banner permanente e fluxo operacional completo de impersonacao.
- Adicionar health administrativo detalhado.
- Implementar realtime administrativo ou formalizar polling por refetch.
- Expandir testes unitarios/e2e para roles SUPPORT/READONLY, invalid transitions, downgrade por consumo, concorrencia de limites e impersonacao.
- Consolidar documentacao geral transversal.

## 52. Risks

- Sem homologacao fisica, nao ha evidencia de comportamento multiusuario, realtime offline ou Redis offline no plano de controle.
- Limites concorrentes ainda precisam de teste especifico de corrida no ultimo slot.
- Impersonacao tem backend inicial, mas UX de banner/stop visivel ainda nao fecha o requisito operacional.

## 53. Commits

Commit principal:

- `a0fbc57 feat: add saas control plane`

## 54. Final Git state

Estado final esperado apos commit documental:

- Worktree limpo para arquivos rastreados.
- `.local-storage/` preservado como untracked preexistente e fora do commit.

## 55. Gate

Automacao esta verde, mas o gate fisico de Sprint 13 nao foi executado. A Sprint 13 nao pode liberar Sprint 14 ate que os testes fisicos M122-M135 sejam executados com evidencia e sem regressao.

NOT READY FOR SPRINT 14
