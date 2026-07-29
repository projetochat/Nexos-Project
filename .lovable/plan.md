# Backend funcional do MVP + tema claro padrão

Plano para transformar o protótipo em MVP com dados reais via Lovable Cloud (Supabase), simulador de cliente no lugar da API do WhatsApp e ajuste do tema para carregar em Light por padrão.

## 1. Infraestrutura

- Ativar **Lovable Cloud** (Supabase gerenciado). Sem integração real com WhatsApp.
- Criar migração única com schema, RLS, grants, triggers e seeds determinísticos (6–8 contatos, 3 departamentos, 2 atendentes demo, algumas tags e quick replies).

## 2. Schema (public)

Todas as tabelas com RLS habilitado, grants para `authenticated` e `service_role`.

- `app_role` enum: `admin`, `agent`.
- `user_roles(user_id, role)` + função `has_role()` SECURITY DEFINER (padrão obrigatório para evitar recursão).
- `departments(id, nome, cor, descricao)`.
- `agents(id = auth.users.id, nome, email, department_id, status, last_seen)`.
- `contacts(id, nome, telefone, avatar_url)`.
- `tags(id, nome, cor)` + `contact_tags(contact_id, tag_id)`.
- `conversations(id, contact_id, department_id, agent_id nullable, status enum[aberta,em_andamento,aguardando,fechada], created_at, last_message_at)`.
- `messages(id, conversation_id, sender enum[contact,agent], author_id nullable, content, created_at, read_at)`.
- `quick_replies(id, atalho, texto, department_id nullable)`.
- Trigger: ao inserir `messages`, atualiza `conversations.last_message_at`; ao inserir mensagem de `contact` em contato sem conversa aberta, cria nova `conversation` (feito no lado app pela simplicidade).
- Trigger `handle_new_user` para criar row em `agents` e atribuir role `agent` por padrão.

## 3. Políticas RLS

- `admin` (via `has_role`): full access em todas as tabelas operacionais.
- `agent`: vê `conversations` do próprio `department_id` ou `agent_id = auth.uid()`; idem `messages` via join; leitura de `contacts`, `departments`, `tags`, `quick_replies`, `agents`.
- `user_roles`: leitura autenticada; escrita apenas service_role.

## 4. Autenticação

- Supabase Auth email/senha. Auto-confirm habilitado.
- Ajustar `src/lib/session.ts` para envolver `supabase.auth` real (mantendo API atual). Login page passa a autenticar via Supabase; contas demo criadas por seed (admin@nexo.app / agent@nexo.app com senha `demo1234`).
- Presença: `agents.status = 'online'` no login, `offline` no logout; canal Realtime `presence` opcional para UI.

## 5. Simulador de cliente (`/simulador`)

- Rota pública dentro do app (sem shell administrativo).
- Lista de contatos seed → seleciona contato → digita mensagem.
- Envio: insere em `messages` como `sender='contact'`. Se contato não tem conversa aberta, cria `conversation` (status `aberta`, sem agente, no depto default "Geral").
- Assina Realtime nas mensagens do contato ativo para mostrar respostas do atendente em tempo real. Visual simples estilo bolhas de chat.

## 6. Fluxo de atendimento (Inbox)

Reescrita da camada de dados em `src/lib/api/` para consumir Supabase (mantendo assinatura dos métodos → telas não mudam de forma).

- Listar conversas filtradas por RLS (fila = sem agent_id).
- Ações: **Assumir** (`agent_id = auth.uid()`, status `em_andamento`), **Transferir** (agente ou departamento), **Fechar** (`status='fechada'`).
- Envio de mensagem do atendente: insere `sender='agent', author_id=auth.uid()`.
- Realtime: subscribe em `messages` e `conversations` para atualizar UI sem refresh.

## 7. Relatórios reais

Substituir números mockados em Dashboard/Relatórios por queries agregadas:

- Contagens por status.
- Contagens por departamento e por atendente (group by).
- Tempo médio primeira-resposta: para cada conversa, `min(messages.created_at where sender='agent') - min(messages.created_at where sender='contact')`, média via view SQL `report_first_response`.

## 8. Tema claro por padrão

- `src/components/theme-provider.tsx`: valor inicial `"light"` (hoje é `"dark"`), `readStored()` default `"light"`, `resolve("system")` → não usar preferência do SO por padrão (só aplica system se o usuário escolher explicitamente). Toggle continua visível no topbar/menu de usuário.
- Script anti-flash no `__root.tsx` ajustado para light-first.
- QA rápido: revisar telas principais (inbox, simulador, relatórios, configurações, login) nos dois temas.

## 9. Estados vazios e loading

Passar todas as listas para o padrão `useQuery` já existente + `EmptyState`/`Skeleton` de `src/components/feedback.tsx`. Remover últimas leituras diretas de `useStore` (mock Zustand) nas telas conectadas.

## 10. Fora de escopo (declarado)

- Integração real WhatsApp/Meta/Baileys.
- Storage de mídia (mensagens apenas texto neste MVP).
- Convites de usuário por email; contas demo criadas por seed.

## Ordem de execução

1. `supabase--enable` → migração schema+RLS+seeds.
2. Wrappers de auth + login real + guard nas rotas.
3. Reescrita `src/lib/api/*` para Supabase + Realtime.
4. Rota `/simulador`.
5. Relatórios com queries reais.
6. Theme provider light-first + QA visual.

Detalhes técnicos (para revisão): uso obrigatório de `GRANT` em cada `CREATE TABLE public.*`; função `has_role` SECURITY DEFINER + `user_roles` separado (evita recursão RLS); Realtime habilitado nas tabelas `messages` e `conversations` com `REPLICA IDENTITY FULL`.
