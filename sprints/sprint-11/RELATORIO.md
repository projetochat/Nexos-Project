# SPRINT 11 — RELATORIO FINAL

## 1. Status

Sprint 11 implementada tecnicamente em modo backend/frontend/documentacao, com gate fisico pendente.

## 2. Resumo executivo

Chamados deixou de usar Supabase/MVP no runtime operacional. Foi criado dominio `Ticket` no NestJS/Prisma, com workflow, comentarios internos, historico, anexos privados, storage abstraction, sanitizacao server-side e rota `/chamados` migrada para Nexos API.

## 3. Baseline Sprint 10

- Sprint 08.x: CONCLUIDA
- Sprint 09: CONCLUIDA
- Sprint 10: CONCLUIDA E HOMOLOGADA
- Sprint 11: AUTORIZADA

Commit base Sprint 10 consolidado: `35bea7d`.

## 4. Fechamento Sprint 10

`sprints/sprint-10/RELATORIO.md` termina uma unica vez com `READY FOR SPRINT 11`.

## 5. Preflight

- Branch inicial: `sprint/10-inbox-domain-legacy-removal`
- SHA inicial: `fb6ae33c535f1a34e1329af3d66262432ec0f7c1`
- Branch Sprint 11: `sprint/11-ticketing-secure-attachments`
- Worktree inicial: limpa
- Bun: `1.3.14`
- Node: `v24.14.0`

## 6. Legacy audit

Auditoria encontrou `/chamados` com `@/lib/mvp`, Supabase, `innerHTML`, `contentEditable`, `FileReader` e `insertHTML`. O arquivo foi reescrito para Nexos API.

## 7. Unsafe HTML audit

Runtime operacional de `/chamados` nao usa `dangerouslySetInnerHTML`, `innerHTML`, `contentEditable`, `insertHTML`, Supabase, MVP ou mock store. Guarda `scripts/check-ticket-legacy-runtime.mjs` integrada ao `verify`.

## 8. Ticket domain

Criados `Ticket`, `TicketProtocolCounter`, `TicketComment`, `TicketHistory` e `TicketAttachment`.

## 9. Ticket workflow

Status oficiais: `ABERTO`, `EM_ANDAMENTO`, `AGUARDANDO`, `RESOLVIDO`, `FECHADO`, `CANCELADO`. Transicoes invalidas retornam `TICKET_STATUS_TRANSITION_INVALID`.

## 10. Ticket relations

Ticket vincula Department obrigatorio e, opcionalmente, assigned membership, Contact, Customer e Conversation.

## 11. Comments

Comentarios sao internos ao time Nexos e nao geram Message WhatsApp.

## 12. History

Eventos registrados: abertura, update, status, atribuicao, departamento, comentarios e anexos.

## 13. Attachments

Anexos possuem metadata privada, status `PENDING/READY/DELETED/REJECTED`, scan boundary e download autenticado.

## 14. Storage abstraction

`FileStorageProvider` abstrai `createUpload`, `completeUpload`, `getDownloadObject`, `deleteObject` e `headObject`.

## 15. Local provider

`LocalPrivateStorageProvider` grava fora do repositorio por `NEXOS_STORAGE_LOCAL_PATH` e bloqueia traversal.

## 16. R2 provider

`R2StorageProvider` criado como boundary S3-compatible, sem exigir credenciais reais no `verify`.

## 17. Upload flow

Frontend chama init, envia bytes no complete local e metadata passa a `READY`; base64 nao e persistido no banco.

## 18. Download security

Download passa por JWT, tenant, visibilidade do Ticket e status do anexo.

## 19. Sanitization

Backend permite apenas HTML minimo e remove scripts, iframes, handlers, `javascript:` e imagens inline. Frontend usa textarea e renderiza texto seguro.

## 20. XSS closure

E2E cobre `<script>`, `img onerror`, `javascript:` e `iframe`; persistencia retorna HTML sanitizado.

## 21. API

Criados endpoints `/api/tickets`, comentarios e attachments conforme Sprint.

## 22. RBAC

Permissoes `tickets.*` adicionadas. Tenant admin tem escopo total do tenant; agente fica restrito.

## 23. Tenant isolation

E2E confirma tenant Orbit nao acessa Ticket Acme por UUID.

## 24. Department isolation

Visibilidade server-side restringe por departamento permitido ou responsavel atribuido.

## 25. Realtime

Eventos `ticket.*` adicionados ao backend/frontend. Publicacao ocorre apos persistencia.

## 26. Frontend list

`/chamados` lista via Nexos API com busca, status, prioridade, loading, empty e error via query.

## 27. Frontend detail

Detalhe exibe protocolo, status, prioridade, descricao texto, vinculos, comentarios e anexos.

## 28. Editor

Textarea seguro substitui rich editor antigo.

## 29. Comments UI

Comentarios internos com autor, data e texto.

## 30. Attachments UI

Upload/download/delete privados sem object key exposta.

## 31. Conversation integration

`/chamados?conversationId=...` preenche vinculo inicial e Ticket permite abrir Conversation relacionada.

## 32. Contact/Customer integration

Criacao usa Contacts/Customers reais via APIs existentes.

## 33. Automated tests

- Verify inicial: PASS.
- Backend tests: PASS, 20 arquivos, 111 testes.
- Typecheck: PASS.
- Backend build: PASS.
- Ticket legacy runtime check: PASS.

## 34. Physical tests

Nao executados nesta sessao: admin fisico, atendente fisico, XSS fisico, anexos fisicos, multiusuario, realtime offline e storage offline.

## 35. Regressions

Backend tests preservam auth, Inbox, Evolution webhook, Redis/BullMQ/Outbox e messaging.

## 36. Performance

Listagem paginada server-side e indices tenant-scoped criados. Descricao completa nao e necessaria para listagem.

## 37. Typecheck/lint

Typecheck PASS. Lint baseline PASS no `verify` final.

## 38. Builds

Backend build PASS. Frontend build PASS no `verify` final.

## 39. Verify

Verify inicial PASS. Verify final duplo PASS apos documentacao.

## 40. Files created

Principais: `backend/src/tickets/*`, migration `20260804030000_ticketing_secure_attachments`, `docs/TICKETING.md`, `docs/STORAGE.md`, `scripts/check-ticket-legacy-runtime.mjs`.

## 41. Files changed

Prisma schema, AppModule, Health, Realtime, auth permissions, `/chamados`, Nexos API client, docs e sprints.

## 42. Files removed

Runtime antigo de `/chamados` foi substituido no mesmo arquivo.

## 43. Documentation

Docs gerais atualizados e novos docs Ticketing/Storage criados.

## 44. M01-M127

| Metrica | Resultado | Evidencia | Status |
| --- | --- | --- | --- |
| M01-M05 | Baseline, branch e verify inicial concluídos | preflight + `bun run verify` | PASS |
| M06-M10 | Legacy/unsafe/data URL auditados e removidos de `/chamados` | `rg` + guarda anti-legado | PASS |
| M11-M25 | Modelo Ticket, protocolo, workflow, relations, comments, history, attachments | Prisma + NestJS | PASS |
| M26-M30 | Migration `nexos_1100`, `nexos_0802`, `nexos_0801` | migrate deploy sem reset | PASS |
| M31-M45 | APIs Ticket/comment/attachment | Controller/service + E2E | PASS |
| M46-M51 | Sanitizacao e zero inline image runtime | sanitizer + route rewrite | PASS |
| M52-M63 | Storage abstraction/local/R2/safe keys/MIME/size/scanner | storage providers | PASS |
| M64-M72 | RBAC/isolation/realtime/post-commit | permissions + publisher + E2E | PASS |
| M73-M85 | Frontend list/detail/editor/comments/attachments/cache/anti-legacy | `/chamados` + script | PASS |
| M86-M95 | Ticket/status/RBAC/tenant/comment/XSS/attachment/local/R2 tests | E2E parcial; R2 boundary sem mock dedicado | PARTIAL |
| M96-M107 | Testes fisicos | nao executados nesta sessao | PARTIAL |
| M108-M119 | Regressao/typecheck/build/backend tests/verify | typecheck, builds, backend tests e verify duplo PASS | PASS |
| M120-M124 | Docs/changelog/report | docs atualizados | PASS |
| M125-M127 | Commit/git clean/gate | commit/git clean pendente; gate fisico pendente | PARTIAL |

## 45. Technical debt

- R2 provider e boundary criado, mas testes com mock S3-compatible dedicados ainda devem ser aprofundados.
- Frontend usa complete local com base64 transitório; nao persiste no banco, mas provider R2 final deve usar upload direto/presigned.
- Historico existe no backend, mas UI ainda nao exibe timeline completa.

## 46. Risks

Gate fisico nao executado nesta sessao. Nao liberar Sprint 12 sem admin/agente fisico, XSS fisico, anexos, multiusuario, realtime offline e storage offline.

## 47. Commits

Pendente commit final da Sprint 11.

## 48. Final Git state

Pendente validacao final.

## Rework — Tickets Controller DI & Physical Runtime Recovery

### Causa raiz

`backend/src/tickets/tickets.controller.ts` usava injecao por metadata implicita no constructor. Em runtime fisico, o controller foi instanciado, mas a referencia usada como service chegou `undefined`, causando TypeError antes da regra de negocio em `GET /api/tickets` e `POST /api/tickets`.

Arquivo corrigido: `backend/src/tickets/tickets.controller.ts`.

Linhas relevantes apos correcao:

- `35`: `constructor(@Inject(TicketsService) private readonly ticketsService: TicketsService) {}`
- `40`: `this.ticketsService.list(...)`
- `46`: `this.ticketsService.create(...)`

Provider ausente/metadata incorreta: provider existia no module, mas a injecao dependia de metadata implicita. A correcao aplicou import runtime de `TicketsService` com `@Inject(TicketsService)` e exportou `TicketsService` em `TicketsModule`.

Teste que impede regressao: bootstrap real de `AppModule`, compile real de `TicketsModule`, resolve de `TicketsController`/`TicketsService`, `GET /api/tickets` e `POST /api/tickets` com app Nest real.

### Evidencia fisica HTTP

Backend iniciado em `nexos_0802` com tenant `homologacao`.

- HTTP fisico `GET /api/tickets`: `200`
- HTTP fisico `POST /api/tickets`: `201`
- HTTP fisico detalhe `GET /api/tickets/:id`: `200`
- Protocolo fisico gerado: `TKT-000002`
- Ticket encontrado na listagem por protocolo: `true`
- `controllerInstance`: `TicketsController`
- `servicePresent`: `true`
- `serviceConstructorName`: `TicketsService`
- `moduleLoaded`: `true`
- `providerResolved`: `true`
- `TypeError`: `false`
- `Internal server error`: `false`

Observacao: teste visual automatizado de UI nao foi executado nesta sessao porque nao havia browser/Playwright callable disponivel. O bloqueio inicial foi encerrado por HTTP fisico real contra o backend local em `3001`; a homologacao visual completa deve continuar a partir do workflow de Chamados.

### Metricas M128-M151

| Metrica | Meta | Resultado | Evidencia | Status |
| --- | --- | --- | --- | --- |
| M128 | Reproduzir falha fisica de listagem | Falha original reconhecida; GET reexecutado apos correcao | `GET /api/tickets -> 200` em `nexos_0802` | PASS |
| M129 | Reproduzir falha fisica de criacao | Falha original reconhecida; POST reexecutado apos correcao | `POST /api/tickets -> 201` em `nexos_0802` | PASS |
| M130 | Auditar constructor do controller | Constructor auditado | `tickets.controller.ts:35` | PASS |
| M131 | Auditar import runtime do service | `TicketsService` importado como valor | `import { TicketsService }` | PASS |
| M132 | Auditar providers do module | Service em providers e exports | `tickets.module.ts` | PASS |
| M133 | Aplicar DI explicita | `@Inject(TicketsService)` aplicado | `tickets.controller.ts:35` | PASS |
| M134 | Teste bootstrap resolution | AppModule compila e resolve controller/service | backend tests | PASS |
| M135 | Teste DI controller | TicketsModule compila e resolve controller/service | backend tests | PASS |
| M136 | GET tickets e2e | Listagem retorna shape esperado | backend tests + HTTP fisico 200 | PASS |
| M137 | POST tickets e2e | Criacao persiste Ticket e protocolo | backend tests + HTTP fisico 201 | PASS |
| M138 | Physical list | Listagem fisica sem TypeError | `GET /api/tickets -> 200` | PASS |
| M139 | Physical create | Criacao fisica sem TypeError | `POST /api/tickets -> 201` | PASS |
| M140 | Protocol physical | Protocolo gerado | `TKT-000002` | PASS |
| M141 | Detail physical | Detalhe abre por API | `GET /api/tickets/:id -> 200` | PASS |
| M142 | Zero TypeError | Sem TypeError no response fisico final | `typeError=false` | PASS |
| M143 | Zero Internal server error | Sem 500 generico no response fisico final | `internalServerError=false` | PASS |
| M144 | Backend tests | Suite backend passa | 20 arquivos, 115 testes | PASS |
| M145 | Frontend checks | Typecheck/build/guard passam | `bun run typecheck`, `bun run build`, `test:ticket-legacy-runtime` | PASS |
| M146 | Verify #1 | Verify completo passa | `bun run verify` | PASS |
| M147 | Verify #2 | Verify completo passa novamente | `bun run verify` | PASS |
| M148 | Report | Relatorio atualizado | esta secao | PASS |
| M149 | Commit | Commit final do rework realizado apos validacao | git | PASS |
| M150 | Git clean | Worktree final limpa apos commit | git status | PASS |
| M151 | Gate | Sprint 12 permanece bloqueada | `NOT READY FOR SPRINT 12` | PASS |

## Rework Final - Inbox Ticket Creation & Attachment Pipeline Recovery

### Causa raiz

A Inbox ainda mantinha um placeholder operacional em `src/routes/inbox.$conversationId.tsx`: o botao de gerar chamado executava `window.alert` e lancava erro informando que a Inbox exigia a API oficial de Chamados, mesmo apos o dominio de Tickets estar disponivel. Isso impedia o fluxo real Inbox -> Chamados.

O upload anterior de anexo usava o contrato `init + complete` com JSON/base64 (`contentBase64`). Para um PDF fisico de aproximadamente 249 KB, o payload crescia dentro de `application/json` e entrava pelo parser JSON do Express/Nest, gerando risco real de `request entity too large` antes da camada de storage. O novo contrato usa corpo binario direto em `POST /api/tickets/:id/attachments`, com `Content-Type` do arquivo, por exemplo `application/pdf`, e headers sanitizados `X-File-Name` e `X-File-Size`.

A inconsistenia de Attachment vinha da criacao antecipada de metadata `PENDING` no `init`, antes dos bytes estarem persistidos. A listagem tambem podia expor anexos nao prontos. Agora o endpoint unico valida tamanho/MIME/assinatura, grava o objeto, confirma `headObject`, marca `READY` somente depois da existencia fisica, publica realtime apenas apos `READY`, lista somente `READY` nao deletado e marca falhas como `REJECTED`/`DELETED` sem expor object key completo.

### Correcao aplicada

- Inbox removeu `window.alert` e o placeholder, abrindo `/chamados?conversationId=...` para criacao real.
- Chamados preenche dados a partir da Conversation e envia upload binario direto.
- Backend removeu `attachments/init` e `attachments/:attachmentId/complete`.
- Backend adicionou `POST /api/tickets/:id/attachments`, `GET .../download` e `GET .../inline`.
- Backend aplica limite de 10 MB, allowlist de MIME, assinatura basica de arquivo, filename sanitizado e erro canonico.
- Auditoria `backend/scripts/audit-ticket-attachments.mjs` lista status, existencia fisica e hash da object key, nunca o caminho completo.
- Cleanup marcou como `DELETED` dois registros `PENDING` sem objeto em `nexos_0802`.

### Evidencia fisica HTTP

Ambiente fisico usado: backend em `3001`, banco `nexos_0802`, storage local.

- Criacao de Ticket vinculado a Conversation: `POST /api/tickets -> 201`.
- `conversationIdPresent=true`.
- `contactPrefilled=true`.
- `customerPrefilled=false` porque a Conversation fisica escolhida nao tinha customer vinculado; inferencia de customer esta coberta por teste backend.
- Protocolo fisico criado: `TKT-000005`.
- Upload PDF real: `POST /api/tickets/:id/attachments -> 201`.
- Arquivo fisico: `homologacao-249kb.pdf`, `Content-Type=application/pdf`, `sizeBytes=254976`.
- Attachment fisico: `381eb6c0-edd7-438c-852b-e7d47714a7d7`, `status=READY`, `objectExists=true`.
- Download: `GET /download -> 200`, `Content-Disposition=attachment`.
- Visualizacao inline: `GET /inline -> 200`, `Content-Disposition=inline`.
- Upload grande: `413`, `code=ATTACHMENT_TOO_LARGE`.
- `requestEntityTooLarge=false`.
- `inaccessibleAttachment=false`.

### Validacao

- `bun run --cwd backend build`: PASS.
- `bun run typecheck`: PASS.
- `bun run build`: PASS.
- `bun run test:ticket-legacy-runtime`: PASS.
- `bun run --cwd backend test`: PASS, 20 arquivos, 115 testes.
- `bun run verify` #1: PASS.
- `bun run verify` #2: PASS.

### Metricas M152-M191

| Metrica | Meta | Resultado | Evidencia | Status |
| --- | --- | --- | --- | --- |
| M152 | Reproduzir placeholder da Inbox | Placeholder identificado antes da correcao | `rg` em `inbox.$conversationId.tsx` | PASS |
| M153 | Remover placeholder | `window.alert` e erro falso removidos | Inbox navega para `/chamados` | PASS |
| M154 | Prefill Conversation | Chamados recebe `conversationId` | URL `/chamados?conversationId=...` | PASS |
| M155 | Prefill Contact | Contact inferido fisicamente | `contactPrefilled=true` | PASS |
| M156 | Prefill Customer | Backend infere quando Conversation tem customer | E2E; amostra fisica sem customer | PARTIAL |
| M157 | Criacao Inbox -> Ticket | Ticket fisico criado | `POST /api/tickets -> 201`, `TKT-000005` | PASS |
| M158 | Auditar pipeline upload | Fluxo antigo e novo auditados | controller/service/API client | PASS |
| M159 | Identificar base64 | `contentBase64` removido | guarda anti-legado | PASS |
| M160 | Remover upload base64 | Endpoints init/complete removidos | `check-ticket-legacy-runtime` | PASS |
| M161 | Upload binario | Corpo binario direto | `Content-Type=application/pdf` | PASS |
| M162 | PDF 249 KB fisico | Upload aceito | `201`, `sizeBytes=254976` | PASS |
| M163 | Atomicidade | Metadata vira READY apos objeto existir | `headObject` antes de READY | PASS |
| M164 | Cleanup de falha | Falhas rejeitadas/deletadas | cleanup de 2 PENDING sem objeto | PASS |
| M165 | Consistencia READY/objeto | READY exige objeto existente | audit + download fisico | PASS |
| M166 | Listagem segura | Lista somente READY nao deletado | `attachments()` filtrado | PASS |
| M167 | Limite de tamanho | Arquivo grande rejeitado | `413 ATTACHMENT_TOO_LARGE` | PASS |
| M168 | MIME seguro | MIME bloqueado rejeitado | teste `.exe -> 415` | PASS |
| M169 | Filename seguro | Nome sanitizado | E2E filename CR/LF/aspas | PASS |
| M170 | Download autorizado | Download passa por RBAC e READY | E2E + HTTP 200 | PASS |
| M171 | Visualizacao inline | Inline separado de download | HTTP 200 inline | PASS |
| M172 | Objeto ausente | Falha canonica | `409 ATTACHMENT_OBJECT_MISSING` | PASS |
| M173 | Auditoria/cleanup PENDING | Script criado e executado | `audit:ticket-attachments`, `cleanup:ticket-attachments` | PASS |
| M174 | Realtime apos READY | Evento emitido somente apos READY | service post-commit | PASS |
| M175 | Testes frontend Inbox | Coberto por typecheck/build/guard | sem Playwright UI nesta sessao | PARTIAL |
| M176 | Testes frontend upload | Coberto por typecheck/build/guard | sem teste componente dedicado | PARTIAL |
| M177 | Testes backend upload | Upload binario coberto | backend E2E | PASS |
| M178 | Testes download/inline | Download e inline cobertos | backend E2E | PASS |
| M179 | Cross-tenant | RBAC/tenant preservado | backend E2E existente | PASS |
| M180 | Department visibility | Regras preservadas | backend E2E existente | PASS |
| M181 | Reabrir/F5 fisico | API persiste e lista apos criacao | UI F5 nao automatizado | PARTIAL |
| M182 | RBAC fisico | Backend cobre admin/agente/cross-tenant | UI fisica nao automatizada | PARTIAL |
| M183 | Zero request entity too large | Upload grande retorna erro canonico | `requestEntityTooLarge=false` | PASS |
| M184 | Zero attachment inacessivel | READY fisico abre download/inline | `inaccessibleAttachment=false` | PASS |
| M185 | Regressao Ticket core | Criacao/listagem/status preservados | backend tests | PASS |
| M186 | Verify #1 | Verificacao completa passa | `bun run verify` | PASS |
| M187 | Verify #2 | Verificacao completa passa novamente | `bun run verify` | PASS |
| M188 | Relatorio | Secao final documentada | esta secao | PASS |
| M189 | Commit | Commit final realizado apos validacao | git | PASS |
| M190 | Git clean | Worktree limpa apos commit | git status | PASS |
| M191 | Gate | Sprint 12 permanece bloqueada | pendencias fisicas de UI completa | PASS |

## 49. Gate

NOT READY FOR SPRINT 12
