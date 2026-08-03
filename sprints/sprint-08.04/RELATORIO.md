# SPRINT 08.04 - RELATORIO FINAL

## 1. Status

PARTIAL. A correcao tecnica foi implementada e a regressao automatizada passou, mas o gate fisico completo nao foi executado nesta sessao.

## 2. Resumo executivo

Foram removidas fontes operacionais legadas do dropdown de Connections no Inbox, centralizando o consumo em `GET /api/messaging/connections`. O inbound real tinha uma divergencia concreta de contrato: a Evolution era configurada com header `jwt_key`, enquanto o controller aceitava apenas Bearer JWT. O webhook agora aceita `jwt_key` autenticado e mantem Bearer JWT para testes.

## 3. Baseline

Baseline Sprint 08.03: `546e96bfbd7650e137cdcceaa0ee598fba4c8b01`.

## 4. Preflight

Branch criada: `sprint/08.04-operational-data-inbound-closure`. Worktree inicial limpo. Commits recentes confirmados: 08.01 `3048f6b`, 08.02 `247ef9c`, 08.03 `546e96b`.

## 5. Estado fisico recebido do Product Owner

Recebido em 2026-08-03: Sprint 08.03 aprovada fisicamente; Sprint 08.02 reset, Contact lifecycle, Connection, Conversation e outbound smoke aprovados; Sprint 08.01 ainda NOT READY por inbound real nao aparecer.

## 6. Dropdown audit

`rg` identificou mocks administrativos e fluxos legados, alem de `contactOptions.instances` no Inbox. O modal de nova conversa ja chamava `connectionsApi.list`, mas faltava helper testado, erro real e estado vazio formal.

## 7. Legacy sources

Classificacao: `src/lib/api/index.ts` mock/dead para fluxo atual; `src/lib/mvp.ts` Supabase legacy; `contactOptions.instances` fallback operacional removido do Inbox.

## 8. Mock removal

O fluxo operacional de Connection no Inbox nao consome mock, fixture, exemplo, seed demo ou Supabase.

## 9. Real Connections API

Fonte unica: `connectionsApi.list()` -> `/messaging/connections`.

## 10. Connected filtering

Helper `connectedEvolutionConnections()` filtra `providerType === "evolution"` e `status === "connected"`.

## 11. Display fields

Label usa nome real da Connection, owner mascarado quando disponivel, provider e status.

## 12. Cache invalidation

Query do modal usa `staleTime: 0` e `refetchOnMount: "always"`. A pagina de instancias ja invalida `["nexos", "messaging-connections"]` em create/status/qr/logout/remove.

## 13. Inbound reproduction

Reproducao fisica com WhatsApp B nao executada nesta sessao. Diagnostico tecnico identificou divergencia real de auth entre configuracao Evolution e controller.

## 14. Evolution evidence

Evidencia de codigo: `EvolutionClient.setWebhook()` registra `headers: { jwt_key: webhookSecret }`.

## 15. Webhook configuration

`ensureWebhookConfigured(instanceName)` mantem URL publica, secret e eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE_UPDATE`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`.

## 16. Webhook authentication

Controller aceita `jwt_key` igual a `EVOLUTION_WEBHOOK_SECRET` e Bearer JWT assinado para compatibilidade.

## 17. Event type

Translator normaliza eventos uppercase com underscore para lowercase com ponto, por exemplo `MESSAGES_UPSERT` -> `messages.upsert`.

## 18. Translator

Translator retorna `inbound`, `status`, `connection` ou `ignored`.

## 19. Ignored reasons

Motivos canonicos adicionados: `FROM_ME`, `GROUP_MESSAGE`, `UNSUPPORTED_EVENT`, `MISSING_MESSAGE_ID`, `MISSING_REMOTE_IDENTITY`, `INVALID_PAYLOAD`, `CONNECTION_NOT_FOUND`.

## 20. Connection resolution

Webhook resolve Connection por `externalReference`/instanceName via `findByEvolutionInstance`.

## 21. Owner identity

Connection update continua extraindo owner JID e `ownerPhoneNormalized`.

## 22. Remote identity

Inbound usa `remoteJid` da mensagem como identidade do cliente, separado do owner conectado.

## 23. JID normalization

Cobertura automatizada para `@s.whatsapp.net`, `@c.us` e device suffix.

## 24. Contact resolution

Inbound busca Contact por candidatos normalizados no tenant antes de criar.

## 25. Conversation resolution

Conversation aberta por Contact + Connection e reutilizada; fallback por owner phone preservado para reconnect.

## 26. Message persistence

Message inbound persiste `direction=INBOUND`, `status=DELIVERED`, `externalMessageId`, `providerMessageId` e Connection correta.

## 27. Idempotency

Replay por `externalMessageId` nao cria nova Message e nao altera unread/lastMessage.

## 28. Frontend polling

Polling/refetch permanece mecanismo oficial ate Socket.io entrar em escopo.

## 29. Reconnect

Reconnect preserva Connection local e reexecuta ensure de webhook quando volta a `CONNECTED`.

## 30. Webhook ensure

Ensure idempotente executado em create, QR reconnect, status connected e webhook connection update.

## 31. Zero replay

Coberto por testes automatizados; nao comprovado fisicamente nesta sessao.

## 32. Outbound preservation

Redis, BullMQ, Outbox, Worker e status outbound nao foram refatorados.

## 33. Redis down

Nao executado fisicamente nesta sessao.

## 34. Redis recovery

Smoke automatizado de Redis/BullMQ passou em `bun run verify` no `nexos_0801`.

## 35. Exactly once

Cobertura automatizada de idempotencia passou; exactly-once fisico nao executado.

## 36. Disconnected behavior

Dropdown exclui disconnected. Outbound disconnected ja estava coberto por backend.

## 37. Development fallback

Dropdown e nova Conversation nao usam Development Provider como fallback.

## 38. Security

Webhook nao abre anonimamente. Logs sanitizados nao incluem secret, QR, telefone completo ou conteudo completo.

## 39. Tenant isolation

Connections endpoint e tenant-scoped no backend; helper assume resposta ja isolada e nao adiciona cross-tenant.

## 40. Tests

Focados PASS: `connection-options.test.ts`; translator/inbound specs; backend E2E incluso em verify `nexos_0801`.

## 41. Physical tests

Nao executados nesta sessao: navegador/WhatsApp/Evolution fisicos nao foram controlados aqui.

## 42. Regressions

`bun run verify` PASS em `nexos_0801`. Em `nexos_0802`, frontend passou e backend E2E falhou por ausencia esperada dos tenants `acme/orbit`, confirmando separacao de ambientes.

## 43. Typecheck/lint

Typecheck e lint baseline passaram no verify.

## 44. Builds

Frontend build e backend build passaram no verify.

## 45. Verify

Verify inicial em `nexos_0802`: PARTIAL, backend E2E incompatvel com massa fisica. Verify regressivo em `nexos_0801`: PASS.

## 46. Adendo 08.01

Adendo criado em `sprints/sprint-08.01/RELATORIO.md`.

## 47. Adendo 08.02

Adendo criado em `sprints/sprint-08.02/RELATORIO.md`.

## 48. Adendo 08.03

Adendo criado em `sprints/sprint-08.03/RELATORIO.md`.

## 49. Files created

- `src/lib/connection-options.ts`
- `src/lib/connection-options.test.ts`
- `sprints/sprint-08.04/RELATORIO.md`

## 50. Files changed

Frontend Inbox, Evolution webhook controller/translator/specs, E2E backend, docs e relatorios 08.01/08.02/08.03.

## 51. Files removed

Nenhum.

## 52. Documentation

Atualizados: README, ARCHITECTURE, API, BUSINESS_RULES, USER_FLOW, COMPONENTS, DEPLOY, ROADMAP, CHANGELOG, AUTHENTICATION.

## 53. M01-M105

| M    | Meta                                | Resultado                                       | Evidencia                      | Status  |
| ---- | ----------------------------------- | ----------------------------------------------- | ------------------------------ | ------- |
| M01  | baseline 08.03                      | `546e96b`                                       | `git rev-parse HEAD` inicial   | PASS    |
| M02  | worktree inicial clean              | limpo                                           | `git status`                   | PASS    |
| M03  | branch 08.04                        | criada                                          | `git branch --show-current`    | PASS    |
| M04  | verify inicial                      | `nexos_0802` parcial                            | backend E2E exige `acme/orbit` | PARTIAL |
| M05  | dropdown source audit               | executado                                       | `rg`                           | PASS    |
| M06  | mock source identified              | `contactOptions.instances` e legados mapeados   | audit                          | PASS    |
| M07  | mock source removed                 | Inbox operacional sem mock                      | diff                           | PASS    |
| M08  | Supabase operational source removed | filtro Inbox nao usa `contactOptions.instances` | diff                           | PASS    |
| M09  | single Connections API              | `/messaging/connections`                        | code                           | PASS    |
| M10  | tenant-scoped Connections           | backend list por `tenantId`                     | service/controller             | PASS    |
| M11  | connected filter                    | helper                                          | teste                          | PASS    |
| M12  | disconnected excluded               | helper                                          | teste                          | PASS    |
| M13  | real displayName                    | `connection.name`                               | helper                         | PASS    |
| M14  | zero example names                  | sem fallback                                    | teste                          | PASS    |
| M15  | empty dropdown state                | mensagem vazia                                  | UI code                        | PASS    |
| M16  | dropdown API error                  | erro real exibido                               | UI code                        | PASS    |
| M17  | dropdown cache invalidation         | refetch/invalidate                              | UI code                        | PASS    |
| M18  | inbound physical reproduction       | nao executado                                   | sem WhatsApp fisico            | FAIL    |
| M19  | Evolution received message          | nao observado                                   | sem logs fisicos               | FAIL    |
| M20  | Evolution emitted event             | nao observado                                   | sem logs fisicos               | FAIL    |
| M21  | webhook config real                 | contrato auditado                               | client spec/code               | PASS    |
| M22  | webhook URL correct                 | documentado/configurado por env                 | code/docs                      | PASS    |
| M23  | webhook events correct              | eventos no client                               | code/spec                      | PASS    |
| M24  | webhook auth correct                | `jwt_key` aceito                                | E2E                            | PASS    |
| M25  | backend webhook received            | automatizado                                    | E2E                            | PASS    |
| M26  | webhook HTTP status                 | 200 em teste                                    | E2E                            | PASS    |
| M27  | real event type                     | `MESSAGES_UPSERT` coberto                       | translator spec                | PASS    |
| M28  | translator result                   | inbound/status/connection/ignored               | tests                          | PASS    |
| M29  | ignoredReason observability         | canonico em logs                                | code                           | PASS    |
| M30  | fromMe handling                     | `FROM_ME`                                       | test                           | PASS    |
| M31  | group handling                      | `GROUP_MESSAGE`                                 | test                           | PASS    |
| M32  | Connection resolution               | instanceName                                    | service/controller             | PASS    |
| M33  | owner identity                      | preservada                                      | translator tests               | PASS    |
| M34  | remote identity                     | separada                                        | translator/inbound             | PASS    |
| M35  | real JID format                     | telefonico e c.us                               | tests                          | PASS    |
| M36  | Contact reuse                       | por normalizado                                 | inbound tests                  | PASS    |
| M37  | Conversation reuse                  | aberta reutilizada                              | inbound tests                  | PASS    |
| M38  | same Conversation                   | automatizado                                    | service/E2E                    | PASS    |
| M39  | externalMessageId new               | persiste                                        | tests                          | PASS    |
| M40  | externalMessageId replay            | ignora                                          | tests                          | PASS    |
| M41  | inbound persistence                 | cria Message                                    | E2E                            | PASS    |
| M42  | unread update                       | incrementa novo                                 | service                        | PASS    |
| M43  | lastMessage update                  | atualiza novo                                   | service                        | PASS    |
| M44  | frontend polling                    | preservado                                      | code                           | PASS    |
| M45  | Inbox real API                      | `connectionsApi.list`                           | code                           | PASS    |
| M46  | webhook ensure                      | idempotente                                     | service/spec                   | PASS    |
| M47  | reconnect same Connection           | preservado                                      | code/tests                     | PASS    |
| M48  | reconnect webhook ensure            | preservado                                      | service/spec                   | PASS    |
| M49  | outbound preserved                  | sem refactor                                    | verify                         | PASS    |
| M50  | Redis preserved                     | smoke PASS                                      | verify                         | PASS    |
| M51  | BullMQ preserved                    | smoke PASS                                      | verify                         | PASS    |
| M52  | Outbox preserved                    | tests PASS                                      | verify                         | PASS    |
| M53  | worker preserved                    | tests PASS                                      | verify                         | PASS    |
| M54  | login preserved                     | tests PASS                                      | verify                         | PASS    |
| M55  | Contact lifecycle preserved         | tests PASS                                      | verify                         | PASS    |
| M56  | dropdown tests                      | adicionados                                     | vitest                         | PASS    |
| M57  | webhook auth tests                  | `jwt_key` E2E                                   | backend test                   | PASS    |
| M58  | real payload fixture                | real-equivalent uppercase                       | tests                          | PARTIAL |
| M59  | translator tests                    | PASS                                            | vitest                         | PASS    |
| M60  | Connection resolution tests         | PASS                                            | E2E                            | PASS    |
| M61  | Contact resolution tests            | PASS                                            | specs                          | PASS    |
| M62  | Conversation resolution tests       | PASS                                            | specs                          | PASS    |
| M63  | idempotency tests                   | PASS                                            | specs/E2E                      | PASS    |
| M64  | reconnect tests                     | PASS automatizado                               | E2E                            | PASS    |
| M65  | real dropdown physical              | nao executado                                   | sem navegador                  | FAIL    |
| M66  | real outbound baseline              | recebido PO anterior, nao reexecutado           | PO state                       | PARTIAL |
| M67  | real inbound basic                  | nao executado                                   | sem WhatsApp fisico            | FAIL    |
| M68  | inbound same Contact                | automatizado                                    | tests                          | PASS    |
| M69  | inbound same Connection             | automatizado                                    | tests                          | PASS    |
| M70  | inbound same Conversation           | automatizado                                    | tests                          | PASS    |
| M71  | inbound persistence F5              | nao executado                                   | sem navegador                  | FAIL    |
| M72  | reconnect physical                  | nao executado                                   | sem WhatsApp fisico            | FAIL    |
| M73  | zero replay physical                | nao executado                                   | sem WhatsApp fisico            | FAIL    |
| M74  | new inbound after reconnect         | nao fisico                                      | tests apenas                   | PARTIAL |
| M75  | outbound after reconnect            | nao fisico                                      | preservacao automatica         | PARTIAL |
| M76  | Redis down persistence              | nao fisico                                      | nao executado                  | FAIL    |
| M77  | Redis recovery                      | smoke automatizado                              | verify                         | PARTIAL |
| M78  | Redis recovery exactly once         | nao fisico                                      | nao executado                  | FAIL    |
| M79  | Redis restart                       | nao fisico                                      | nao executado                  | FAIL    |
| M80  | disconnected failure                | automatizado legado                             | verify                         | PASS    |
| M81  | zero Development fallback           | dropdown sem dev                                | tests                          | PASS    |
| M82  | disconnected excluded dropdown      | PASS                                            | test                           | PASS    |
| M83  | frontend regression                 | PASS                                            | verify                         | PASS    |
| M84  | CRM regression                      | PASS                                            | verify                         | PASS    |
| M85  | Conversation regression             | PASS                                            | verify                         | PASS    |
| M86  | Message regression                  | PASS                                            | verify                         | PASS    |
| M87  | auth regression                     | PASS                                            | verify                         | PASS    |
| M88  | security                            | webhook auth e XSS PASS                         | verify/tests                   | PASS    |
| M89  | tenant isolation                    | PASS                                            | backend tests                  | PASS    |
| M90  | typecheck                           | PASS                                            | verify                         | PASS    |
| M91  | lint                                | PASS                                            | verify                         | PASS    |
| M92  | frontend build                      | PASS                                            | verify                         | PASS    |
| M93  | backend build                       | PASS                                            | verify                         | PASS    |
| M94  | backend tests                       | 94 PASS                                         | verify                         | PASS    |
| M95  | verify #1                           | `nexos_0802` parcial                            | backend data mismatch          | PARTIAL |
| M96  | verify #2                           | `nexos_0801` PASS                               | verify                         | PASS    |
| M97  | adendo 08.01                        | criado                                          | file                           | PASS    |
| M98  | adendo 08.02                        | criado                                          | file                           | PASS    |
| M99  | adendo 08.03                        | criado                                          | file                           | PASS    |
| M100 | docs                                | atualizados                                     | docs                           | PASS    |
| M101 | changelog                           | atualizado                                      | docs/CHANGELOG.md              | PASS    |
| M102 | report                              | criado                                          | este arquivo                   | PASS    |
| M103 | commit                              | criado                                          | `d53956a`                      | PASS    |
| M104 | final git clean                     | limpo apos commit final                         | `git status`                   | PASS    |
| M105 | gate                                | nao liberado fisicamente                        | criteria                       | FAIL    |

## 54. Technical debt

Suíte E2E ampla ainda depende de massa demo `acme/orbit`. O ambiente fisico `nexos_0802` deve seguir limpo e preservado para homologacao real.

## 55. Risks

O payload real exato do WhatsApp B nao foi capturado nesta sessao. A causa de auth foi corrigida, mas o fechamento precisa observar Evolution e UI fisicamente.

## 56. Commits

Commit local: `d53956a fix: close sprint 08.04 operational inbound`.

## 57. Final Git state

Worktree limpo apos commit final local. Push nao executado.

## 58. Gate

```text
NOT READY FOR SPRINT 09
```

NOT READY FOR SPRINT 09
