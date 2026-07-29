# Banco de Dados

## Estado atual de persistencia

IMPLEMENTADO NO MVP: migrations Supabase/Postgres em `supabase/migrations` com tabelas operacionais, RLS, triggers e seeds.

PLANEJADO: modelagem definitiva em PostgreSQL + Prisma em Sprint posterior. Nao ha schema Prisma neste projeto.

## Tabelas Supabase atuais

- `user_roles`, `agents`, `departments`
- `customers`, `contacts`, `tags`, `contact_tags`
- `conversations`, `messages`, `quick_replies`
- `instancias`
- `access_profiles`, `access_profile_instancias`, `access_profile_departments`
- `conversation_protocol_counters`
- `chamados`

## Entidades candidatas observadas no frontend

| Entidade candidata      | Evidencia                                     | Confianca  |
| ----------------------- | --------------------------------------------- | ---------- |
| Tenant/Empresa SaaS     | `/admin/*`, `tenants` mock, impersonacao      | Provavel   |
| Usuario/Agente          | `agents`, login, atendentes, perfil           | Confirmado |
| Role/Perfil             | `user_roles`, `access_profiles`, permissoes   | Confirmado |
| Departamento/Fila       | `departments`, filas derivadas, transferencia | Confirmado |
| Cliente                 | `customers`, `/clientes`                      | Confirmado |
| Contato                 | `contacts`, `/contatos`, inbox                | Confirmado |
| Conversa                | `conversations`, inbox/historico/simulador    | Confirmado |
| Mensagem                | `messages`, chat, midia                       | Confirmado |
| Tag                     | `tags`, `contact_tags`                        | Confirmado |
| Instancia/Canal         | `instancias`, `/instancias`                   | Confirmado |
| Chamado                 | `chamados`, `/chamados`                       | Confirmado |
| Campanha                | mock store e `/campanhas`                     | Provavel   |
| Plano/Assinatura/Fatura | Super Admin mock                              | Provavel   |
| Log/Auditoria           | Super Admin mock                              | Provavel   |

## Observacoes para Sprint futura

- O schema atual nao possui `tenant_id` nas tabelas operacionais.
- Midia e armazenada como texto/data URL, nao em bucket.
- A modelagem final devera partir da matriz frontend -> backend, nao copiar cegamente o schema Supabase atual.

## Sprint 01 - PostgreSQL + Prisma

Criado `backend/prisma/schema.prisma` com o primeiro nucleo multi-tenant:

- `Tenant`: organizacao SaaS isolada por `slug`.
- `User`: usuario autenticavel com `passwordHash` e status.
- `TenantMembership`: vincula usuario a tenant e role.
- `ProtectedRecord`: entidade minima protegida por `tenantId` para testar isolamento.

Enums:

- `UserStatus`: `ACTIVE`, `DISABLED`.
- `Role`: `SUPER_ADMIN`, `ADMIN`, `SUPERVISOR`, `OPERATOR`.

Migration inicial:

- `backend/prisma/migrations/20260729214245_init/migration.sql`

Seed:

- `backend/prisma/seed.ts`
- tenants `acme` e `orbit`
- usuarios demo e registros protegidos de tenants distintos

O schema Supabase legado permanece preservado em `supabase/migrations` para a migracao incremental.
