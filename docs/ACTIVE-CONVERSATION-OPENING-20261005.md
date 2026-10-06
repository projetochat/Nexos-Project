# Abertura padronizada de Conversa Ativa — 05/10/2026

## Objetivo

Padronizar a decisão posterior à identificação do contato nos pontos Contatos, Chat e Histórico, preservando a identificação própria de cada tela e mantendo o backend como autoridade final.

## Evidências observadas antes da alteração

- Contatos e Chat possuíam implementações próprias de seleção; ambas exigiam vínculo explícito e não aplicavam o fallback para todas as instâncias permitidas quando o contato não tinha vínculos.
- Histórico fixava a instância da conversa encerrada, possuía seletor de departamento próprio e enviava `lastMessagePreview` como uma nova mensagem outbound local.
- A interface usava combinações diferentes de permissões (`conversations.assign`, `contacts.read`), enquanto `POST /conversations` exige `messages.send`.
- O backend já delimitava contato, instância, departamento e conversa por tenant, validava instância Evolution conectada/não pausada e departamento ativo/vinculado/permitido.
- A busca seguida de criação não possuía serialização por contato, permitindo duplicidade em requisições concorrentes.

## Alteração implementada

- `ActiveConversationOrchestrator` concentra candidatos, seleção de instância, seleção de departamento, favorito, criação e navegação.
- Os três pontos renderizam o mesmo orquestrador e os mesmos modais após escolher o contato.
- Contato com vínculos parte somente das instâncias vinculadas; contato sem vínculos parte do catálogo conectado já delimitado por tenant e Perfil de Acesso.
- Administrador ignora favorito e sempre escolhe departamento. Usuário comum usa somente favorito presente no catálogo ativo/permitido da instância.
- A interface usa `messages.send`, alinhada ao endpoint. `contacts.read` continua adicionalmente exigida apenas no Chat, que precisa pesquisar contatos.
- Histórico deixa de copiar o preview antigo para uma mensagem nova e não oferece abertura direta para conversas de grupo, cujo contrato de retomada é diferente.
- A transação bloqueia a linha do contato por tenant antes de reler contato, instância, departamento e perfil do atendente. Tentativas simultâneas para o mesmo contato são serializadas e reutilizam a conversa compatível já existente.
- Nenhuma migração foi criada.

## Verificações isoladas executadas

- Typecheck frontend: aprovado.
- Build TypeScript backend: aprovado.
- ESLint somente nos arquivos tocados: aprovado.
- Build frontend/SSR/Nitro: aprovado; apenas avisos preexistentes de tamanho de chunks e configuração do plugin de paths.
- Testes frontend focados: 3 arquivos, 13 testes aprovados.
- Testes backend do controller: 1 arquivo, 13 testes aprovados.

Os testes cobrem vínculo explícito, fallback sem vínculo, instância desconectada excluída, favorito, ausência de favorito, administrador com seleção manual, integração do mesmo orquestrador nos três pontos, mudança de perfil antes da gravação e duas requisições concorrentes produzindo uma única conversa/mensagem de início/evento de criação.

## Limitações

- A concorrência foi comprovada por teste unitário com transações serializadas e pela presença do `FOR UPDATE`; não foi executado teste de integração contra PostgreSQL porque nenhum banco descartável foi fornecido e os bancos correntes não poderiam ser usados.
- Não houve navegação manual/E2E nos três pontos. A equivalência é garantida pela montagem do mesmo componente, testes de componente e contrato de integração das três rotas.
- A identidade compatível existente foi preservada: tenant + contato + instância + departamento. Alterá-la para ignorar departamento mudaria comportamento aprovado e ficou fora desta correção.
- O comportamento anterior que pode reatribuir uma conversa compatível de outro atendente não foi alterado, pois exige decisão funcional específica sobre posse/transferência.
- O catálogo geral de edição de contatos continua podendo listar metadados de todas as instâncias da tenant; o novo orquestrador não usa esse catálogo para decidir a abertura, usando exclusivamente `/messaging/connections/chat-scope`.

## Retorno

Backup anterior: `C:\dev\preservacao-20260921\fechamento\backup-conversa-ativa-20261005`.

Para retornar somente esta correção:

1. Restaurar do backup os arquivos `contatos.tsx`, `inbox.index.tsx`, `-historico-page.tsx`, `contact-instance-selection.ts`, `new-conversation-modal.test.tsx`, `conversations.controller.ts` e `conversations.controller.spec.ts` para seus caminhos originais.
2. Remover `src/components/active-conversation-orchestrator.tsx`, `src/lib/active-conversation-permissions.ts`, `src/lib/contact-instance-selection.test.ts`, `src/lib/active-conversation-entry-contract.test.ts` e este documento.
3. Reexecutar typechecks, builds e os testes focados. Não há migração ou alteração de dados a desfazer.
