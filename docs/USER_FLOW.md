# Fluxo do Usuario

## Rotas reais

| Rota                     | Tela                   | Layout                 | Origem principal dos dados                   |
| ------------------------ | ---------------------- | ---------------------- | -------------------------------------------- |
| `/login`                 | Login                  | Sem shell              | Nexos API                                    |
| `/`                      | Dashboard              | AppShell               | Nexos API `/operations/dashboard` + realtime |
| `/inbox`                 | Lista de conversas     | AppShellFull           | Nexos API + realtime/polling                 |
| `/inbox/$conversationId` | Conversa               | AppShellFull           | Nexos API + realtime/polling                 |
| `/clientes`              | Clientes               | AppShell               | Nexos API CRM                                |
| `/contatos`              | Contatos               | AppShell               | Nexos API CRM + Connections reais            |
| `/historico`             | Historico              | AppShellFull           | Nexos API `/operations/history/*`            |
| `/mensagens-rapidas`     | Quick replies          | AppShell               | Nexos API                                    |
| `/relatorios`            | Relatorios             | AppShell               | Nexos API `/operations/reports/*`            |
| `/chamados`              | Chamados               | AppShell               | Nexos API Tickets                            |
| `/instancias`            | Instancias             | AppShell               | Nexos API                                    |
| `/perfis`                | Perfis de acesso       | AppShell               | Supabase                                     |
| `/atendentes`            | Atendentes             | AppShell               | Mock store + Supabase perfis                 |
| `/departamentos`         | Departamentos          | AppShell               | Mock store + Supabase escopos                |
| `/etiquetas`             | Etiquetas              | AppShell               | Nexos API                                    |
| `/empresas`              | Empresas legado        | AppShell               | Mock store                                   |
| `/campanhas`             | Campanhas              | AppShell               | Nexos API Campaigns                          |
| `/filas`                 | Filas admin            | AppShell               | Nexos API `/operations/queues`               |
| `/chatbot`               | Fluxo de Bot           | AppShell               | Arrays hardcoded                             |
| `/automacoes`            | Automacoes             | AppShell               | Nexos API Automations                        |
| `/agente-ia`             | Agente IA              | AppShell               | UI hardcoded                                 |
| `/ajuda`                 | Ajuda                  | AppShell               | Arrays hardcoded                             |
| `/perfil`                | Perfil                 | AppShell               | Session store/local UI                       |
| `/configuracoes/*`       | Configuracoes          | AppShell               | Local UI, localStorage e hardcodes           |
| `/atendimento/*`         | Rotas legadas operador | OperatorShell/redirect | Mock store/session                           |
| `/admin/*`               | Super Admin            | AdminShell             | Mock SaaS/hardcodes                          |

## Fluxos principais

Login legado Sprint 00:

```text
Submit -> LoginPage -> ensureDemoUsers opcional -> signIn -> Supabase Auth -> hydrateSession -> useSession -> redirect
```

Login Sprint 01:

```text
Submit -> LoginPage -> POST /api/auth/login -> tokens + tenant -> useSession.loginAs -> redirect
  fallback local -> Supabase signIn legado quando a API Nexos nao responde ou rejeita a tentativa
```

Atendimento:

```text
Abrir inbox -> Nexos API -> assumir/responder/transferir/encerrar -> Prisma -> realtime/polling -> UI atualizada
```

Chamado:

```text
Abrir modal -> preencher campos -> Tickets API -> sanitizacao server-side -> lista atualizada
```

Contexto autenticado novo:

```text
Bearer token -> GET /api/me -> usuario + tenant + permissoes
Bearer token -> GET /api/tenant-records/:id -> retorno apenas se tenantId coincidir
```

Fluxos Sprint 02:

```text
Login -> POST /api/auth/login -> tokens Nexos -> useSession -> GET /api/me -> permissoes
```

```text
/departamentos -> GET /api/departments -> criar/editar/desativar via Nexos API
```

```text
/atendentes -> GET /api/users + /api/roles + /api/departments
  -> criar/editar/desativar membership do tenant
```

```text
/perfis -> GET /api/roles -> criar/editar/remover roles customizadas
  -> permissionIds validadas pelo backend
```

Rotas atualizadas na matriz:

- `/login`: Nexos API.
- `/perfis`: Nexos API.
- `/atendentes`: Nexos API.
- `/departamentos`: Nexos API.
- `/configuracoes/usuarios`: Nexos API.
- `/configuracoes/permissoes`: Nexos API.

## Sprint 06 - Inbox

Para o usuario, o envio textual da Inbox permanece igual. Internamente, a API persiste a mensagem, resolve a connection do tenant, chama o Development Provider e marca a mensagem como `sent` ou `failed`. Nenhum detalhe tecnico do provider deve aparecer na UX normal.

## Sprint 07 - Instancias Evolution

Administradores e supervisores podem abrir `/instancias`, criar uma connection Evolution, solicitar QR Code, atualizar status e desconectar. Atendentes podem consultar connections para contexto operacional.

Na Inbox, o envio textual permanece no mesmo composer. Quando a conversa esta ligada a uma connection Evolution conectada, o backend envia pela Evolution API; quando nao ha connection configurada, o backend retorna erro explicito.

## Sprint 07.01 - Instancias reais

`/instancias` mostra apenas connections Evolution. Connections Development seedadas nao aparecem como canal operacional. A tela permite status, QR, desconexao e remocao. Se a instance foi removida na Evolution mas ainda existe no Nexos, o usuario recebe diagnostico de instance ausente e pode remover a connection local.

# Sprint 08 - Nova conversa e outbound assincrono

Fluxo preservado:

```text
Inbox -> Nova conversa -> Contact -> Connection WhatsApp conectada -> Message
```

A primeira mensagem aparece como `queued` apos o HTTP persistir Message + OutboxEvent. O polling existente atualiza a UI para `sending`, `sent` ou `failed` conforme o worker processa o job.

# Sprint 08.01 - Resposta inbound e reconnect

Quando o cliente responde pelo WhatsApp, o inbound reutiliza o Contact e a Conversation aberta compativeis com a connection. Variacoes tecnicas do JID da Evolution nao devem aparecer para o usuario como contatos duplicados.

Depois de logout/reconnect, a mesma instancia/connection deve voltar a receber webhook. Mensagens novas apos reconnect aparecem uma vez na mesma Conversation; replays do provider nao alteram unread nem lastMessage.

# Sprint 08.02 - Contatos na homologacao limpa

No ambiente resetado, `/contatos` deve iniciar sem contatos operacionais. Criar, editar, excluir e recriar o mesmo telefone deve funcionar sem erro generico. Se o contato estava arquivado, ele volta para a lista como restaurado. Se ja existe ativo, a UI mostra que ja existe um contato ativo com este telefone.

# Sprint 08.03 - Login real

Fluxo atualizado:

```text
Abrir /login
  -> health pre-login mostra API/database/Redis
  -> usuario informa email e senha
  -> POST /api/auth/login
  -> tokens salvos
  -> GET /api/auth/me no bootstrap
  -> redirect para rota principal
  -> F5 preserva sessao
  -> logout limpa sessao e volta para /login
```

A tela nao preenche credenciais demo e nao oferece selecao visual de perfil. Erros especificos sao exibidos inline e em toast:

- API offline;
- email ou senha invalidos;
- falta de acesso a organizacao ativa;
- excesso de tentativas;
- erro interno de autenticacao.

## Sprint 08.04 - Nova conversa e inbound

Nova conversa:

```text
Inbox -> Nova conversa -> GET /api/messaging/connections
  -> filtra Evolution connected
  -> seleciona Connection real
  -> cria/reusa Conversation
  -> envia primeira Message outbound
```

Sem Connection conectada, a UI mostra estado vazio e orienta conectar uma instancia. Erro da API e exibido
como erro real; nao ha preenchimento com exemplo.

Inbound segue polling/refetch enquanto Socket.io estiver fora de escopo. A resposta do cliente deve aparecer
na mesma Conversation aberta quando o webhook persistir a Message inbound.

## Sprint 09 - Inbox ao vivo

Ao entrar na Inbox, o frontend conecta no realtime autenticado quando `VITE_NEXOS_REALTIME_ENABLED` nao e
`false`. Ao abrir uma Conversation, subscreve a room da conversa apos autorizacao server-side. Mensagens,
status, unread e lista de conversas atualizam por eventos; em queda do socket, a tela volta para
atualizacao periodica REST e reconcilia apenas em transicoes reais de conexao.

### Rework II - Inbox runtime

`InboxLayout` nao depende de socket conectado para renderizar. O conteudo base vem de REST; Socket.io
apenas melhora a atualizacao. Quando `VITE_NEXOS_REALTIME_ENABLED=false`, o hook retorna `disabled`, nao
instancia socket, nao cria subscriptions e mantem polling REST.

A causa do crash era o snapshot instavel de `useSyncExternalStore` em `src/lib/realtime/client.ts`.
`realtimeSnapshot()` retornava um objeto novo a cada chamada mesmo sem mudanca de estado, retroalimentando
render em `InboxLayout`. O snapshot agora e cacheado e so muda quando `status` ou `lastEventId` mudam.

## Sprint 10 Rework - Tags e Quick Replies

```text
/etiquetas -> GET/POST/PATCH/DELETE /api/tags -> catalogo tenant-scoped
Inbox Contact panel -> GET /api/crm/tags -> POST/DELETE /api/contacts/:id/tags/:tagId
/mensagens-rapidas -> GET/POST/PATCH/DELETE /api/quick-replies
Composer -> seleciona Quick Reply -> insere texto -> usuario envia mensagem separadamente
```

Admin gerencia catalogos e cria Conversation no tenant inteiro. Agente usa Tags existentes e le Quick
Replies, sem botoes de criacao/edicao de catalogo quando nao possui as permissions de manage.

# Fluxo de Chamados

Usuario autorizado cria Ticket, seleciona Department, prioridade, categoria e vinculos opcionais de Contact/Customer/Conversation. Comentarios ficam internos ao time. Anexos sao baixados por endpoint autenticado.
