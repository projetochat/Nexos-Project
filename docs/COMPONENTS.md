# Componentes, Hooks, Stores e Servicos

## Paginas

As paginas ficam em `src/routes` e usam TanStack Router. `routeTree.gen.ts` e gerado.

Categorias:

- Atendimento real/parcial: inbox, historico, simulador, mensagens rapidas.
- CRM: clientes, contatos.
- Operacao/admin empresa: atendentes, perfis, departamentos, etiquetas, instancias, chamados, configuracoes.
- Produto simulado: campanhas, filas, chatbot, automacoes, agente IA.
- Super Admin simulado: `/admin/*`.
- Legado operador: `/atendimento/*`.

## Shells

- `AppShell`: layout principal, sidebar, gate, topbar, mobile nav.
- `AppShellFull`: layout de altura total.
- `AdminShell`: Super Admin.
- `OperatorShell`: rotas legadas de operador.

## Componentes compartilhados

- `ui-kit.tsx`: componentes visuais proprios.
- `modal.tsx`: modal, confirm dialog e disclosure.
- `feedback.tsx`: loaders, error state, offline banner e connection pill.
- `report-filters.tsx`: filtros de relatorios.
- `instancia-tipos.tsx`: catalogo visual de tipos de canal.
- `theme-provider.tsx`: tema.
- `components/ui/*`: primitivas shadcn/Radix.

## Hooks e stores

- `useSession`: Zustand persistido.
- `useChatPerms`: permissoes por perfil.
- `useQueuePrefs`: preferencias locais de fila.
- `useRealtime`: barramento local.
- `useStore`: store mock legado.
- `use-mobile`: media query.

## Servicos

- `mvp.ts`: Supabase real do MVP operacional.
- `api/index.ts`: camada mock legado.
- `demo.functions.ts`: server function para usuarios demo.
- `integrations/supabase/*`: clientes e middlewares Supabase.

## Sprint 01 - Novos Utilitarios Frontend

- `src/lib/nexos-api.ts`: cliente minimo da Nexos API para login backend, armazenamento local de tokens e limpeza no logout.
- `src/lib/sanitize-html.ts`: sanitizacao allowlist para HTML rico de chamados.
- `src/lib/sanitize-html.test.ts`: testes contra payloads XSS basicos e imagens data URL permitidas.

O login nao importa mais `ensureDemoUsers`; a server function permanece apenas como legado protegido por flag.

## Sprint 01 - Backend

O backend fica em `backend/src`:

- `auth`: DTOs, service, controller, JWT guard e helpers de role.
- `health`: healthcheck publico.
- `users`: endpoint `/api/me`.
- `tenant-records`: rota protegida de prova de isolamento.
- `prisma`: modulo global e service Prisma.

## Sprint 02 - Componentes e Servicos Migrados

Frontend:

- `src/lib/nexos-api.ts`: cliente de auth, users, departments, roles e permissions.
- `src/lib/session.ts`: sessao hidratada pela Nexos API.
- `src/lib/perms.ts`: permissoes de chat derivadas das permission keys do backend.
- `src/routes/departamentos.tsx`: CRUD real de departments.
- `src/routes/atendentes.tsx`: users/memberships reais.
- `src/routes/perfis.tsx`: roles/perfis reais.
- `src/routes/configuracoes.usuarios.tsx`: lista users reais.
- `src/routes/configuracoes.permissoes.tsx`: lista roles/permissoes reais.

Backend:

- `auth/permissions.*`: catalogo, decorator e guard.
- `departments`: controller, DTOs e modulo.
- `roles`: controller, DTOs e modulo.
- `users/dto`: DTOs de create/update user.
- `tenant-records` removido por ser artefato de teste da Sprint 01.

## Sprint 06 - Frontend components

Nao houve redesign da Inbox. Componentes existentes continuam consumindo `messageApi.sendText`; o tipo de status do cliente foi ampliado para aceitar `sending`, `sent`, `failed`, `delivered` e `read`, preservando compatibilidade visual.

# Sprint 08 - Status de mensagem

As bolhas outbound exibem um texto curto para o status operacional:

- `fila`
- `enviando`
- `enviada`
- `falhou`
- `entregue`
- `lida`

Polling existente continua responsavel pela atualizacao visual.

## Sprint 08.04 - Connection dropdown

`src/lib/connection-options.ts` centraliza a selecao exibivel no Inbox:

- entrada: resposta real de `connectionsApi.list()`;
- filtro: `providerType === "evolution"` e `status === "connected"`;
- label: nome real, telefone owner mascarado quando existe, provider e status;
- vazio: mensagem operacional sem fallback.

`InboxLayout` tambem usa Connections reais para o filtro de instancia, evitando listas vindas de opções de
contato ou fontes legadas.

No rework da Sprint 08.04, `Contatos` e `ReportFiltersBar` tambem passaram para
`useConnectedMessagingConnections`. O modal de contato mostra o nome real da Connection como label e grava
a referencia operacional da Connection como valor.

## Sprint 09 - Inbox realtime

Inbox exibe indicador discreto de realtime. Quando conectado, polling agressivo e reduzido; quando
offline/degradado, a UI mantém fallback periódico por REST. A camada visual usa `src/lib/realtime` como
singleton, sem abrir sockets por componente.
