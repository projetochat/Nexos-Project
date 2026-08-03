# API e Requisitos de Dados

## Estado atual

Nao ha endpoints REST customizados implementados em `src/routes/api`. O MVP usa:

- Supabase Auth.
- Supabase PostgREST via `supabase.from(...)`.
- Supabase Realtime em dashboard, inbox e simulador.
- Server function `ensureDemoUsers`.
- Mock store e arrays hardcoded em telas nao migradas.

## Chamadas reais existentes

- Auth: `getUser`, `getSession`, `onAuthStateChange`, `signInWithPassword`, `signOut`, `auth.admin.createUser`.
- Dominio operacional: `contacts`, `customers`, `departments`, `agents`, `tags`, `contact_tags`, `quick_replies`, `conversations`, `messages`, `instancias`, `access_profiles`, `access_profile_instancias`, `access_profile_departments`, `chamados`.
- RPC: `assign_conversation_protocolo`.
- Realtime: canais `postgres_changes` para `messages` e `conversations`; dashboard tambem assina `messages`.

## Server function

`ensureDemoUsers`:

- Metodo TanStack: `POST`.
- Payload: nenhum.
- Retorno: `{ ok: true }`.
- Variaveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Observacao: nao usa `requireSupabaseAuth`.

## Requisitos de dados ainda sem contrato de API

| Funcionalidade      | Necessidade futura                                                     |
| ------------------- | ---------------------------------------------------------------------- |
| Auth/usuarios       | autenticar, listar, criar, atualizar, atribuir roles/perfis            |
| Conversas           | listar, assumir, transferir, encerrar, reabrir, marcar leitura         |
| Mensagens           | enviar texto/audio/imagem, listar historico, status de leitura         |
| Contatos/clientes   | CRUD, vinculos, tags, busca e paginacao                                |
| Departamentos/filas | CRUD, configuracao e roteamento                                        |
| Instancias/canais   | CRUD, conectar canal, QR/status, mensagens automaticas                 |
| Chamados            | criar, editar, listar e anexar midia                                   |
| Relatorios          | agregacoes por periodo, agente, departamento, cliente, instancia e tag |
| Campanhas           | CRUD, segmentacao, disparo, metricas e retry                           |
| Super Admin         | tenants, planos, assinaturas, financeiro, logs e auditoria             |

Na Sprint 00 nao foram definidos URL, metodo HTTP, DTO, controller ou schema definitivo.

## Sprint 01 - API NestJS

Base local: `http://localhost:3001/api`.

| Metodo | Endpoint              | Auth       | Descricao                                                                   |
| ------ | --------------------- | ---------- | --------------------------------------------------------------------------- |
| `GET`  | `/health`             | Publico    | Verifica API e PostgreSQL com `SELECT 1`                                    |
| `POST` | `/auth/login`         | Publico    | Autentica por email, senha e `tenantSlug`                                   |
| `POST` | `/auth/refresh`       | Publico    | Emite novo access token a partir de refresh token                           |
| `POST` | `/auth/logout`        | Publico    | Logout stateless; cliente descarta tokens                                   |
| `GET`  | `/me`                 | Bearer JWT | Retorna usuario, tenant e permissoes derivadas                              |
| `GET`  | `/tenant-records/:id` | Bearer JWT | Retorna apenas registros do tenant autenticado; outros tenants retornam 404 |

Exemplo de login:

```json
{
  "email": "admin@nexo.app",
  "password": "demo1234",
  "tenantSlug": "acme"
}
```

O token JWT inclui `sub`, `tenantId`, `membershipId`, `role` e `typ`. O tenant efetivo e selecionado a partir da membership persistida, nao confiado como escopo livre do cliente.

## Sprint 02 - APIs organizacionais

Base local: `http://localhost:3001/api`.

Todas as rotas abaixo usam `Authorization: Bearer <accessToken>` e derivam `tenantId` da membership do JWT. `tenantId` livre enviado pelo cliente nao e aceito como escopo.

| Metodo   | Endpoint                                 | Permission           | Descricao                                            |
| -------- | ---------------------------------------- | -------------------- | ---------------------------------------------------- |
| `GET`    | `/me`                                    | JWT                  | Usuario, tenant, departamentos e permissoes atuais   |
| `GET`    | `/users`                                 | `users.read`         | Lista memberships do tenant                          |
| `GET`    | `/users/:id`                             | `users.read`         | Consulta membership do tenant                        |
| `POST`   | `/users`                                 | `users.manage`       | Cria usuario global ou adiciona membership ao tenant |
| `PATCH`  | `/users/:id`                             | `users.manage`       | Edita usuario, role, status e departamentos          |
| `PATCH`  | `/users/:id/activate`                    | `users.manage`       | Ativa membership                                     |
| `PATCH`  | `/users/:id/deactivate`                  | `users.manage`       | Desativa membership                                  |
| `GET`    | `/departments`                           | `departments.read`   | Lista departamentos do tenant                        |
| `GET`    | `/departments/:id`                       | `departments.read`   | Consulta departamento do tenant                      |
| `POST`   | `/departments`                           | `departments.manage` | Cria departamento                                    |
| `PATCH`  | `/departments/:id`                       | `departments.manage` | Edita departamento                                   |
| `DELETE` | `/departments/:id`                       | `departments.manage` | Desativa departamento                                |
| `POST`   | `/departments/:id/members`               | `departments.manage` | Associa membership ao departamento                   |
| `DELETE` | `/departments/:id/members/:membershipId` | `departments.manage` | Remove associacao                                    |
| `GET`    | `/permissions`                           | `roles.read`         | Lista catalogo de permission keys                    |
| `GET`    | `/roles`                                 | `roles.read`         | Lista perfis de acesso do tenant                     |
| `GET`    | `/roles/:id`                             | `roles.read`         | Consulta perfil                                      |
| `POST`   | `/roles`                                 | `roles.manage`       | Cria perfil com permission keys validas              |
| `PATCH`  | `/roles/:id`                             | `roles.manage`       | Edita perfil e permissoes                            |
| `DELETE` | `/roles/:id`                             | `roles.manage`       | Remove perfil customizado nao usado                  |

Erros principais:

- `401`: token ausente/invalido, membership inativa ou usuario desativado.
- `403`: permission ausente.
- `400`: DTO invalido, role/permission/departamento inexistente no tenant.
- `404`: recurso de outro tenant ou inexistente.

## Sprint 03 - APIs CRM

Base local validada: `http://localhost:3001/api`.

## Sprint 08 - Envio assincrono

`POST /api/conversations/:conversationId/messages` continua aceitando:

```json
{
  "content": "Texto",
  "clientMessageId": "uuid-opcional"
}
```

## Sprint 10 - Inbox domain

Base local validada: `http://localhost:3001/api`.

A Inbox operacional usa Nexos API como fonte unica. As rotas `/inbox`, `/inbox/` e
`/inbox/$conversationId` nao importam `@/lib/mvp`, Supabase ou aliases legados de runtime.

| Metodo   | Endpoint                         | Permission                  | Descricao                                      |
| -------- | -------------------------------- | --------------------------- | ---------------------------------------------- |
| `GET`    | `/tags`                          | `crm.read`                  | Lista Tags ativas do tenant                    |
| `POST`   | `/tags`                          | `chat.tags.manage`          | Cria Tag tenant-scoped com nome normalizado    |
| `PATCH`  | `/tags/:id`                      | `chat.tags.manage`          | Edita nome/cor da Tag ativa                    |
| `DELETE` | `/tags/:id`                      | `chat.tags.manage`          | Arquiva Tag                                    |
| `POST`   | `/contacts/:id/tags/:tagId`      | `chat.tags.use`             | Aplica Tag existente a Contact do tenant       |
| `DELETE` | `/contacts/:id/tags/:tagId`      | `chat.tags.use`             | Remove Tag de Contact                          |
| `GET`    | `/quick-replies`                 | `chat.quick_replies.read`   | Lista respostas rapidas globais/departamento   |
| `POST`   | `/quick-replies`                 | `chat.quick_replies.manage` | Cria resposta rapida                           |
| `PATCH`  | `/quick-replies/:id`             | `chat.quick_replies.manage` | Edita resposta rapida ativa                    |
| `DELETE` | `/quick-replies/:id`             | `chat.quick_replies.manage` | Arquiva resposta rapida                        |
| `GET`    | `/conversations/:id`             | `conversations.read`        | Inclui contact tags/customer e connection      |

Quick Reply selecionada no frontend apenas insere o texto no composer; envio continua separado em
`POST /api/conversations/:conversationId/messages`.

RBAC:

- `tenant_admin`: gerencia e usa Tags, gerencia e le Quick Replies.
- `supervisor`: gerencia e usa Tags, gerencia e le Quick Replies.
- `agent`: usa Tags existentes e le Quick Replies; nao cria/edita/arquiva.

Resposta esperada apos persistencia:

```json
{
  "status": "queued"
}
```

O endpoint nao aguarda Evolution nem retorna `sent` no request HTTP. O envio real ocorre no worker BullMQ. Estados visiveis para mensagem outbound:

- `queued`
- `sending`
- `sent`
- `failed`
- `delivered`
- `read`

Repetir o mesmo `clientMessageId` preserva idempotencia: uma Message, um OutboxEvent logico e um job deterministico.

Todas as rotas abaixo usam `Authorization: Bearer <accessToken>` e derivam `tenantId` da membership autenticada. O frontend nao envia `tenantId` para escopo.

| Metodo   | Endpoint                      | Permission   | Descricao                                                      |
| -------- | ----------------------------- | ------------ | -------------------------------------------------------------- |
| `GET`    | `/crm/customers`              | `crm.read`   | Lista clientes com `q`, `page` e `pageSize` server-side        |
| `GET`    | `/crm/customers/:id`          | `crm.read`   | Consulta cliente do tenant                                     |
| `POST`   | `/crm/customers`              | `crm.manage` | Cria cliente                                                   |
| `PATCH`  | `/crm/customers/:id`          | `crm.manage` | Edita cliente                                                  |
| `DELETE` | `/crm/customers/:id`          | `crm.manage` | Arquiva cliente e desvincula contatos ativos                   |
| `GET`    | `/crm/customers/:id/contacts` | `crm.read`   | Lista contatos vinculados a um cliente                         |
| `GET`    | `/crm/contacts`               | `crm.read`   | Lista contatos com busca, paginacao e filtros server-side      |
| `GET`    | `/crm/contacts/options`       | `crm.read`   | Opcoes de filtros de contatos e tags                           |
| `GET`    | `/crm/contacts/:id`           | `crm.read`   | Consulta contato do tenant                                     |
| `POST`   | `/crm/contacts`               | `crm.manage` | Cria contato com telefone normalizado, cliente opcional e tags |
| `PATCH`  | `/crm/contacts/:id`           | `crm.manage` | Edita contato, vinculo de cliente e tags                       |
| `DELETE` | `/crm/contacts/:id`           | `crm.manage` | Arquiva contato                                                |
| `GET`    | `/crm/tags`                   | `crm.read`   | Lista etiquetas do tenant                                      |

Filtros de `/crm/contacts`:

- `q`: busca por nome, telefone, email ou cliente.
- `linked`: `all`, `linked`, `unlinked`.
- `instance`: instancia/canal.
- `department`: nome do departamento operacional exibido no CRM.
- `customerId`: cliente vinculado.
- `page`, `pageSize`: paginacao server-side; `pageSize` maximo 100.

Contrato de telefone:

- O backend remove caracteres nao numericos.
- Telefones BR locais com 10 ou 11 digitos sao persistidos como `+55...`.
- O indice unico e `[tenantId, normalizedPhone]`.
- Duplicidade no mesmo tenant retorna `409`.

## Sprint 04 - APIs Conversations

Base local validada: `http://localhost:3001/api`.

Todas as rotas abaixo usam `Authorization: Bearer <accessToken>`, derivam `tenantId` da membership autenticada e aplicam escopo operacional server-side.

| Metodo  | Endpoint                        | Permission             | Descricao                                                                       |
| ------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `GET`   | `/conversations`                | `conversations.read`   | Lista conversas com paginacao, filtros, busca, sort e contadores por aba        |
| `GET`   | `/conversations/:id`            | `conversations.read`   | Consulta conversa visivel ao usuario                                            |
| `POST`  | `/conversations`                | `conversations.assign` | Cria conversa para contato do tenant; pode atribuir ao usuario atual            |
| `PATCH` | `/conversations/:id/assignee`   | `conversations.assign` | Atribui, assume ou desatribui conversa                                          |
| `PATCH` | `/conversations/:id/department` | `conversations.manage` | Transfere conversa para departamento ativo e permitido                          |
| `PATCH` | `/conversations/:id/status`     | `conversations.manage` | Altera status explicitamente: `aberta`, `em_andamento`, `aguardando`, `fechada` |

Filtros de `/conversations`:

- `tab`: `ativas`, `standby`, `fila`, `leads`.
- `source`: `todos`, `humano`, `bots`.
- `onlyUnread`: boolean.
- `q`: busca por protocolo, preview, contato, telefone ou cliente.
- `customerId`, `instance`, `contactId`, `status`, `departmentId`.
- `sort`: `lastMessageAt`, `createdAt`, `status`.
- `direction`: `asc`, `desc`.
- `page`, `pageSize`: paginacao server-side; `pageSize` maximo 100.

Decisao de visibilidade operacional:

- `tenant_admin`: ve todas as conversas do tenant.
- `supervisor`: ve conversas dos departamentos aos quais sua membership pertence e conversas atribuidas a ele.
- `agent`: ve conversas dos departamentos aos quais sua membership pertence e conversas atribuidas a ele.

Fronteira Sprint 04:

- `Conversation` e do backend Nexos.
- `Message` permanece legado ate Sprint 05; envio/listagem de mensagens no inbox ainda usa a camada antiga.
- Nao ha endpoint `DELETE`; encerramento usa status `fechada` e arquivamento futuro deve preservar auditoria.

## Sprint 05 - APIs Messages

Base local validada: `http://localhost:3001/api`.

Todas as rotas abaixo usam `Authorization: Bearer <accessToken>`, derivam `tenantId` da membership autenticada e reaproveitam o escopo operacional de `Conversation`.

| Metodo  | Endpoint                                       | Permission           | Descricao                                                           |
| ------- | ---------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `GET`   | `/conversations/:conversationId/messages`      | `conversations.read` | Lista historico com `limit` e `cursor` para paginacao backwards     |
| `POST`  | `/conversations/:conversationId/messages`      | `messages.send`      | Persiste mensagem `TEXT` outbound do atendente responsavel          |
| `PATCH` | `/conversations/:conversationId/messages/read` | `conversations.read` | Marca mensagens inbound como lidas e zera `unreadCount` da conversa |

Contrato de envio:

- Payload: `{ "content": "texto", "clientMessageId": "opcional-idempotencia" }`.
- `content` e obrigatorio, trimado e limitado a 4000 caracteres.
- `clientMessageId` e opcional, limitado a 100 caracteres e idempotente por `[tenantId, conversationId, clientMessageId]`.
- Envio so e permitido quando a conversa esta atribuida ao usuario atual, nao esta `fechada` e nao esta `aguardando`.
- Nao ha envio de midia nesta sprint. `IMAGE` e `AUDIO` existem como fronteira de schema, sem provider/storage.

Contrato de historico:

- Resposta: `{ items: Message[], nextCursor: string | null }`.
- Ordenacao de retorno: cronologica ascendente dentro da pagina.
- `cursor` e o `id` da mensagem mais antiga ja recebida; a proxima chamada retorna itens anteriores.
- Mensagens de sistema sao criadas apenas internamente em acoes de conversa; nao existe endpoint publico para criar `SYSTEM`.

Efeitos transacionais:

- Criar mensagem atualiza `Conversation.lastMessagePreview` e `Conversation.lastMessageAt`.
- Marcar leitura atualiza `Message.readAt` para inbound pendentes e `Conversation.unreadCount = 0`.
- Acoes estruturais de conversa geram eventos `SYSTEM` internos para inicio, atribuicao, transferencia, fila, stand by e encerramento.

## Sprint 06 - Messaging Adapter

Nenhum endpoint publico provider-specific foi adicionado.

O endpoint existente `POST /conversations/:conversationId/messages` continua recebendo somente payload canonico do produto:

```json
{
  "content": "texto",
  "clientMessageId": "uuid-opcional"
}
```

O frontend nao escolhe `provider`. A resolucao ocorre no backend pela Conversation/Connection tenant-scoped. Contratos internos de outbound, inbound e status ficam na camada de arquitetura, nao na API publica.

## Sprint 07 - Evolution API Provider

Base local: `http://localhost:3001/api`.

Rotas autenticadas:

| Metodo   | Endpoint                                  | Permission            | Descricao                                          |
| -------- | ----------------------------------------- | --------------------- | -------------------------------------------------- |
| `GET`    | `/messaging/connections`                  | `connections.read`    | Lista connections do tenant                        |
| `GET`    | `/messaging/connections/:id`              | `connections.read`    | Consulta connection tenant-scoped                  |
| `GET`    | `/messaging/connections/health/evolution` | `connections.read`    | Verifica configuracao/saude do provider            |
| `POST`   | `/messaging/connections/evolution`        | `connections.manage`  | Cria instancia Evolution e registra connection     |
| `GET`    | `/messaging/connections/:id/status`       | `connections.read`    | Consulta status real da instancia Evolution        |
| `GET`    | `/messaging/connections/:id/qr`           | `connections.manage`  | Solicita QR Code de conexao                        |
| `PATCH`  | `/messaging/connections/:id/logout`       | `connections.manage`  | Desconecta instancia Evolution                     |
| `DELETE` | `/messaging/connections/:id`              | `connections.manage`  | Remove instance Evolution e limpa connection local |
| `POST`   | `/webhooks/evolution`                     | JWT Evolution webhook | Recebe eventos provider-specific                   |

Payload de criacao:

```json
{
  "name": "WhatsApp Comercial"
}
```

O endpoint de webhook nao usa JWT de usuario. Ele exige `Authorization: Bearer <token>` assinado com `EVOLUTION_WEBHOOK_SECRET` e claims `app=evolution` e `action=webhook`.

O endpoint existente `POST /conversations/:conversationId/messages` agora envia texto real via Evolution quando a conversa possui `connectionId` apontando para uma connection `EVOLUTION` conectada. Sem connection configurada, o envio falha com erro de negocio em vez de escolher provider automaticamente.

## Sprint 07.01 - Evolution hardening

- `/messaging/connections` lista somente connections Evolution operacionais; o Development Provider permanece interno/test-only.
- Criacao Evolution executa `POST /instance/create` e depois `POST /webhook/set/:instanceName`.
- `GET /messaging/connections/:id/status` reconcilia Nexos DB contra `fetchInstances`/`connectionState`.
- QR de instance ausente retorna erro de negocio `INSTANCE_NOT_FOUND`, nao 500 generico.
- `DELETE /messaging/connections/:id` remove a instance na Evolution quando ela existe e limpa a connection local com desvinculo seguro de mensagens/conversas.

## Sprint 08.01 - Webhook inbound/reconnect

`POST /api/webhooks/evolution` preserva JWT bearer assinado por `EVOLUTION_WEBHOOK_SECRET`. Payloads inbound `MESSAGES_UPSERT` normalizam `remoteJid` e reutilizam Contact/Conversation compativeis. Replays pelo mesmo `externalMessageId` retornam resposta OK sem criar outra Message, sem alterar unread e sem atualizar lastMessage.

Eventos `CONNECTION_UPDATE` conectados atualizam owner identity e disparam ensure idempotente do webhook Evolution. Falha nesse ensure e registrada de forma sanitizada e nao transforma o callback em erro 500.

## Sprint 08.02 - Contact lifecycle

`POST /api/crm/contacts` normaliza telefone por tenant. Se ja houver Contact ativo com o mesmo telefone normalizado, retorna `409` com:

```json
{
  "code": "CONTACT_ALREADY_EXISTS",
  "message": "Ja existe um contato ativo com este telefone."
}
```

Se houver Contact arquivado com o mesmo telefone, o endpoint restaura o registro existente, preserva o mesmo `id` e retorna `lifecycle: "restored"`. Novo registro retorna `lifecycle: "created"`.

`DELETE /api/crm/contacts/:id` e soft delete: marca `archivedAt`, remove o Contact das listas operacionais e preserva historico. `PATCH /api/crm/contacts/:id` continua operando apenas sobre Contact ativo.

## Sprint 08.03 - Auth consolidation

Base local oficial: `http://localhost:3001/api`.

| Metodo | Endpoint        | Auth       | Descricao                                                    |
| ------ | --------------- | ---------- | ------------------------------------------------------------ |
| `GET`  | `/health`       | Publico    | Verifica API + database e informa Redis separadamente        |
| `POST` | `/auth/login`   | Publico    | Autentica por email/senha; `tenantSlug` e opcional           |
| `POST` | `/auth/refresh` | Publico    | Emite novo access token a partir de refresh token valido     |
| `GET`  | `/auth/me`      | Bearer JWT | Retorna user, tenant, membership, departamentos e permissoes |
| `POST` | `/auth/logout`  | Publico    | Logout stateless; cliente limpa sessao local                 |

Login de homologacao:

```json
{
  "email": "admin@nexo.app",
  "password": "demo1234"
}
```

Resposta:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "email": "admin@nexo.app",
    "name": "Admin Homologacao"
  },
  "tenant": {
    "id": "...",
    "slug": "homologacao",
    "name": "Homologacao Nexos"
  },
  "membership": {
    "id": "...",
    "role": "tenant_admin",
    "roleId": "..."
  }
}
```

Email e normalizado com trim + lowercase antes da busca. Senha usa bcrypt, mesmo algoritmo do seed.

## Sprint 08.04 - Connections e webhooks

`GET /api/messaging/connections` retorna somente Connections Evolution do tenant autenticado. A UI de
Inbox consome esse endpoint diretamente e filtra `providerType = evolution` + `status = connected`.

## Sprint 09 - Realtime

Socket.io:

- namespace `/realtime`
- path `/socket.io`
- auth `socket.auth.accessToken`

Health REST inclui campos sanitizados:

- `queue`
- `realtime`
- `realtimeAdapter`

Catalogo de eventos e payloads em `docs/REALTIME.md`.

`POST /api/webhooks/evolution` aceita webhook autenticado por:

- `jwt_key: <EVOLUTION_WEBHOOK_SECRET>`: contrato fisico configurado na Evolution;
- `Authorization: Bearer <token>` com claims `{ app: "evolution", action: "webhook" }`: contrato de teste.

Respostas 2xx podem indicar processamento, replay idempotente ou evento suportadamente ignorado. Motivos
canonicos incluem `FROM_ME`, `GROUP_MESSAGE`, `UNSUPPORTED_EVENT`, `MISSING_MESSAGE_ID`,
`MISSING_REMOTE_IDENTITY`, `INVALID_PAYLOAD` e `CONNECTION_NOT_FOUND`.
