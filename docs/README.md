# Nexo - Documentacao Tecnica

Esta documentacao descreve a baseline da Sprint 00. O frontend atual e a fonte da verdade para telas, fluxos e comportamento. A arquitetura futura aprovada e a fonte da verdade para backend e infraestrutura.

## Estado atual do MVP

IMPLEMENTADO:

- Frontend React/TanStack Start/Vite com rotas file-based.
- UI administrativa, operacional, atendimento, configuracoes e Super Admin.
- Supabase Auth/PostgREST/Realtime em partes do MVP.
- Mocks e hardcodes ainda usados por telas administrativas, campanhas, filas e rotas legadas.
- Persistencia local para tema, sessao, sidebar, preferencias de filas e onboardings.

SIMULADO NO MVP:

- Super Admin SaaS/multi-tenant.
- Monitoramento de Evolution API, Meta Cloud API, Socket.io e Cloudflare R2.
- Campanhas, filas administrativas e parte de empresas/atendentes/departamentos/etiquetas.
- QR de instancia e integracoes de canais.

PLANEJADO:

- Backend Node.js + NestJS + TypeScript.
- PostgreSQL + Prisma.
- Redis + BullMQ.
- Evolution API + Meta Cloud API por camada adaptadora.
- Socket.io.
- Cloudflare R2.
- Docker Compose em VPS.

## Tecnologias atuais

| Area            | Tecnologia                                                    |
| --------------- | ------------------------------------------------------------- |
| Frontend        | React 19, TanStack Start, TanStack Router, Vite 8, TypeScript |
| Dados MVP       | Supabase JS, TanStack Query, Zustand                          |
| UI              | Tailwind CSS v4, Radix/shadcn, lucide-react, Recharts, Sonner |
| Mocks           | Zustand store, `@faker-js/faker`, arrays hardcoded            |
| Package manager | Bun, identificado por `bun.lock`                              |

## Estrutura basica

```text
docs/                 documentacao oficial
public/               assets estaticos
src/components/       shells, UI kit e componentes compartilhados
src/hooks/            hooks compartilhados
src/integrations/     clientes Supabase do MVP
src/lib/              dominio, sessao, permissoes, mocks e utilitarios
src/routes/           rotas file-based
supabase/migrations/  schema Supabase atual do MVP
```

## Scripts

| Script    | Comando real                     |
| --------- | -------------------------------- |
| Dev       | `bun run dev`                    |
| Build     | `bun run build`                  |
| Build dev | `bun run build:dev`              |
| Preview   | `bun run preview`                |
| Lint      | `bun run lint`                   |
| Format    | `bun run format`                 |
| Typecheck | Nao disponivel no `package.json` |
| Tests     | Nao disponivel no `package.json` |

## Validacao local da Sprint 00

### Passo 1 - Pre-requisitos

- Node.js: baseline analisada com `v24.14.0`.
- Package manager: Bun, pois existe `bun.lock`.
- Bun precisa estar instalado e disponivel no PATH.

### Passo 2 - Confirmar diretorio

PowerShell:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
```

Bash/zsh:

```bash
cd "/c/Users/Rabel/Downloads/Nexos Project"
```

### Passo 3 - Instalar dependencias

```bash
bun install --frozen-lockfile
```

Nao use npm/pnpm/yarn neste projeto, para nao gerar outro lockfile.

### Passo 4 - Variaveis de ambiente

Arquivo esperado: `.env`.

Obrigatorias para o frontend MVP:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Obrigatoria apenas para server function administrativa:

- `SUPABASE_SERVICE_ROLE_KEY`

Nao sobrescreva `.env` existente e nao publique secrets.

### Passo 5 - Iniciar frontend

```bash
bun run dev
```

Endereco esperado: URL informada pelo Vite no terminal, normalmente `http://localhost:5173` ou porta configurada pelo preset Lovable.

### Passo 6 - Lint

```bash
bun run lint
```

### Passo 7 - Typecheck

Nao disponivel no estado atual do `package.json`.

### Passo 8 - Testes

Nao ha script de testes nem arquivos `.test.*`/`.spec.*` encontrados.

### Passo 9 - Build

```bash
bun run build
```

### Passo 10 - Smoke test manual

1. Abrir `/login`.
2. Validar alternancia de tema e credenciais demo preenchidas.
3. Fazer login demo se o Supabase e a service role estiverem configurados.
4. Abrir `/`, `/inbox`, `/clientes`, `/contatos`, `/historico`, `/simulador`, `/mensagens-rapidas`, `/relatorios`.
5. Validar busca, filtros, modais e estados vazios onde existirem.
6. Abrir `/chamados` e validar modal de chamado sem salvar dados reais indevidos.
7. Abrir `/instancias` e `/perfis` como administrador.
8. Abrir `/admin` apenas com usuario compatível; observar que dados sao simulados.

Na Sprint 00 desta maquina, install/lint/build/dev server nao puderam ser executados porque `bun` nao estava instalado.

## Atualizacao Sprint 01

IMPLEMENTADO:

- Git inicializado com baseline Lovable e branch `sprint/01-foundation`.
- Bun 1.3.14 instalado e usado como unico package manager.
- Backend NestJS em `backend/`, mantido como strangler fig ao lado do frontend existente.
- PostgreSQL local via `docker-compose.yml`.
- Prisma schema, migration inicial e seed multi-tenant.
- API minima: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/me`, `GET /api/tenant-records/:id`.
- Testes backend e teste de sanitizacao XSS.

Scripts adicionais:

| Script                                          | Uso                                   |
| ----------------------------------------------- | ------------------------------------- |
| `bun run backend:build`                         | Compila o backend NestJS              |
| `bun run backend:test`                          | Executa testes e2e da API             |
| `bun run backend:prisma:generate`               | Gera Prisma Client                    |
| `bun run backend:prisma:migrate -- --name init` | Aplica migrations locais              |
| `bun run backend:prisma:seed`                   | Popula tenants e usuarios demo        |
| `bun run test:security`                         | Valida sanitizacao XSS do editor rico |

Credenciais demo locais do seed:

- `admin@nexo.app` / `demo1234` no tenant `acme`
- `atendente@nexo.app` / `demo1234` no tenant `acme`
- `outsider@nexo.app` / `demo1234` no tenant `orbit`

## Atualizacao Sprint 01.1

A Sprint 01.1 estabilizou o gate local do projeto sem alterar UX.

Validacao completa:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
$env:BUN_INSTALL="$env:USERPROFILE\.bun"
$env:PATH="$env:BUN_INSTALL\bin;$env:PATH"

bun install --frozen-lockfile
docker compose up -d postgres
bun run backend:prisma:generate
bun run backend:prisma:migrate -- --name init
bun run backend:prisma:seed
bun run verify
```

`bun run verify` executa:

- frontend typecheck;
- lint baseline;
- frontend build;
- backend build;
- backend tests, incluindo isolamento de tenant;
- security/XSS tests.

O lint usa baseline legado: erros antigos ficam registrados em `scripts/eslint-baseline.json`, mas novas mensagens por arquivo/regra fazem o gate falhar.

## Atualizacao Sprint 02

Camada organizacional real implementada no backend NestJS:

- Users e TenantMemberships.
- Departments e DepartmentMemberships.
- Roles tenant-scoped.
- Permission catalog + RolePermission.
- Platform Admin separado de Tenant Admin.
- RBAC server-side com `@RequirePermissions`.

Validacao local:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
$env:BUN_INSTALL="$env:USERPROFILE\.bun"
$env:PATH="$env:BUN_INSTALL\bin;$env:PATH"
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public"

docker compose up -d postgres
bun run backend:prisma:generate
bun --cwd backend prisma migrate deploy --schema prisma/schema.prisma
bun run backend:prisma:seed
bun run verify
```

Credenciais demo:

- `admin@nexo.app` / `demo1234` tenant `acme` (`tenant_admin`)
- `supervisor@nexo.app` / `demo1234` tenant `acme`
- `atendente@nexo.app` / `demo1234` tenant `acme`
- `admin-orbit@nexo.app` / `demo1234` tenant `orbit`
- `agent-orbit@nexo.app` / `demo1234` tenant `orbit`
- `platform@nexo.app` / `demo1234` tenant `acme` (`PlatformRole.ADMIN`, role de tenant `agent`)

## Atualizacao Sprint 05

O nucleo de mensagens do inbox migrado usa PostgreSQL/Prisma pela Nexos API:

- `Message` pertence a tenant e conversa.
- Historico, envio de texto e leitura ficam em `/api/conversations/:id/messages`.
- Eventos de sistema sao internos a acoes de conversa.
- `Conversation.lastMessagePreview`, `lastMessageAt` e `unreadCount` sao atualizados pelo backend.
- Midia permanece bloqueada no composer migrado ate existir storage/provider formal.

Regression gate local:

```powershell
cd "C:\Users\Rabel\Downloads\Nexos Project"
$env:BUN_INSTALL="$env:USERPROFILE\.bun"
$env:PATH="$env:BUN_INSTALL\bin;$env:PATH"
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public"

docker compose up -d postgres
bun --cwd backend prisma migrate deploy --schema prisma/schema.prisma
bun run backend:prisma:generate
bun run backend:prisma:seed
bun run verify
```
