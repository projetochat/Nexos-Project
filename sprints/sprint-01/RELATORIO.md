# Sprint 01 - Relatorio de reexecucao autorizada

Data: 2026-07-29
Branch: `sprint/01-foundation`
Status: `READY COM PENDENCIAS DE BASELINE FRONTEND`

## 1. Resumo executivo

A reexecucao autorizada da Sprint 01 removeu os bloqueios anteriores de ambiente, inicializou Git, instalou Bun, criou a fundacao backend NestJS/PostgreSQL/Prisma e entregou o primeiro vertical slice multi-tenant.

O frontend Lovable/TanStack foi preservado. Supabase continua ativo como legado do MVP, seguindo Strangler Fig. A integracao frontend foi minima: login tenta a Nexos API e faz fallback para Supabase legado; `ensureDemoUsers` deixou de ser chamado pela UI; o HTML rico de chamados agora e sanitizado antes de persistir e ao reabrir edicao.

## 2. Commits e Git

| Item               | Resultado                                  |
| ------------------ | ------------------------------------------ |
| Git inicializado   | Sim                                        |
| Commit baseline    | `0cfe289973a321e0bae28c78e985cfabda8f15c5` |
| Branch de trabalho | `sprint/01-foundation`                     |
| Push               | Nao executado                              |

## 3. Ambiente

| Item             | Resultado                           |
| ---------------- | ----------------------------------- |
| Node.js          | `v24.14.0`                          |
| Git              | `2.51.0.windows.2`                  |
| Bun              | `1.3.14`                            |
| Docker           | `29.1.3`                            |
| Docker Compose   | `v2.40.3-desktop.1`                 |
| PostgreSQL local | Container `nexos-postgres`, healthy |

## 4. Entregas funcionais

- `docker-compose.yml` com PostgreSQL 16.
- Workspace `backend/` com NestJS + TypeScript.
- Prisma schema, migration inicial e seed multi-tenant.
- Auth por JWT com access token e refresh token.
- `/api/health` com verificacao real de banco.
- `/api/me` com usuario, tenant e permissoes.
- `/api/tenant-records/:id` protegido por tenant, retornando 404 para outro tenant.
- Testes e2e backend cobrindo health, login, `/me`, credenciais invalidas e isolamento cross-tenant.
- Sanitizacao XSS do editor de chamados com DOMPurify e testes.
- `ensureDemoUsers` protegido por `ALLOW_DEMO_USER_PROVISIONING=true` e removido do fluxo de login.

## 5. Dados e migrations

Migration criada:

- `backend/prisma/migrations/20260729214245_init/migration.sql`

Entidades:

- `Tenant`
- `User`
- `TenantMembership`
- `ProtectedRecord`

Seed:

- tenant `acme`
- tenant `orbit`
- `admin@nexo.app` / `demo1234`
- `atendente@nexo.app` / `demo1234`
- `outsider@nexo.app` / `demo1234`

## 6. Validacoes executadas

| Gate                    | Comando                                               | Resultado                                                    |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Install baseline        | `bun install --frozen-lockfile`                       | PASS                                                         |
| Prisma generate         | `bun run prisma:generate` em `backend/`               | PASS                                                         |
| Docker/Postgres         | `docker compose up -d postgres`                       | PASS                                                         |
| Migration               | `bun run prisma:migrate -- --name init` em `backend/` | PASS                                                         |
| Seed                    | `bun run prisma:seed` em `backend/`                   | PASS                                                         |
| Typecheck frontend      | `bunx tsc --noEmit`                                   | PASS                                                         |
| Backend build           | `bun run backend:build`                               | PASS                                                         |
| Backend tests           | `bun run backend:test`                                | PASS, 4/4                                                    |
| XSS tests               | `bun run test:security`                               | PASS, 3/3                                                    |
| Frontend lint baseline  | `bun run lint`                                        | FAIL preexistente: 2061 erros, majoritariamente Prettier     |
| Frontend build baseline | `bun run build`                                       | FAIL preexistente: TanStack Start manifest/rename em Windows |
| HTTP smoke background   | processo local via executor                           | Bloqueado por policy do shell_command                        |

## 7. Metricas M01-M29

| ID  | Status             | Evidencia                                                           |
| --- | ------------------ | ------------------------------------------------------------------- |
| M01 | APROVADA           | baseline e branch criados                                           |
| M02 | APROVADA           | Git status rastreia alteracoes                                      |
| M03 | APROVADA           | `bun install --frozen-lockfile` executado                           |
| M04 | APROVADA           | Supabase/frontend preservados                                       |
| M05 | APROVADA           | `RELATORIO-TENTATIVA-01.md` preservado e relatorio atual atualizado |
| M06 | APROVADA           | `.env` ignorado; `.env.example` sem secrets                         |
| M07 | APROVADA           | login nao chama `ensureDemoUsers`; flag obrigatoria                 |
| M08 | APROVADA           | `sanitizeRichTextHtml` em chamados                                  |
| M09 | APROVADA           | testes XSS 3/3                                                      |
| M10 | APROVADA           | nenhum segredo real adicionado                                      |
| M11 | APROVADA           | guard JWT em `/me` e tenant records                                 |
| M12 | APROVADA           | tenant vem de membership/JWT                                        |
| M13 | APROVADA           | teste cross-tenant retorna 404                                      |
| M14 | APROVADA           | nenhum vazamento conhecido no slice novo                            |
| M15 | APROVADA           | login invalido e authz cobertos                                     |
| M16 | APROVADA           | 404 para outro tenant                                               |
| M17 | REPROVADA BASELINE | lint frontend falha por issues preexistentes                        |
| M18 | APROVADA           | `bunx tsc --noEmit` e backend build aprovados                       |
| M19 | APROVADA           | backend 4/4 e XSS 3/3                                               |
| M20 | APROVADA PARCIAL   | backend build aprovado; frontend build falha baseline               |
| M21 | APROVADA           | codigo novo coberto por testes focados                              |
| M22 | APROVADA           | guard/tenant testados                                               |
| M23 | PARCIAL            | e2e Nest em processo aprovado; HTTP smoke background bloqueado      |
| M24 | PENDENTE BASELINE  | frontend build/lint ja falham antes da sprint                       |
| M25 | APROVADA           | arquivos principais documentados                                    |
| M26 | APROVADA           | comandos reais registrados                                          |
| M27 | APROVADA           | riscos e pendencias documentados                                    |
| M28 | APROVADA           | docs atualizados com validacao local                                |
| M29 | APROVADA           | matriz preenchida                                                   |

## 8. Pendencias e riscos

- Corrigir o baseline de lint do frontend, hoje com muitos erros de Prettier e alguns `no-empty`.
- Investigar build TanStack Start no Windows: erro `Cannot convert undefined or null to object` no manifest e EPERM de rename em `routeTree.gen.ts`.
- Smoke HTTP com processo em background foi bloqueado pela policy do executor; testes e2e cobrem a API em processo Nest.
- Decidir estrategia definitiva de auth: propria NestJS, Supabase Auth mantido, ou provedor externo.
- Migrar fluxos operacionais reais para backend em sprints futuras.

## 9. Como validar localmente

```bash
bun install --frozen-lockfile
docker compose up -d postgres
bun run backend:prisma:generate
bun run backend:prisma:migrate -- --name init
bun run backend:prisma:seed
bun run backend:build
bun run backend:test
bun run test:security
```

Para rodar a API:

```bash
bun run backend:dev
```

Base: `http://localhost:3001/api`

## 10. Recomendacao

`READY` para a fundacao e o primeiro vertical slice backend multi-tenant.

`NOT READY` para considerar o frontend inteiro como pipeline limpo, porque lint/build existentes ainda falham fora do recorte implementado.
