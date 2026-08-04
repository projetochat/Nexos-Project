# Autenticacao e Autorizacao

## Estado atual do MVP

IMPLEMENTADO:

- Login por `supabase.auth.signInWithPassword`.
- Logout por `supabase.auth.signOut`.
- Sessao client-side em Supabase Auth e store Zustand persistido `nexo.session`.
- Hidratacao em `SessionHydrator`.
- Contas demo criadas por `ensureDemoUsers`.
- Atualizacao de status do agente para `online`/`offline`.

SIMULADO/PARCIAL:

- `super_admin` e `supervisor` existem nos tipos de UI, mas o enum persistido nas migrations e `admin | agent`.
- Impersonacao existe no store local, sem isolamento real por tenant no schema.
- Permissoes de `access_profiles` controlam principalmente UI.

## Fluxo de login

```text
Formulario /login
  -> signIn(email, password)
  -> Supabase Auth
  -> hydrateSession()
  -> user_roles + agents
  -> useSession.user
  -> redirect por ROLE_META
```

## Protecao de rotas

- `AppShell` usa `useAuthGate("app")`.
- `AdminShell` usa `useAdminGate()` e exige `role === "super_admin"`.
- `OperatorShell` usa `useOperatorGate()`.

Essa protecao e client-side. A protecao de dados real depende de RLS no Supabase do MVP.

## Arquitetura futura aprovada

PLANEJADO:

- Autenticacao e autorizacao no backend NestJS.
- Persistencia e roles no PostgreSQL/Prisma.
- Multi-tenancy real.
- Politicas de autorizacao server-side para acoes sensiveis.

DECISAO ARQUITETURAL PENDENTE:

- Estrategia definitiva de auth futura: manter Supabase Auth, migrar para auth propria, ou usar provedor externo integrado ao NestJS.

## Sprint 01 - Auth Backend

Implementado auth propria minima no NestJS para provar o contrato multi-tenant:

- Login em `POST /api/auth/login` com email, senha e `tenantSlug`.
- Senhas armazenadas com `bcryptjs`.
- Access token JWT com expiracao curta de 15 minutos.
- Refresh token JWT com expiracao de 7 dias.
- Logout stateless em `POST /api/auth/logout`; o cliente remove tokens locais.
- Guard `JwtAuthGuard` valida token access e injeta `userId`, `tenantId`, `membershipId` e `role`.
- `/api/me` recalcula contexto a partir da membership persistida.

Hardening:

- `ensureDemoUsers` deixou de ser chamado pela tela de login.
- `ensureDemoUsers` agora exige `ALLOW_DEMO_USER_PROVISIONING=true`.
- Login frontend tenta a Nexos API e cai para o login Supabase legado apenas se a API local estiver indisponivel ou recusar a tentativa.

## Sprint 01.1 - Decisao Definitiva

DEFINITIVO:

- NestJS Auth e a autoridade de identidade da plataforma.
- Novas funcionalidades devem autenticar e autorizar pelo backend NestJS, com tenant derivado de membership.

TEMPORARIO:

- Supabase Auth permanece como fallback de migracao para fluxos MVP ainda nao migrados.
- O fallback atual e `Nexos API -> Supabase`. Ele existe para preservar o produto enquanto telas dependem de Supabase Auth/RLS.

Criterio de remocao do fallback:

- todos os fluxos protegidos dependerem de `/api/auth/login`, `/api/me` e guardas backend;
- dados operacionais criticos terem tenant server-side no NestJS;
- smoke e verify passarem sem login Supabase.

Risco de permanencia:

- dois modelos de sessao coexistem e podem divergir em roles/permissoes.

## Sprint 02 - Auth, RBAC e Supabase Auth removido das superficies migradas

DEFINITIVO IMPLEMENTADO:

- `/login`, `hydrateSession`, `signIn` e `signOut` usam a Nexos API.
- O fallback `Nexos API -> Supabase Auth` foi removido das superficies de organizacao.
- JWT access inclui `sub`, `tenantId`, `membershipId`, `roleId`, `roleKey`, `platformRole` e `typ`.
- `JwtAuthGuard` converte token ausente, invalido ou malformado em `401`.
- `PermissionsGuard` recalcula membership ativa e permissoes no banco antes de liberar a rota.

Modelo:

```text
User global
  -> TenantMembership ativa
  -> Role tenant-scoped
  -> RolePermission
  -> Permission catalogada
```

`PlatformRole.ADMIN` e separado de `tenant_admin`. Um Platform Admin nao recebe acesso operacional ao tenant sem uma membership e role de tenant com permissoes explicitas.

## Matriz de permissoes Sprint 02

| Operacao                            | Platform Admin | Tenant Admin |   Supervisor |                  Agent |
| ----------------------------------- | -------------: | -----------: | -----------: | ---------------------: |
| Ver usuarios                        | Nao automatico |          Sim |          Sim |                    Nao |
| Criar/editar/desativar usuario      | Nao automatico |          Sim |          Nao |                    Nao |
| Ver departamentos                   | Nao automatico |          Sim |          Sim |                    Sim |
| Criar/editar/desativar departamento | Nao automatico |          Sim |          Sim |                    Nao |
| Associar usuario a departamento     | Nao automatico |          Sim |          Sim |                    Nao |
| Ver roles/perfis                    | Nao automatico |          Sim |          Sim |                    Nao |
| Gerenciar roles/perfis              | Nao automatico |          Sim |          Nao |                    Nao |
| Permissoes de chat                  | Nao automatico |        Todas | Operacionais | Operacionais limitadas |

## Matriz de permissoes Sprint 03 CRM

Novas permission keys:

- `crm.read`
- `crm.manage`

| Operacao CRM                           | Platform Admin | Tenant Admin | Supervisor | Agent |
| -------------------------------------- | -------------: | -----------: | ---------: | ----: |
| Ver clientes, contatos e tags          | Nao automatico |          Sim |        Sim |   Sim |
| Criar/editar/arquivar clientes         | Nao automatico |          Sim |        Sim |   Nao |
| Criar/editar/arquivar contatos         | Nao automatico |          Sim |        Sim |   Nao |
| Vincular/desvincular contato a cliente | Nao automatico |          Sim |        Sim |   Nao |

As rotas CRM usam `JwtAuthGuard` e `PermissionsGuard`. O tenant e sempre derivado da membership ativa no token e validado novamente no banco.

## Matriz de permissoes Sprint 04 Conversations

Novas permission keys:

- `conversations.read`
- `conversations.assign`
- `conversations.manage`

| Operacao Conversations             | Platform Admin | Tenant Admin | Supervisor | Agent |
| ---------------------------------- | -------------: | -----------: | ---------: | ----: |
| Listar/detalhar conversas visiveis | Nao automatico |          Sim |        Sim |   Sim |
| Assumir ou atribuir conversa       | Nao automatico |          Sim |        Sim |   Sim |
| Desatribuir conversa               | Nao automatico |          Sim |        Sim |   Sim |
| Transferir departamento permitido  | Nao automatico |          Sim |        Sim |   Sim |
| Alterar status explicitamente      | Nao automatico |          Sim |        Sim |   Sim |

Mesmo com permission concedida, o backend aplica escopo operacional:

- `tenant_admin`: todas as conversas do tenant.
- `supervisor`: departamentos vinculados a sua membership ou conversas atribuidas a ele.
- `agent`: departamentos vinculados a sua membership ou conversas atribuidas a ele.

Um Platform Admin continua sem acesso automatico; precisa de membership tenant-scoped com permissions.

## Matriz de permissoes Sprint 05 Messages

Nova permission key:

- `messages.send`

| Operacao Messages                     | Platform Admin | Tenant Admin | Supervisor | Agent |
| ------------------------------------- | -------------: | -----------: | ---------: | ----: |
| Listar historico visivel              | Nao automatico |          Sim |        Sim |   Sim |
| Marcar inbound como lido              | Nao automatico |          Sim |        Sim |   Sim |
| Enviar texto na conversa atribuida    | Nao automatico |          Sim |        Sim |   Sim |
| Criar mensagem de sistema diretamente | Nao automatico |          Nao |        Nao |   Nao |

Mesmo com `messages.send`, o backend bloqueia envio quando:

- a conversa nao esta atribuida ao usuario atual;
- a conversa esta `fechada`;
- a conversa esta em `aguardando` e precisa ser retomada;
- a conversa nao e visivel pelo escopo operacional do usuario.

## Supabase residual de auth

REMOVIDO das superficies migradas:

- `src/lib/session.ts`
- `src/lib/perms.ts`
- `src/routes/login.tsx`
- `src/routes/__root.tsx`
- `src/routes/departamentos.tsx`
- `src/routes/atendentes.tsx`
- `src/routes/perfis.tsx`
- `src/routes/configuracoes.usuarios.tsx`
- `src/routes/configuracoes.permissoes.tsx`

AINDA LEGADO:

- `src/start.ts` ainda anexa sessao Supabase para server functions legadas.
- `src/lib/mvp.ts`, chamados, simulador, historico e filtros de relatorio ainda usam Supabase para fluxos operacionais nao migrados.
- `ensureDemoUsers` permanece protegido por `ALLOW_DEMO_USER_PROVISIONING=true` e nao e chamado pelo login.

## Sprint 10 Rework - RBAC operacional

`tenant_admin` tem acesso completo ao tenant operacional, incluindo criar Conversation, gerenciar catalogo
de Tags e gerenciar Quick Replies. O escopo de departamento continua aplicado a supervisor/agente, mas nao
bloqueia o tenant admin.

Agentes recebem `chat.tags.use` e `chat.quick_replies.read`: podem aplicar/remover Tags existentes em
Contacts e inserir Quick Replies no composer, sem criar/editar/arquivar o catalogo. A UI usa as mesmas
permission keys que o backend e mensagens `403` preservam o motivo operacional retornado pela API.

## Sprint 06 - Messaging

O envio de mensagens continua protegido por JWT, tenant membership, RBAC `messages.send`, visibilidade de conversa e escopo de departamento. A connection de mensageria e sempre resolvida no backend por tenant; o frontend nao pode escolher provider nem trocar connection no envio normal.

## Sprint 07 - Connections e Webhook Evolution

Connections usam RBAC proprio:

- `connections.read`: listar, consultar e ver saude/status.
- `connections.manage`: criar instancia Evolution, solicitar QR e desconectar.

O webhook `/api/webhooks/evolution` e publico para usuarios Nexos, mas autenticado por JWT assinado com `EVOLUTION_WEBHOOK_SECRET`. Tokens de usuario nao sao aceitos nessa rota; o token precisa carregar `app=evolution` e `action=webhook`.

# Sprint 08

Jobs BullMQ nao carregam JWT. O worker deve resolver Message, Conversation e Connection por `tenantId + messageId` persistidos e nunca confiar em escopo vindo do Redis alem desse identificador minimo.

## Sprint 08.03 - Login e acesso de homologacao

DEFINITIVO:

- `/login` usa somente a Nexos API.
- Nao ha fallback para Supabase Auth, usuario estatico, timeout fake ou sessao mockada no fluxo real.
- API base unica do frontend: `VITE_NEXOS_API_URL`, padrao local `http://localhost:3001/api`.
- O login nao envia `tenantSlug` fixo por padrao; o backend seleciona automaticamente a unica membership ativa. Isso permite o seed minimo `homologacao`.
- `/api/auth/me` e o endpoint oficial de bootstrap de sessao. `/api/me` permanece por compatibilidade.
- Tokens continuam em `localStorage` por compatibilidade com a arquitetura atual. Risco documentado: nao e HttpOnly cookie.
- Refresh automatico em `apiRequest`: se o access token expira e o refresh ainda e valido, o cliente busca novo access token e repete a chamada uma vez.
- Logout chama `/api/auth/logout`, limpa tokens locais, limpa estado Zustand e sincroniza logout entre abas por `storage`.

Contrato de homologacao:

```text
Tenant: homologacao
Usuario: admin@nexo.app
Senha local/homologacao: demo1234
Role: tenant_admin
```

Seed configuravel:

```text
SEED_MODE=homologation
SEED_ADMIN_EMAIL=admin@nexo.app
SEED_ADMIN_PASSWORD=demo1234
```

Defaults de email/senha sao permitidos apenas fora de producao. O seed imprime modo, tenant e admin, mas nunca imprime senha.

Erros canonicos de auth:

| Cenario              | HTTP | Code                             | Mensagem UI                                                                     |
| -------------------- | ---: | -------------------------------- | ------------------------------------------------------------------------------- |
| Credencial invalida  |  401 | `INVALID_CREDENTIALS`            | E-mail ou senha invalidos.                                                      |
| Usuario inativo      |  403 | `USER_INACTIVE`                  | Seu usuario nao possui permissao para acessar este ambiente.                    |
| Sem membership ativa |  403 | `USER_WITHOUT_ACTIVE_MEMBERSHIP` | Seu usuario nao possui acesso a nenhuma organizacao ativa.                      |
| Muitas tentativas    |  429 | `TOO_MANY_LOGIN_ATTEMPTS`        | Muitas tentativas de acesso. Aguarde e tente novamente.                         |
| Erro interno         |  500 | n/a                              | Ocorreu um erro interno ao autenticar.                                          |
| API offline          |  n/a | n/a                              | Nao foi possivel conectar a API Nexos. Verifique se o backend esta em execucao. |

Health pre-login:

```text
GET /api/health
```

`ok=true` significa API + database disponiveis. Redis e diagnosticado separadamente; Redis down nao invalida credenciais.

## Sprint 08.04 - Webhook auth

Webhook Evolution nao usa sessao de usuario. Ele e autenticado por segredo operacional:

- contrato fisico: header `jwt_key` igual a `EVOLUTION_WEBHOOK_SECRET`;
- contrato automatizado compativel: Bearer JWT assinado com `EVOLUTION_WEBHOOK_SECRET` e claims
  `{ app: "evolution", action: "webhook" }`.

Falha de auth registra `evolution.webhook.auth_failed` com `authResult` e HTTP 401, sem logar segredo,
telefone completo ou conteudo da mensagem.

`EVOLUTION_WEBHOOK_SECRET` e normalizado no backend para remover espacos externos e aspas externas
pareadas. A auditoria do contrato deve registrar somente:

```text
secretBackendConfigured=true/false
secretEvolutionConfigured=true/false
secretMatch=true/false
headerJwtKeyPresent=true/false
```

Nunca registrar o valor de `jwt_key` ou do secret.

## Sprint 09 - Socket auth

Realtime usa access token no handshake (`socket.auth.accessToken`). O backend valida assinatura,
expiracao, tipo `access`, User ativo e Membership ativa. Tenant, membership, role e departamentos sao
derivados server-side; valores enviados pelo cliente nao sao confiaveis.

## Sprint 08.04 Rework - Atendente homologacao

O seed `homologation` cria dois acessos locais:

| E-mail             | Role         | Departamento |
| ------------------ | ------------ | ------------ |
| admin@nexo.app     | tenant_admin | Atendimento  |
| atendente@nexo.app | agent        | Atendimento  |

Variaveis locais:

```text
SEED_AGENT_EMAIL=atendente@nexo.app
SEED_AGENT_PASSWORD=demo1234
```

Defaults continuam bloqueados em producao.

## Sprint 09 Rework II - Refresh single-flight

O client Nexos API usa refresh single-flight:

- requests concorrentes que recebem 401 aguardam a mesma promise de refresh;
- cada request protegida tenta refresh e retry no maximo uma vez;
- `/auth/login`, `/auth/refresh`, `/auth/logout` e `/health` nao entram em retry de refresh;
- refresh 401 limpa access token, refresh token e tenant locais;
- Socket.io consome o mesmo `refreshNexosAccessToken()`, portanto nao cria refresh paralelo ao HTTP.

Esse fluxo impede o ciclo:

```text
401 -> refresh -> session update -> socket reconnect -> query refetch -> 401
```

de virar uma rajada infinita de requests. O socket nao e fonte de identidade; a sessao continua vindo de
`/api/auth/me` durante bootstrap.
# RBAC de Tickets

Permissoes adicionadas: `tickets.read`, `tickets.create`, `tickets.update`, `tickets.assign`, `tickets.status.update`, `tickets.comment`, `tickets.attachments.upload`, `tickets.attachments.delete`, `tickets.manage`.

Tenant admin possui escopo total dentro do tenant. Agentes ficam restritos a departamentos permitidos ou tickets atribuidos.
