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

| Area | MVP atual | Futuro aprovado |
| --- | --- | --- |
| Backend | Supabase direto + uma server function | NestJS |
| Banco | Supabase/Postgres migrations | PostgreSQL + Prisma |
| Realtime | Supabase Realtime + barramento local | Socket.io |
| Filas | Nao implementado; algumas simulacoes | Redis + BullMQ |
| Midia | Data URL em tabela/HTML | Cloudflare R2 |
| Multi-tenancy | UI/mock, sem `tenant_id` operacional | Multi-tenancy real |

## Riscos arquiteturais

- Mistura de Supabase real, mocks e hardcodes.
- Rotas protegidas por shell client-side, nao por guard universal.
- Super Admin visualmente pronto, mas sem backend multi-tenant real.
- Permissoes granulares usadas como controle de UI sem garantia completa no backend atual.
