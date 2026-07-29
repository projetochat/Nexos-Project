# Fluxo do Usuario

## Rotas reais

| Rota                     | Tela                   | Layout                 | Origem principal dos dados                |
| ------------------------ | ---------------------- | ---------------------- | ----------------------------------------- |
| `/login`                 | Login                  | Sem shell              | Supabase Auth, demo server function       |
| `/`                      | Dashboard              | AppShell               | Supabase via `REPORTS`, realtime          |
| `/inbox`                 | Lista de conversas     | AppShellFull           | Supabase + localStorage prefs             |
| `/inbox/$conversationId` | Conversa               | AppShellFull           | Supabase + media local/data URL           |
| `/clientes`              | Clientes               | AppShell               | Supabase via `CUSTOMERS`                  |
| `/contatos`              | Contatos               | AppShell               | Supabase via `CONTACTS/CUSTOMERS/CATALOG` |
| `/historico`             | Historico              | AppShellFull           | Supabase via `CONV/CATALOG`               |
| `/simulador`             | Simulador              | AppShell               | Supabase + ghosts hardcoded               |
| `/mensagens-rapidas`     | Quick replies          | AppShell               | Supabase via `QUICK_REPLIES`              |
| `/relatorios`            | Relatorios             | AppShell               | Supabase via `REPORTS`                    |
| `/chamados`              | Chamados               | AppShell               | Supabase + HTML local                     |
| `/instancias`            | Instancias             | AppShell               | Supabase                                  |
| `/perfis`                | Perfis de acesso       | AppShell               | Supabase                                  |
| `/atendentes`            | Atendentes             | AppShell               | Mock store + Supabase perfis              |
| `/departamentos`         | Departamentos          | AppShell               | Mock store + Supabase escopos             |
| `/etiquetas`             | Etiquetas              | AppShell               | Mock store                                |
| `/empresas`              | Empresas legado        | AppShell               | Mock store                                |
| `/campanhas`             | Campanhas              | AppShell               | Mock store                                |
| `/filas`                 | Filas admin            | AppShell               | Mock store                                |
| `/chatbot`               | Fluxo de Bot           | AppShell               | Arrays hardcoded                          |
| `/automacoes`            | Automacoes             | AppShell               | Arrays hardcoded                          |
| `/agente-ia`             | Agente IA              | AppShell               | UI hardcoded                              |
| `/ajuda`                 | Ajuda                  | AppShell               | Arrays hardcoded                          |
| `/perfil`                | Perfil                 | AppShell               | Session store/local UI                    |
| `/configuracoes/*`       | Configuracoes          | AppShell               | Local UI, localStorage e hardcodes        |
| `/atendimento/*`         | Rotas legadas operador | OperatorShell/redirect | Mock store/session                        |
| `/admin/*`               | Super Admin            | AdminShell             | Mock SaaS/hardcodes                       |

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
Abrir inbox -> CONV.list/messages -> Supabase -> assumir/responder/transferir/encerrar -> mutacoes Supabase -> query invalidate/realtime -> UI atualizada
```

Simulador:

```text
Selecionar contato/ghost -> SIMULATOR.sendContactMessage -> cria/reusa conversa -> insere message contact -> realtime -> Inbox
```

Chamado:

```text
Abrir modal -> preencher campos/editor HTML -> sanitizeRichTextHtml -> supabase.from("chamados").insert/update -> lista atualizada
```

Contexto autenticado novo:

```text
Bearer token -> GET /api/me -> usuario + tenant + permissoes
Bearer token -> GET /api/tenant-records/:id -> retorno apenas se tenantId coincidir
```
