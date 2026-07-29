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
