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

Sprint 01 implementou Docker Compose, NestJS e Prisma. Redis, BullMQ, Socket.io, R2, Evolution API e Meta Cloud API continuam nao implementados.

## Operacao Local Sprint 01

Subir banco:

```bash
docker compose up -d postgres
```

Preparar Prisma:

```bash
bun run backend:prisma:generate
bun run backend:prisma:migrate -- --name init
bun run backend:prisma:seed
```

Rodar API:

```bash
bun run backend:dev
```

Variaveis novas:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_ORIGIN`
- `VITE_NEXOS_API_URL`
- `ALLOW_DEMO_USER_PROVISIONING=false` por padrao

## Observacoes operacionais

- `src/server.ts` substitui alguns erros 500 JSON por pagina HTML de erro.
- `routeTree.gen.ts` e gerado automaticamente.
- `client.server.ts` avisa que `supabaseAdmin` deve ser usado apenas server-side e preferencialmente importado dentro de handlers.

## Build Windows - Sprint 01.1

Validado em Windows `10.0.26200.0`, PowerShell `5.1.26100.8972`, Node `v24.14.0` e Bun `1.3.14`.

Observacoes:

- `routeTree.gen.ts` e fonte gerada versionada e necessaria para o build TanStack Start.
- O footer de `@tanstack/react-start` no route tree e necessario para o manifest.
- `bun run build` foi executado duas vezes em sequencia com sucesso.
- A limpeza de artefatos gerados pode ser feita localmente quando necessario, mas nao e requisito do build validado.
