# SPRINT 03 - RELATORIO FINAL

## 1. Status

PASS.

Gate final:

```text
READY FOR SPRINT 04
```

## 2. Resumo executivo

A Sprint 03 migrou o dominio de CRM (`/clientes` e `/contatos`) para a Nexos API em NestJS, Prisma e PostgreSQL. Clientes, contatos, etiquetas e vinculos agora sao tenant-scoped, autorizados por permissions server-side e persistidos no banco local.

Supabase foi removido dessas duas superficies. Os demais fluxos legados continuam preservados.

## 3. Baseline inicial

- Branch inicial: `sprint/02-organization-rbac`
- HEAD inicial: `e576cdee8417d9a9ddbc04c5f6fade8e301a3f99`
- Branch da sprint: `sprint/03-contacts-crm`
- Git status inicial: clean
- Node: `v24.14.0`
- Bun: `1.3.14`
- Docker: `29.1.3`
- Docker Compose: `v2.40.3-desktop.1`
- PostgreSQL container: `nexos-postgres` healthy
- Verify inicial: PASS

## 4. Decisao de dominio

`Customer` e `Contact` sao entidades distintas:

- `Customer`: cliente/empresa/pessoa juridica atendida.
- `Contact`: pessoa que conversa pelo WhatsApp.

Um contato pode ficar sem cliente para preservar o fluxo de contatos disponiveis para vinculacao em `/clientes`.

## 5. Schema final

Adicionados ao Prisma:

- enum `ContactCompanyRole`
- `Customer`
- `Contact`
- `Tag`
- `ContactTag`

Constraints relevantes:

- `Contact` unico por `[tenantId, normalizedPhone]`.
- `Tag` unico por `[tenantId, name]`.
- `ContactTag` unico por `[contactId, tagId]`.
- Indices por tenant, nome, cliente, departamento, instancia e arquivamento.

## 6. Migration

- Criada e aplicada: `backend/prisma/migrations/20260730000200_contacts_crm/migration.sql`
- Aplicada localmente com `prisma migrate deploy`.
- Seed executado apos migration.

## 7. API CRM

Base local: `http://localhost:3001/api`.

Endpoints:

- `GET /api/crm/customers`
- `GET /api/crm/customers/:id`
- `POST /api/crm/customers`
- `PATCH /api/crm/customers/:id`
- `DELETE /api/crm/customers/:id`
- `GET /api/crm/customers/:id/contacts`
- `GET /api/crm/contacts`
- `GET /api/crm/contacts/options`
- `GET /api/crm/contacts/:id`
- `POST /api/crm/contacts`
- `PATCH /api/crm/contacts/:id`
- `DELETE /api/crm/contacts/:id`
- `GET /api/crm/tags`

## 8. Autorizacao

Novas permissions:

- `crm.read`
- `crm.manage`

Matriz aplicada:

- `tenant_admin`: `crm.read`, `crm.manage`
- `supervisor`: `crm.read`, `crm.manage`
- `agent`: `crm.read`

Todas as rotas CRM usam JWT + permissions. O tenant e derivado da membership autenticada.

## 9. Telefone

Regra implementada:

- O backend remove caracteres nao numericos.
- Telefones BR locais com 10 ou 11 digitos recebem prefixo `+55`.
- O campo canonico e `normalizedPhone`.
- Duplicidade no mesmo tenant retorna `409`.

## 10. Frontend migrado

- `src/routes/clientes.tsx`
- `src/routes/contatos.tsx`
- `src/lib/nexos-api.ts`

As telas passam a usar `crmApi` e nao importam `CUSTOMERS`, `CONTACTS` ou `CATALOG` de `src/lib/mvp.ts`.

## 11. CORS e ambiente local

Preservado:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001/api`

`backend/src/main.ts` agora usa allowlist explicita por `FRONTEND_ORIGIN`, com default `http://localhost:5173`. Multiplas origens podem ser informadas por virgula. Nao foi introduzido `origin: *`.

## 12. Tests

Backend e2e atualizado para 14 testes:

- health/auth/RBAC existentes
- CRM read para agent
- CRM write denied para agent
- CRUD customer/contact
- busca e paginacao com `pageSize`
- archive/delete
- tenant isolation
- cross-tenant link blocked
- input invalido
- telefone duplicado por tenant

Coverage formal nao foi configurado nesta sprint; cenarios criticos foram cobertos por e2e.

## 13. Validacoes automaticas

Executadas:

```text
bun run typecheck: PASS
bun run lint: PASS dentro do baseline legado
bun run build: PASS
bun --cwd backend run build: PASS
bun --cwd backend run test: PASS, 14 tests
bun run verify: PASS
bun run verify final: PASS
```

`bun run verify` final:

- frontend typecheck: PASS
- frontend lint baseline: PASS, `3911 errors` e `13 warnings` dentro do baseline legado
- frontend build: PASS
- backend build: PASS
- backend test: PASS, 14 tests
- security XSS: PASS, 3 tests

## 14. Smoke local

API smoke com `Origin: http://localhost:5173`:

- `GET http://localhost:3001/api/health`: PASS
- `POST http://localhost:3001/api/auth/login`: PASS
- `GET http://localhost:3001/api/crm/customers?pageSize=5`: PASS
- `GET http://localhost:3001/api/crm/contacts?pageSize=5`: PASS

Frontend HTTP smoke:

- `GET http://localhost:5173`: 200
- `GET http://localhost:5173/clientes`: 200
- `GET http://localhost:5173/contatos`: 200

Durante smoke foi encontrado e corrigido bug de query string `pageSize` chegando como string ao Prisma.

## 15. Checklist manual obrigatoria

```text
[X] http://localhost:5173 abre corretamente
[X] Login Nexos funciona
[X] Frontend comunica com http://localhost:3001/api
[X] /clientes funciona com Nexos API
[X] /contatos funciona com Nexos API
[X] Nenhum "Failed to fetch" nas funcionalidades migradas
```

## 16. Supabase

Removido das superficies migradas:

- `/clientes`
- `/contatos`

Ainda legado fora do escopo Sprint 03:

- `src/lib/mvp.ts` para conversas, mensagens, quick replies, relatorios e telas nao migradas.
- `src/integrations/supabase/**`
- Supabase migrations historicas.

## 17. Arquivos criados

- `backend/prisma/migrations/20260730000200_contacts_crm/migration.sql`
- `backend/src/crm/**`
- `sprints/sprint-03/RELATORIO.md`

## 18. Arquivos alterados

- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/app.module.ts`
- `backend/src/auth/permissions.constants.ts`
- `backend/src/main.ts`
- `backend/package.json`
- `backend/scripts/copy-prisma-client.mjs`
- `backend/test/app.e2e-spec.ts`
- `src/lib/nexos-api.ts`
- `src/routes/clientes.tsx`
- `src/routes/contatos.tsx`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/AUTHENTICATION.md`
- `docs/CHANGELOG.md`
- `sprints/README.md`

## 19. Riscos e divida tecnica

- Coverage formal ainda nao configurado.
- Coexistencia com Supabase legado continua para fluxos fora de CRM.
- Departamento no CRM ainda preserva `departmentName` livre para compatibilidade; `departmentId` existe para evolucao.

## 20. Final Git state

Antes do commit final:

- Branch: `sprint/03-contacts-crm`
- HEAD: `e576cde`
- Worktree com alteracoes da sprint aguardando commit.
- Push: nao realizado.

## 21. Gate

READY FOR SPRINT 04
