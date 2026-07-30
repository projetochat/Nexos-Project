# Coding Guidelines

Estas diretrizes refletem o estado atual do projeto.

## Linguagem e estilo

- TypeScript com `strict: true`.
- JSX com React 19.
- Alias `@/*` aponta para `src/*`.
- Prettier configurado com aspas duplas, ponto e virgula, largura 100 e trailing commas `all`.
- ESLint usa `@eslint/js`, `typescript-eslint`, React Hooks, React Refresh e Prettier.

## Organizacao

- Rotas em `src/routes`, seguindo file-based routing do TanStack Router.
- Componentes compartilhados em `src/components`.
- Primitivas de UI em `src/components/ui`.
- Dominio e utilitarios em `src/lib`.
- Integracao Supabase em `src/integrations/supabase`.
- Migrations sempre em `supabase/migrations`.

## Componentes

- Usar `ui-kit.tsx` para componentes comuns antes de criar novos.
- Usar shells existentes para paginas protegidas.
- Modais devem usar `Modal`/`ConfirmDialog`.
- Feedback deve usar `toast` e componentes de `feedback.tsx` quando aplicavel.

## Dados e APIs

- Preferir `src/lib/mvp.ts` para dominio operacional ja migrado.
- Evitar espalhar novas queries Supabase por rotas quando houver chance de reuso.
- Nao usar `supabaseAdmin` em codigo client-side.
- Server functions privilegiadas devem importar `client.server.ts` dentro do handler.

## Autenticacao e permissoes

- Tratar RLS como barreira real de seguranca.
- Flags de `access_profiles` podem controlar UI, mas acoes sensiveis precisam de enforcement no banco.
- Novas rotas protegidas devem considerar gate antes do render para evitar flash.

## Banco

- Toda nova tabela publica deve ter grants, RLS e policies.
- Preferir migrations pequenas e cronologicas.
- Atualizar `src/integrations/supabase/types.ts` quando o schema mudar.
- Evitar secrets ou service role no browser.

## Validacoes e erros

- Validar campos obrigatorios antes de mutacoes.
- Exibir erros ao usuario com `toast.error`.
- Capturar falhas de carregamento com estados vazios/erro, nao apenas console.
- HTML persistido deve ser tratado como superficie sensivel.

## Testes

Sprint 01 adicionou testes automatizados para o backend e sanitizacao XSS. Para futuras contribuicoes, priorizar:

- regras de filas e conversas;
- permissoes/RLS;
- auth e redirects;
- formularios criticos como chamados, perfis e instancias.

## Backend Sprint 01

- Manter backend em `backend/` enquanto o strangler fig estiver ativo.
- Usar Prisma migrations para mudancas no banco novo.
- Gerar Prisma Client com `bun run backend:prisma:generate` antes de build/test quando necessario.
- Nunca confiar em `tenantId` vindo livremente do cliente; derivar de JWT/membership.
- Novos endpoints protegidos devem usar guard JWT e filtros por tenant no servidor.
- Secrets ficam em `.env`; exemplos sem segredo ficam em `.env.example`.

## Lint Baseline Sprint 01.1

- `bun run lint` executa `scripts/check-eslint-baseline.mjs`.
- A divida legada esta registrada em `scripts/eslint-baseline.json`.
- Codigo novo/modificado nao pode introduzir nova divida: qualquer aumento por arquivo/regra falha o gate.
- `bun run lint:raw` mostra o ESLint completo e continua retornando erro enquanto houver divida legada.
- Prisma Client gerado (`backend/src/generated/prisma/**`) fica fora do ESLint por ser artefato gerado.
- A reducao gradual da divida deve acontecer em sprints dedicadas ou junto de mudancas pequenas e rastreaveis.

## Backend Sprint 02

- Funcionalidade nova nao deve importar Supabase.
- Endpoints novos devem usar `JwtAuthGuard` e, para acoes sensiveis, `PermissionsGuard`.
- Use `@RequirePermissions(...)` em vez de checagens espalhadas de role.
- Nunca aceite `tenantId` livre do cliente como escopo operacional.
- Roles de tenant devem ser consultadas por `[tenantId, roleId]`.
- Associations de departamento devem preservar consistencia por tenant.
- Permission keys novas devem entrar no catalogo controlado em `backend/src/auth/permissions.constants.ts`.
