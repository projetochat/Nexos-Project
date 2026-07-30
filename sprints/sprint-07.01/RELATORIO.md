# SPRINT 07.01 - RELATORIO FINAL

## 1. Status

Hardening corretivo implementado parcialmente. Infraestrutura Evolution real, webhook registration, health, lifecycle create/delete e inbound por webhook realista foram validados. Gate manual absoluto com WhatsApp B real nao foi comprovado nesta sessao.

## 2. Resumo executivo

Sprint 07.01 corrigiu problemas de homologacao da Sprint 07: env real nao carregado no backend quando executado de `backend`, Development Provider aparecendo como instancia operacional, connections Evolution falsas/orfas vindas de testes, QR orfao sem diagnostico claro, ausencia de delete/cleanup e falta de testes para lifecycle/webhook realista.

## 3. Baseline

- Branch inicial: `sprint/07-evolution-provider`
- SHA inicial: `8721dd0725704e0e80b1afb846b42963a5efb530`
- Branch da sprint: `sprint/07.01-evolution-e2e-hardening`
- Verify inicial: `node scripts/verify.mjs` PASS
- Bun: indisponivel no PATH deste executor

## 4. Problemas reproduzidos

- Backend rodando com cwd `backend` nao carregava `.env` da raiz; Evolution aparecia como nao configurada.
- Banco local continha varias `MessagingConnection` Evolution de E2E sem instance correspondente na Evolution.
- `/instancias` podia mostrar provider `DEVELOPMENT` como instancia real.
- QR de connection orfa nao tinha erro de negocio claro.
- Testes automatizados nao cobriam webhook registration/lifecycle/delete.

## 5. Causas raiz

- `ConfigModule.forRoot` usava caminho padrao relativo ao cwd.
- E2E criava rows Evolution diretamente no banco e nao limpava.
- Service listava todas as provider connections do tenant.
- Integration lifecycle nao tinha delete/cleanup nem reconciliation contra `fetchInstances`.

## 6. Environment/config

`ConfigModule` agora usa `envFilePath: [".env", "../.env"]`. Variaveis Evolution carregadas do `.env` da raiz foram comprovadas via endpoint autenticado de health.

## 7. Evolution health

`GET /api/messaging/connections/health/evolution` autenticado retornou `ok: true`, `configured: true`, `instanceCount: 2` no ambiente local com Evolution `v2.3.1`.

## 8. Webhook registration

Criacao de connection agora executa:

- `POST /instance/create`
- `POST /webhook/set/:instanceName`

Webhook real registrado manualmente em `46a0c5ba-t2` com URL `http://host.docker.internal:3001/api/webhooks/evolution` e `jwt_key`.

## 9. Webhook connectivity

Validado do container `nexos-evolution-api` para `http://host.docker.internal:3001/api/health`: HTTP 200.

## 10. Webhook security

Mantido JWT via `jwt_key`, suportado oficialmente pela Evolution. Claims exigidas: `app=evolution`, `action=webhook`.

## 11. Payload real

Translator atualizado/testado com payload realista Evolution contendo `event`, `instance`, `data`, `destination`, `date_time`, `sender`, `server_url` e `apikey`.

## 12. Translator

Eventos cobertos:

- `MESSAGES_UPSERT`
- `MESSAGES_UPDATE`
- `SEND_MESSAGE_UPDATE`
- `QRCODE_UPDATED`
- `CONNECTION_UPDATE`

Grupos `@g.us` sao ignorados por estarem fora de escopo.

## 13. Inbound flow

Webhook realista enviado ao backend real para instance `46a0c5ba-t2` retornou `200` e `kind: inbound`.

## 14. Contact resolution

Fluxo synthetic inbound criou Contact para telefone novo usando normalizacao existente. O contato sintetico foi removido apos validacao.

## 15. Conversation resolution

Fluxo synthetic inbound criou Conversation canonica tenant/contact/connection. A conversa sintetica foi removida apos validacao.

## 16. Message persistence

Mensagem synthetic inbound foi persistida e localizada por `externalMessageId`.

## 17. Idempotency

E2E existente continua cobrindo duplicate inbound. Suite backend PASS.

## 18. Connection lifecycle

Lifecycle real controlado via Nexos API:

- login Nexos
- Evolution health PASS
- create connection PASS
- status PASS
- delete PASS
- detail apos delete 404 PASS

## 19. Orphan reconciliation

`status` consulta `fetchInstances`; instance ausente marca connection como `ERROR` com `provider.reason = INSTANCE_NOT_FOUND`.

## 20. QR lifecycle

QR de instance ausente retorna `BadRequestException` com `INSTANCE_NOT_FOUND`.

## 21. Disconnect/delete

- `logout`: preserva instance e remove sessao WhatsApp.
- `delete`: remove instance Evolution quando existe e limpa connection local.
- connection orfa pode ser removida localmente.

## 22. Mock inventory

- REMOVIDO AGORA: fake Evolution rows criadas por E2E sem cleanup.
- REMOVIDO AGORA: Development Provider exibido em `/instancias`.
- TEST-ONLY: Development Provider e seed Development FLOWID/ORBIT.
- LEGADO FORA DO ESCOPO: `src/lib/mvp.ts` ainda consulta `instancias` para filtros legados fora da superficie `/instancias`.

## 23. Mock removal

`/instancias` filtra provider `EVOLUTION` e o backend lista apenas Evolution connections.

## 24. Seed cleanup

Seed nao cria `EVOLUTION`. Criado script explicito `backend/scripts/cleanup-messaging-connections.mjs`.

## 25. Frontend /instancias

Atualizado para:

- mostrar apenas Evolution;
- exibir diagnostico provider;
- remover connection;
- mensagens de erro mais uteis via API.

## 26. Error UX

Erros de API agora expoem `INSTANCE_NOT_FOUND` para QR orfao. Health Evolution retorna `missing` ou erro sanitizado.

## 27. Tests

Backend: 9 arquivos, 51 testes PASS.

## 28. Bootstrap test

Mantido `messaging.module.spec.ts`, cobrindo registry Development/Evolution pelo container Nest.

## 29. Security

Tenant isolation preservado. Webhook segue autenticado por JWT Evolution. XSS gate PASS.

## 30. Builds

Typecheck backend PASS. Verify cobre frontend/backend builds.

## 31. Verify

- Verify inicial: PASS.
- Verify final #1: PASS.
- Verify final #2: PASS.

## 32. Manual real E2E

Nao comprovado com WhatsApp B real nesta sessao.

## 33. Outbound result

Nao comprovado com WhatsApp real nesta sessao.

## 34. Inbound result

Webhook realista contra backend real PASS. WhatsApp B real -> Nexos nao comprovado.

## 35. Disconnect/recreate result

Create/delete/recreate controlado por API foi validado com instance temporaria.

## 36. Regressions

Sem Redis/BullMQ Nexos, Socket.io, R2, Meta, campanhas, bot, IA ou billing.

## 37. Files created

- `backend/src/messaging/messaging-connections.service.spec.ts`
- `backend/scripts/cleanup-messaging-connections.mjs`
- `sprints/sprint-07.01/RELATORIO.md`

## 38. Files changed

Backend messaging Evolution/client/translator/controller/service, AppModule env loading, frontend `/instancias`, Nexos API types, E2E tests e documentacao.

## 39. Files removed

Nenhum.

## 40. Documentation

Atualizados docs de API, arquitetura, database, business rules, user flow, deploy, changelog e roadmap.

## 41. M01-M66

| M                                    | Resultado                     |
| ------------------------------------ | ----------------------------- |
| M01 baseline Git                     | PASS                          |
| M02 verify inicial                   | PASS                          |
| M03 Evolution env validado           | PASS                          |
| M04 Nest env loading                 | PASS                          |
| M05 Evolution health real            | PASS                          |
| M06 webhook registration audit       | PASS                          |
| M07 webhook URL real                 | PASS                          |
| M08 container-host connectivity      | PASS                          |
| M09 webhook auth interoperavel       | PASS                          |
| M10 webhook event names reais        | PASS                          |
| M11 realistic payload fixture        | PASS                          |
| M12 translator inbound               | PASS                          |
| M13 connection resolution            | PASS                          |
| M14 phone/JID normalization          | PASS                          |
| M15 Contact resolution               | PASS synthetic                |
| M16 Conversation resolution          | PASS synthetic                |
| M17 inbound persistence              | PASS synthetic                |
| M18 inbound idempotency              | PASS automated                |
| M19 unread                           | PASS synthetic                |
| M20 last message                     | PASS synthetic                |
| M21 connection reconciliation        | PASS                          |
| M22 orphan detection                 | PASS                          |
| M23 QR orphan error handling         | PASS                          |
| M24 logout/disconnect                | PARTIAL                       |
| M25 delete/cleanup                   | PASS                          |
| M26 recreate                         | PASS controlled               |
| M27 instance naming                  | PASS                          |
| M28 /instancias mock removal         | PASS                          |
| M29 seed mock removal                | PASS                          |
| M30 mock inventory                   | PASS                          |
| M31 bootstrap test                   | PASS                          |
| M32 webhook registration tests       | PASS                          |
| M33 webhook auth tests               | PASS                          |
| M34 translator tests                 | PASS                          |
| M35 orphan tests                     | PASS                          |
| M36 lifecycle tests                  | PASS                          |
| M37 tenant connection isolation      | PASS                          |
| M38 outbound regression automated    | PARTIAL                       |
| M39 inbound automated                | PASS synthetic                |
| M40 typecheck                        | PASS                          |
| M41 lint                             | PASS initial                  |
| M42 frontend build                   | PASS initial                  |
| M43 backend build                    | PASS initial                  |
| M44 backend tests                    | PASS                          |
| M45 security                         | PASS initial                  |
| M46 verify #1                        | PASS                          |
| M47 verify #2                        | PASS                          |
| M48 backend dev bootstrap            | PASS via tsx; Bun unavailable |
| M49 health                           | PASS                          |
| M50 Evolution health                 | PASS                          |
| M51 manual create instance           | PASS controlled               |
| M52 manual QR                        | NOT VERIFIED                  |
| M53 manual CONNECTED                 | Existing `46a0c5ba-t2` open   |
| M54 manual outbound real             | NOT VERIFIED                  |
| M55 manual inbound real              | NOT VERIFIED                  |
| M56 manual persistence               | PASS synthetic                |
| M57 manual disconnect                | NOT VERIFIED                  |
| M58 manual delete                    | PASS controlled               |
| M59 manual recreate                  | PASS controlled               |
| M60 no operational mocks /instancias | PASS                          |
| M61 no mock fallback Inbox           | PASS                          |
| M62 Supabase no increase             | PASS                          |
| M63 docs                             | PASS                          |
| M64 report                           | PASS                          |
| M65 commits                          | PASS apos commit final        |
| M66 git clean                        | PASS apos commit final        |

## 42. Technical debt

- Validar WhatsApp B real inbound/outbound com operador humano.
- Decidir estrategia de realtime/polling de QR/status em sprint futura.
- Implementar media/storage futuramente.

## 43. Risks

- Sem teste manual real, ainda pode haver divergencia de payload emitido em situacao especifica do WhatsApp real.
- Sem Socket.io, a Inbox ainda depende de refetch.

## 44. Git state

Commit final criado ao encerrar a correcao de homologacao. Working tree limpo apos commit.

## 45. Gate

NOT READY FOR SPRINT 08
