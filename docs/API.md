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

| Funcionalidade | Necessidade futura |
| --- | --- |
| Auth/usuarios | autenticar, listar, criar, atualizar, atribuir roles/perfis |
| Conversas | listar, assumir, transferir, encerrar, reabrir, marcar leitura |
| Mensagens | enviar texto/audio/imagem, listar historico, status de leitura |
| Contatos/clientes | CRUD, vinculos, tags, busca e paginacao |
| Departamentos/filas | CRUD, configuracao e roteamento |
| Instancias/canais | CRUD, conectar canal, QR/status, mensagens automaticas |
| Chamados | criar, editar, listar e anexar midia |
| Relatorios | agregacoes por periodo, agente, departamento, cliente, instancia e tag |
| Campanhas | CRUD, segmentacao, disparo, metricas e retry |
| Super Admin | tenants, planos, assinaturas, financeiro, logs e auditoria |

Nao foram definidos URL, metodo HTTP, DTO, controller ou schema definitivo nesta Sprint.
