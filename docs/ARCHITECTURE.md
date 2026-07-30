# Arquitetura

## Baseline real do frontend

IMPLEMENTADO: o projeto e um frontend React com TanStack Start, TanStack Router file-based e Vite. O MVP usa Supabase diretamente em parte das telas para Auth, PostgREST e Realtime.

SIMULADO NO MVP: parte da administracao, Super Admin, campanhas, filas e rotas legadas usam `src/lib/mock/*` e arrays hardcoded.

PLANEJADO: backend Node.js + NestJS + TypeScript, PostgreSQL + Prisma, Redis + BullMQ, Socket.io, adaptadores Evolution API/Meta Cloud API, Cloudflare R2 e Docker Compose em VPS.

## Camadas atuais

```text
src/routes
  Paginas, layouts e acoes de tela
src/components
  Shells, UI kit, feedback, modais e filtros
src/lib/mvp.ts
  Camada Supabase real do MVP operacional
src/lib/session.ts
  Sessao, roles de UI, login/logout e contas demo
src/lib/perms.ts
  Permissoes de chat por access profile
src/lib/mock
  Dados simulados e store legado
src/integrations/supabase
  Clientes e middlewares Supabase do MVP
```

## Fluxo de dados atual

```text
Acao do usuario
  -> rota/componente
  -> TanStack Query ou Zustand/local state
  -> Supabase, mock store, array hardcoded ou localStorage
  -> estado React/query cache/store
  -> resultado visual
```

## Fronteiras atuais

- Browser: principal runtime das telas.
- Server function: `ensureDemoUsers`, com `supabaseAdmin`, para criar usuarios demo.
- SSR: `src/server.ts` e `src/start.ts` cuidam de error boundary e middleware de function.
- Banco MVP: migrations Supabase existem, mas nao representam a modelagem final planejada com Prisma.

## Diferencas MVP x arquitetura futura

| Area          | MVP atual                             | Futuro aprovado     |
| ------------- | ------------------------------------- | ------------------- |
| Backend       | Supabase direto + uma server function | NestJS              |
| Banco         | Supabase/Postgres migrations          | PostgreSQL + Prisma |
| Realtime      | Supabase Realtime + barramento local  | Socket.io           |
| Filas         | Nao implementado; algumas simulacoes  | Redis + BullMQ      |
| Midia         | Data URL em tabela/HTML               | Cloudflare R2       |
| Multi-tenancy | UI/mock, sem `tenant_id` operacional  | Multi-tenancy real  |

## Riscos arquiteturais

- Mistura de Supabase real, mocks e hardcodes.
- Rotas protegidas por shell client-side, nao por guard universal.
- Super Admin visualmente pronto, mas sem backend multi-tenant real.
- Permissoes granulares usadas como controle de UI sem garantia completa no backend atual.

## Sprint 01 - Strangler Fig

A Sprint 01 iniciou a migracao incremental sem remover Supabase do MVP. O frontend continua como fonte de UX e ainda pode usar Supabase nas telas existentes. O novo backend NestJS fica isolado em `backend/` e entrega apenas o primeiro contrato funcional multi-tenant.

```text
React/TanStack frontend
  -> fluxo legado Supabase onde ainda nao migrado
  -> Nexos API NestJS para auth/contexto/rotas novas

Nexos API NestJS
  -> Prisma
  -> PostgreSQL local
```

Fronteiras novas:

- `backend/src/auth`: login, refresh, JWT access token e guard.
- `backend/src/users`: `/api/me` com contexto de usuario, tenant e permissoes.
- `backend/src/tenant-records`: rota protegida para provar isolamento por `tenantId`.
- `backend/src/health`: healthcheck com consulta real ao PostgreSQL.

Redis/BullMQ, Socket.io, Evolution/Meta e R2 permanecem planejados, nao implementados nesta sprint.

## Sprint 01.1 - Regression Gate

O frontend Lovable/TanStack segue como contrato funcional e visual. A Sprint 01.1 nao mudou design, rotas ou navegacao; ela estabilizou o pipeline local para as proximas sprints.

Decisoes:

- NestJS Auth e a autoridade definitiva de identidade da plataforma.
- Supabase Auth permanece como legado temporario do MVP ate os fluxos operacionais serem migrados.
- `routeTree.gen.ts` deve manter o footer gerado pelo TanStack Start com o registro de `@tanstack/react-start`; sem esse footer, o manifest recebe `routeTreeRoutes` indefinido.
- O gate de regressao oficial e `bun run verify`.
