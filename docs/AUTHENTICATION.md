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

| Operacao Conversations                 | Platform Admin | Tenant Admin | Supervisor | Agent |
| -------------------------------------- | -------------: | -----------: | ---------: | ----: |
| Listar/detalhar conversas visiveis     | Nao automatico |          Sim |        Sim |   Sim |
| Assumir ou atribuir conversa           | Nao automatico |          Sim |        Sim |   Sim |
| Desatribuir conversa                   | Nao automatico |          Sim |        Sim |   Sim |
| Transferir departamento permitido      | Nao automatico |          Sim |        Sim |   Sim |
| Alterar status explicitamente          | Nao automatico |          Sim |        Sim |   Sim |

Mesmo com permission concedida, o backend aplica escopo operacional:

- `tenant_admin`: todas as conversas do tenant.
- `supervisor`: departamentos vinculados a sua membership ou conversas atribuidas a ele.
- `agent`: departamentos vinculados a sua membership ou conversas atribuidas a ele.

Um Platform Admin continua sem acesso automatico; precisa de membership tenant-scoped com permissions.

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
- `src/lib/mvp.ts`, inbox, chamados, instancias, simulador, historico e filtros de relatorio ainda usam Supabase para fluxos operacionais nao migrados.
- `ensureDemoUsers` permanece protegido por `ALLOW_DEMO_USER_PROVISIONING=true` e nao e chamado pelo login.
