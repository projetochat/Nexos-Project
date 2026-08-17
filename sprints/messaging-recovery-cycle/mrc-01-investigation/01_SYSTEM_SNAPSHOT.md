# System Snapshot

## Repository

- Branch: `hotfix/rc-15-2-evolution-contract-normalization`
- HEAD: `1e6091f7bc2b151fc1f3eabbb2042c647dfb6c1e`
- Recent commit title: `feat: rework sprint rc 15`
- Worktree: dirty, with messaging, Evolution, Prisma, frontend inbox and documentation changes.

Important uncommitted paths include:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260806120000_messaging_core_completion/`
- `backend/src/messaging/**`
- `backend/src/conversations/**`
- `src/lib/nexos-api.ts`
- `src/routes/inbox.$conversationId.tsx`
- `docs/MESSAGING.md`
- `sprints/rc-sprint-15-2/**`

Unrelated dirty change observed:

- `backend/src/operations/operations.service.ts` has numeric coercion in pagination. It was not modified by MRC-01.

## Runtime Versions

- Bun: `1.3.14`
- Node: `v24.14.0`
- Docker: `29.1.3`
- Docker Desktop: `4.55.0`
- Docker Compose: `v2.40.3-desktop.1`

## Containers

Running relevant containers:

- `nexos-evolution-api`: `evoapicloud/evolution-api:v2.3.7`, port `127.0.0.1:8080->8080`
- `nexos-postgres`: `postgres:16-alpine`, port `5432`
- `nexos-redis`: `redis:7.4-alpine`, port `6379`
- `nexos-evolution-postgres`: `postgres:15-alpine`
- `nexos-evolution-redis`: `redis:7.4-alpine`

## Health

Nexos health returned:

- `database`: up
- `redis`: up
- `queue`: up
- `realtime`: up
- `storage`: up
- storage provider: local

Evolution health returned:

- status `200`
- version `2.3.7`
- client `evolution_exchange`
