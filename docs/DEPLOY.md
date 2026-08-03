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
- Evolution API esta disponivel como provider real opcional via Docker Compose local.
- Nao ha integracao real implementada com Meta Cloud API, N8N, Redis/BullMQ do Nexos, R2 ou provedor de IA.

## Deploy futuro aprovado

PLANEJADO para Sprints posteriores:

- Backend Node.js + NestJS + TypeScript.
- PostgreSQL + Prisma.
- Redis + BullMQ.
- Socket.io.
- Cloudflare R2.
- Adaptadores Evolution API e Meta Cloud API.
- Docker Compose em VPS como deploy inicial.

Sprint 01 implementou Docker Compose, NestJS e Prisma. Sprint 07 adicionou Evolution API como provider. Redis/BullMQ do Nexos, Socket.io, R2 e Meta Cloud API continuam nao implementados.

## Sprint 06

Executar migrations Prisma antes de subir a nova versao para criar `messaging_connections` e campos provider-neutral de `messages`. Development Provider e bloqueado em `NODE_ENV=production`; ambientes produtivos devem configurar providers reais em sprint futura antes de permitir outbound externo.

## Sprint 07

Evolution API local:

```powershell
docker compose up -d postgres evolution-postgres evolution-redis evolution-api
```

Variaveis:

- `EVOLUTION_BASE_URL=http://localhost:8080`
- `EVOLUTION_API_KEY`
- `EVOLUTION_TIMEOUT_MS=10000`
- `EVOLUTION_WEBHOOK_PUBLIC_URL=http://host.docker.internal:3001/api/webhooks/evolution`
- `EVOLUTION_WEBHOOK_SECRET`
- `EVOLUTION_SERVER_URL=http://localhost:8080`
- `EVOLUTION_POSTGRES_USERNAME`
- `EVOLUTION_POSTGRES_PASSWORD`
- `EVOLUTION_POSTGRES_DATABASE`

Usar valores fortes para `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRET` fora de desenvolvimento. A imagem Evolution esta fixada em `evoapicloud/evolution-api:v2.3.1`; nao usar `latest` em deploy reproduzivel.

O Redis e PostgreSQL extras do Compose sao internos da Evolution API. Eles nao habilitam filas BullMQ, cache ou realtime do Nexos.

## Sprint 07.01

O backend Nest roda com cwd `backend` no script `backend:dev`, portanto o carregamento de ambiente considera `.env` e `../.env`. Em desenvolvimento local, manter as variaveis Evolution no `.env` da raiz e validar com:

```powershell
GET http://localhost:3001/api/messaging/connections/health/evolution
```

Cleanup explicito de fake/orphan connections de testes:

```powershell
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public"
node backend/scripts/cleanup-messaging-connections.mjs --yes
```

Para remover todas as Evolution locais em ambiente de desenvolvimento, usar `--all-evolution` apenas de forma consciente. O script desvincula `connectionId` de mensagens/conversas e nao apaga CRM.

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

## Operacao Local Sprint 02

Banco definitivo do recorte organizacional:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public"
docker compose up -d postgres
bun run backend:prisma:generate
bun --cwd backend prisma migrate deploy --schema prisma/schema.prisma
bun run backend:prisma:seed
```

Verificacao:

```powershell
bun run verify
```

Observacoes:

- Migrations Prisma ficam em `backend/prisma/migrations`.
- Migrations Supabase permanecem apenas para o legado MVP ainda nao migrado.
- `DATABASE_URL`, `JWT_SECRET` e `JWT_REFRESH_SECRET` sao obrigatorias para backend fora do `verify`.
- O frontend usa `VITE_NEXOS_API_URL` quando definido; padrao local: `http://localhost:3001/api`.

# Sprint 08 - Redis Nexos e worker outbound

Servico local:

```text
nexos-redis = Redis/BullMQ do Nexos
evolution-redis = infraestrutura interna da Evolution
```

Variaveis:

```text
REDIS_URL=redis://localhost:6379
NEXOS_QUEUE_ENABLED=true
NEXOS_QUEUE_WORKER_ENABLED=true
NEXOS_OUTBOUND_WORKER_CONCURRENCY=5
NEXOS_OUTBOX_POLL_INTERVAL_MS=1000
```

Producao:

- usar Redis gerenciado ou privado;
- exigir auth/TLS quando exposto fora da rede privada;
- nao reutilizar Redis da Evolution;
- monitorar `/api/health` para `database` e `redis`;
- garantir shutdown limpo de worker, queue, poller e clientes Redis.

Smoke local:

```bash
bun backend/scripts/verify-redis-queue.mjs
```

## Sprint 08.01 - Homologacao limpa

Banco recomendado para a corretiva:

```powershell
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos_0801?schema=public"
$env:REDIS_URL="redis://localhost:6379"
$env:NEXOS_QUEUE_ENABLED="true"
$env:NEXOS_QUEUE_WORKER_ENABLED="true"
```

Seed padrao:

```powershell
bun --cwd backend prisma db seed
```

Sem `SEED_DEMO_DATA=true`, o seed cria apenas tenant de homologacao, admin, roles/permissoes, membership e departamento minimo. Para dados demo locais:

```powershell
$env:SEED_DEMO_DATA="true"
bun --cwd backend prisma db seed
```

Cleanup seguro:

```powershell
bun --cwd backend run cleanup:homologation -- --tenant-slug homologacao
bun --cwd backend run cleanup:homologation -- --tenant-slug homologacao --confirm
```
