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
