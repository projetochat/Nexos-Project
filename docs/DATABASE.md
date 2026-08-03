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

## Sprint 08 - Outbox e lifecycle assincrono

Migration:

- `backend/prisma/migrations/20260803080000_redis_bullmq_outbox/migration.sql`

Alteracoes:

- `MessageStatus` ganhou `QUEUED`.
- `Message` ganhou `sendAttempts` e `lastAttemptAt`.
- Nova entidade `OutboxEvent`.

`OutboxEvent`:

- `tenantId`, `type`, `aggregateId` e `payload` guardam a intencao minima.
- `status`: `PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`.
- `attempts`, `processingAt`, `processedAt` e `lastError` sustentam auditoria e recovery.
- Unique `[tenantId, type, aggregateId]` evita duplicar outbox para a mesma Message.

Fluxo transacional:

```text
Message OUTBOUND QUEUED
+ OutboxEvent PENDING
```

ambos na mesma transacao. Se Redis cair, a Message e o OutboxEvent continuam recuperaveis no PostgreSQL.

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

## Sprint 05 - Messages Prisma

Migration:

- `backend/prisma/migrations/20260730000400_messages_core/migration.sql`

Entidades finais do recorte:

- `Message`: mensagem tenant-owned vinculada a `Conversation`, com autor opcional em `TenantMembership`.

Enums:

- `MessageDirection`: `INBOUND`, `OUTBOUND`, `SYSTEM`.
- `MessageType`: `TEXT`, `IMAGE`, `AUDIO`, `SYSTEM`.
- `MessageStatus`: `CREATED`.

Campos principais de `Message`:

- `tenantId`, `conversationId`, `authorMembershipId`.
- `direction`, `type`, `status`.
- `content`, `clientMessageId`, `readAt`.
- `createdAt`, `updatedAt`.

Constraints e indices:

- FK composta `Message(tenantId, conversationId)` para `Conversation(tenantId, id)`.
- FK para `Tenant` e FK opcional para `TenantMembership`.
- Unicidade por `[tenantId, conversationId, clientMessageId]` para idempotencia de envio.
- Indice por `[tenantId, conversationId, createdAt, id]` para historico paginado.

Decisoes:

- `Conversation.lastMessagePreview` e `Conversation.lastMessageAt` passam a ser atualizados a partir de `Message`.
- `unreadCount` continua denormalizado em `Conversation`, mas leitura grava `Message.readAt` nos inbound pendentes.
- Mensagens `SYSTEM` sao criadas por acoes internas do backend; nao existe rota publica generica para sistema.
- `IMAGE` e `AUDIO` ficam apenas como fronteira explicita de schema. Sem R2, provider ou data URL fake nesta sprint.
- O seed foi estabilizado para nao reduzir o contador de protocolos em execucoes repetidas.

## Sprint 06 - Messaging Adapter

### MessagingConnection

`messaging_connections` representa uma connection canonica de mensageria pertencente a um Tenant.

Campos principais:

- `id`, `tenantId`, `name`
- `providerType`: `DEVELOPMENT`, `EVOLUTION`, `META_CLOUD`
- `status`: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `ERROR`
- `externalReference`: referencia neutra para migracao/configuracao, sem credenciais
- `createdAt`, `updatedAt`

Constraints:

- `@@unique([tenantId, id])`
- `@@unique([tenantId, providerType, externalReference])`
- FKs sempre tenant-scoped.

### Conversation -> Connection

`conversations.connectionId` e opcional para preservar dados legados. A coluna antiga `contacts.instance` permanece temporariamente como filtro/metadata legado do frontend. A partir da Sprint 07, envio outbound nao escolhe connection automaticamente: a conversa precisa estar vinculada a uma connection tenant-scoped.

### Message provider-neutral fields

`messages` ganhou campos genericos:

- `connectionId`
- `providerMessageId`
- `providerStatus`
- `providerErrorCode`
- `providerErrorMessage`
- `providerAcceptedAt`
- `externalMessageId`

Idempotencia inbound usa `@@unique([tenantId, connectionId, externalMessageId])`. O outbound preserva `clientMessageId` por `tenantId + conversationId + clientMessageId`.

Nenhum payload bruto de provider deve ser armazenado nesses campos.

## Sprint 07 - Evolution Provider

Nenhuma tabela provider-specific foi criada. Evolution usa `messaging_connections`:

## Sprint 09 - Realtime

Nao houve migration. Presenca e typing sao efemeros e usam Redis Nexos com TTL, sem persistencia em
PostgreSQL. Eventos de UI nao reutilizam `outbox_events`; a Outbox continua dedicada ao envio para provider.

- `providerType = EVOLUTION`
- `externalReference = instanceName` criado no provider
- `status` sincronizado para `DISCONNECTED`, `CONNECTING`, `CONNECTED` ou `ERROR`

A migration `20260730100700_connections_permissions` adiciona permissoes:

- `connections.read`
- `connections.manage`

Permissoes padrao:

- `tenant_admin`: leitura e gestao
- `supervisor`: leitura e gestao
- `agent`: leitura

### Sprint 07.01

Nao houve nova migration. Para cleanup de connection Evolution removida, mensagens e conversas existentes sao preservadas com `connectionId = null` antes de apagar `messaging_connections`, evitando delecao de historico operacional.

O seed nao cria connection `EVOLUTION`. Connections `DEVELOPMENT` seedadas continuam internas para testes/dev e nao sao exibidas como instancias operacionais em `/instancias`.

## Sprint 08.01 - Identidade inbound e seed limpo

Inbound resolve contato por identidade remota canonica tenant-scoped. O backend normaliza JIDs `@s.whatsapp.net`, `@c.us`, sufixo de device e variantes brasileiras com/sem nono digito antes de decidir criar contato. A resolucao de Conversation reutiliza uma conversa aberta compativel por `tenantId + contactId + connectionId`; se o reconnect preservar o owner do WhatsApp, tambem aceita `tenantId + contactId + ownerPhoneNormalized`. Conversas fechadas continuam gerando uma nova conversa aberta.

Idempotencia inbound ignora replay pelo mesmo `externalMessageId` na mesma connection e, quando o owner esta conhecido, tambem protege contra replay apos reconnect da mesma identidade de owner. Um `externalMessageId` novo sempre deve persistir, atualizar `lastMessagePreview`, `lastMessageAt` e incrementar `unreadCount`.

O seed Prisma agora e minimo por padrao: tenant `homologacao`, admin, membership, roles/permissoes e departamento `Atendimento`. Dados demo de CRM, conversas, mensagens e connection Development so sao criados com `SEED_DEMO_DATA=true`.

Cleanup seguro:

```powershell
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos_0801?schema=public"
bun --cwd backend run cleanup:homologation -- --tenant-slug homologacao
bun --cwd backend run cleanup:homologation -- --tenant-slug homologacao --confirm
```

O script e dry-run por padrao, tenant-scoped, nao remove usuarios/memberships/departamentos essenciais e remove apenas dados marcados por IDs deterministos do seed demo ou connections demo que ficaram orfas.

## Sprint 08.02 - Reset de homologacao e ciclo de Contact

O fluxo oficial para recuperar homologacao e reconstruir o banco, nao limpar manualmente pela UI:

```powershell
$env:DATABASE_URL="postgresql://nexos:nexos_dev_password@localhost:5432/nexos_0802?schema=public"
bun run --cwd backend reset:homologation -- --confirm
```

`backend/scripts/reset-homologation.mjs` recusa producao, exige `--confirm`, valida allowlist de database (`nexos_08*`, `nexos_homolog`, `nexos_test`), dropa/recria apenas o banco alvo, aplica migrations, gera Prisma Client, executa seed minimo e valida contagens.

Contagem obrigatoria apos seed minimo:

- tenants: 1
- users: 1
- memberships: 1
- departments: 1
- contacts/conversations/messages/messagingConnections/outboxEvents: 0

Contact usa soft delete por `archivedAt`. A unicidade continua tenant-scoped por `tenantId + normalizedPhone`. Ao criar um Contact:

- telefone e normalizado;
- Contact ativo equivalente retorna erro canonico `CONTACT_ALREADY_EXISTS`;
- Contact arquivado equivalente e restaurado, preservando historico;
- caso contrario, um novo Contact e criado.

`backend/scripts/audit-homologation-data.mjs` registra contagens, duplicidades de telefone mascaradas e orfaos sem remover dados.
