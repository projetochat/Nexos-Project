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

## Sprint 02 - Camada organizacional Prisma

Migration:

- `backend/prisma/migrations/20260730000100_organization_rbac/migration.sql`

Entidades finais do recorte:

- `Tenant`: organizacao SaaS.
- `User`: identidade global, com `platformRole` separado de roles de tenant.
- `TenantMembership`: relacao `User <-> Tenant`, com `status` e `roleId`.
- `Department`: departamento tenant-owned, com `active`, `color` e `description`.
- `DepartmentMembership`: relacao `TenantMembership <-> Department`.
- `Role`: perfil tenant-scoped.
- `Permission`: catalogo controlado pelo backend.
- `RolePermission`: relacao N:N de role para permissoes.

Removido:

- `ProtectedRecord`, artefato da Sprint 01 usado apenas para provar isolamento.

Constraints e indices:

- `Tenant.slug` unico.
- `User.email` unico global.
- `TenantMembership` unico por `[tenantId, userId]`.
- `TenantMembership` tambem unico por `[tenantId, id]` para FKs compostas.
- `Department` unico por `[tenantId, name]` e `[tenantId, id]`.
- `Role` unico por `[tenantId, key]` e `[tenantId, id]`.
- `DepartmentMembership` unico por `[departmentId, membershipId]`.
- FKs compostas em `DepartmentMembership` impedem associar membership de um tenant a departamento de outro.
- FK composta em `TenantMembership.role` impede role de outro tenant.

Roles tenant-scoped:

- `tenant_admin`
- `supervisor`
- `agent`

Platform Admin:

- `User.platformRole = ADMIN`
- Nao substitui `Role.key = tenant_admin`.

## Sprint 03 - CRM Prisma

Migration:

- `backend/prisma/migrations/20260730000200_contacts_crm/migration.sql`

Entidades finais do recorte:

- `Customer`: cliente tenant-owned, com `name`, `email`, `phone`, `notes`, `responsibleContactName`, `color` e `archivedAt`.
- `Contact`: contato tenant-owned, com `name`, `phone`, `normalizedPhone`, `email`, `customerId`, `departmentId`, `departmentName`, `companyRole`, `instance`, `avatarUrl` e `archivedAt`.
- `Tag`: etiqueta tenant-owned.
- `ContactTag`: relacao N:N entre contato e etiqueta.

Constraints e indices:

- `Customer` unico por `[tenantId, id]`; indices por nome e arquivamento.
- `Contact` unico por `[tenantId, id]` e `[tenantId, normalizedPhone]`.
- `Tag` unico por `[tenantId, name]`.
- `ContactTag` unico por `[contactId, tagId]`.
- FKs de `Contact.customerId`, `Contact.departmentId`, `ContactTag.contactId` e `ContactTag.tagId`.

Decisoes:

- `Customer` e `Contact` sao dominios distintos: cliente representa a empresa/pessoa juridica atendida; contato representa a pessoa que conversa pelo WhatsApp.
- Contatos podem ficar sem cliente para preservar o fluxo de vinculacao posterior em `/clientes`.
- Delete funcional arquiva (`archivedAt`) e listas padrao ocultam arquivados.
- Departamento no CRM preserva `departmentName` para compatibilidade com o formulario existente e aceita `departmentId` opcional para evolucao com a camada organizacional.
- O schema Supabase legado permanece apenas para fluxos ainda nao migrados.

## Sprint 04 - Conversations Prisma

Migration:

- `backend/prisma/migrations/20260730000300_conversations/migration.sql`

Entidades finais do recorte:

- `Conversation`: conversa tenant-owned vinculada a `Contact`, opcionalmente a `Department` e a `TenantMembership` atribuida.
- `ConversationProtocolCounter`: contador por tenant para emissao de protocolos sequenciais.

Enum:

- `ConversationStatus`: `ABERTA`, `EM_ANDAMENTO`, `AGUARDANDO`, `FECHADA`.

Campos principais de `Conversation`:

- `tenantId`, `contactId`, `departmentId`, `assignedMembershipId`.
- `status`, `protocol`, `isGroup`.
- `unreadCount`, `lastMessagePreview`, `lastMessageAt`.
- `archivedAt`, `closedAt`, `createdAt`, `updatedAt`.

Constraints e indices:

- `Conversation` unico por `[tenantId, id]`.
- `Conversation.protocol` unico por `[tenantId, protocol]`; Postgres permite multiplos `NULL`, preservando leads sem protocolo.
- Indices por tenant/status/arquivamento, departamento, assignee, contato e ultima mensagem.
- FKs para tenant, contato, departamento e membership atribuida.

Decisoes:

- Isolamento de tenant e validado no backend para toda criacao e mutacao.
- Escopo operacional de departamento e aplicado no backend: admin ve tudo; supervisor e agent veem departamentos permitidos ou conversas atribuidas a eles.
- Transferencia de departamento valida tenant e escopo do operador; se o assignee nao pertence ao novo departamento, a conversa e desatribuida.
- `Message` nao foi modelado nesta sprint; campos `unreadCount`, `lastMessagePreview` e `lastMessageAt` sustentam a lista ate a migracao de mensagens na Sprint 05.
- Nao ha hard delete de conversa.
