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
