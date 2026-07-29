# Deploy e Operacao

## Build

```bash
bun run build
```

O build e feito por Vite/TanStack Start. `vite.config.ts` usa `@lovable.dev/vite-tanstack-config` e aponta o server entry para `src/server.ts`.

## Desenvolvimento

```bash
bun run dev
```

`bunfig.toml` e o preset Lovable podem definir comportamento de porta/host. O script diretamente executa `vite dev`.

## Preview local

```bash
bun run preview
```

## Ambiente

Variaveis necessarias:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` para server function admin.

## Banco

Migrations ficam em `supabase/migrations`. Nova tabela deve receber grants, RLS e policies. O projeto usa `supabase/config.toml` com `project_id = "rgbiakpsbgpzuqnmlssu"`.

## CI/CD

Nao foram encontrados arquivos de pipeline como GitHub Actions, GitLab CI ou similares.

## Dependencias externas

- Supabase/Lovable Cloud para Auth, Postgres e Realtime.
- Google Fonts no HTML root.
- Nao ha integracao real implementada com Evolution API, Meta Cloud API, N8N, Redis, BullMQ, R2 ou provedor de IA.

## Deploy futuro aprovado

PLANEJADO para Sprints posteriores:

- Backend Node.js + NestJS + TypeScript.
- PostgreSQL + Prisma.
- Redis + BullMQ.
- Socket.io.
- Cloudflare R2.
- Adaptadores Evolution API e Meta Cloud API.
- Docker Compose em VPS como deploy inicial.

NAO IMPLEMENTADO nesta Sprint: nenhum arquivo Docker, Compose, NestJS, Prisma, Redis, BullMQ ou Socket.io foi criado.

## Observacoes operacionais

- `src/server.ts` substitui alguns erros 500 JSON por pagina HTML de erro.
- `routeTree.gen.ts` e gerado automaticamente.
- `client.server.ts` avisa que `supabaseAdmin` deve ser usado apenas server-side e preferencialmente importado dentro de handlers.
