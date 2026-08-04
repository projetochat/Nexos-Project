# Sprint 14 - Product Completion, Automation, Lead Routing, Notifications & Production Pilot Readiness

Status: PARTIAL PASS. Implementacao tecnica integrada e verificada. Homologacao fisica ponta a ponta ainda deve ser retomada antes de declarar producao assistida.

## Estado Formal

- Sprint 08.x: CONCLUIDA
- Sprint 09: CONCLUIDA
- Sprint 10: CONCLUIDA
- Sprint 11: CONCLUIDA
- Sprint 12: CONCLUIDA
- Sprint 13: CONCLUIDA E HOMOLOGADA
- Sprint 14: AUTORIZADA

## Preflight

- Branch inicial: `sprint/14-product-completion-production-readiness`
- SHA inicial: `c5d676d1eff9fa9314e879a8c7303a3db1d9b69a`
- Commit final Sprint 13: `c5d676d docs: close sprint 13 physical gate`
- Worktree inicial: limpo para arquivos rastreados; `.local-storage/` preservado como untracked preexistente.
- Bun: `1.3.14`
- Node: `v24.14.0`
- Docker: `29.1.3`
- Docker Compose: `v2.40.3-desktop.1`

## Auditoria Global

Comando executado:

```powershell
rg -n "mock|demo|placeholder|TODO|FIXME|alert\(|console\.log|Supabase|@/lib/mvp|@/lib/mock|hardcoded|Development Provider|fake|setTimeout|setInterval|Not implemented|Internal server error" src backend docs scripts
```

- PRODUCTION RUNTIME / MIGRATE: `/filas`, `/automacoes` e `/chatbot` ainda dependiam de mock/arrays locais. Migrado para Nexos API.
- TEST FIXTURE / KEEP: ocorrencias em `*.spec.ts`, `*.test.ts`, mocks de Vitest e fixtures de provider.
- SEED HOMOLOGATION / KEEP: `demo1234`, `SEED_DEMO_DATA`, usuarios locais e scripts de homologacao.
- DOCUMENTATION / DOCUMENT: referencias historicas a Supabase/mock/demo em `docs/*`, mantidas como memoria de migracao.
- TEMPORARY DEBT / DOCUMENT: `/historico`, `/simulador`, `/relatorios` e areas auxiliares ainda usam `@/lib/mvp`; nao foram declaradas como superficie principal concluida nesta entrega.
- SECURITY RISK / REMOVE: nenhum token hash, secret, jwt_key ou payload completo foi adicionado a logs.

## Implementado

- Migrations novas para `UserInvitation`, `PasswordResetToken`, `Lead`, `Notification` e `AutomationRule`.
- Permissoes novas: `leads.manage`, `notifications.read`, `notifications.manage`, `automations.read`, `automations.manage`.
- Inbound WhatsApp agora cria Contact, Conversation, Lead e Notification de forma idempotente.
- Lead routing: `PATCH /api/leads/:id/assign` atribui o lead, atualiza Conversation, gera protocolo quando necessario e emite realtime.
- Notificacoes: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`.
- Automacoes: `GET/POST/PATCH/DELETE /api/automations`, com regras `BOT_REPLY`, `ASSIGN_DEPARTMENT`, `NOTIFY_TEAM`.
- Convites: `GET/POST/PATCH /api/user-invitations`, token com hash em banco e URL exposta somente fora de producao ou por flag local.
- Primeiro acesso: `POST /api/auth/invitations/accept`.
- Reset de senha: `POST /api/auth/password/forgot` e `POST /api/auth/password/reset`.
- Login sem fallback silencioso para `homologacao` quando usuario tem multiplas memberships.
- Frontend: `/filas`, `/automacoes` e `/chatbot` migradas para Nexos API.

## Banco Fisico

Sem reset.

- `nexos_0801`: migrations `20260804140000`, `20260804140100`, `20260804140200` aplicadas.
- `nexos_0802`: migrations `20260804140000`, `20260804140100`, `20260804140200` aplicadas.

## Testes

- `bun run --cwd backend test -- app.e2e-spec.ts -t "invitation first access"`: PASS.
- `bun run --cwd backend test`: PASS, 24 arquivos, 160 testes.
- `bun run verify`: PASS.
- `bun run verify`: PASS novamente.

Cobertura adicionada:

- Webhook Evolution inbound idempotente cria uma Message, um Lead e notificacoes sem duplicar mensagem.
- Convite cria token local sem `tokenHash` na resposta, aceite ativa usuario/membership, reset troca senha e login novo funciona.
- Teste de CRM com telefone unico por execucao para evitar colisao com banco persistente.

## Pendencias Para Gate Fisico

- Retomar teste real WhatsApp B -> Evolution -> Nexos no `nexos_0802`.
- Confirmar zero `ECONNREFUSED` e zero `HTTP 401` correlacionados no webhook fisico.
- Confirmar Inbox sem F5, sem duplicacao, e lead/notificacao visiveis via API/UI.
- Exercitar criacao real de convite por tenant admin e aceite em navegador.
- Exercitar regra real de automacao em homologacao fisica.

NOT READY FOR PRODUCTION PILOT
