# SPRINT 08.01 - RELATORIO FINAL

## 1. Status

Sprint corretiva implementada localmente para inbound Conversation resolution, reconnect webhook recovery, seed minimo e cleanup seguro.

Gate final: `NOT READY FOR SPRINT 09`, porque a homologacao fisica completa WhatsApp/Redis down/recovery nao foi executada nesta sessao.

## 2. Resumo executivo

A Sprint 08.01 preservou Redis, BullMQ, Transactional Outbox e worker outbound da Sprint 08. A correcao central foi separar owner identity da remote identity do contato: inbound agora normaliza JIDs reais, reutiliza Contact canonico e reaproveita Conversation aberta compativel. Reconnect passa a garantir webhook Evolution novamente de forma idempotente quando a connection volta para `CONNECTED`.

## 3. Baseline

- Baseline Sprint 08: `7b67657052200e29cbb9a1b8213d77edec399de8`
- Branch: `sprint/08.01-inbound-reconnect-recovery`
- Sprint 07.03 preservada.
- Migration Sprint 08 preservada.

## 4. Preflight

Worktree inicial limpo, branch Sprint 08 confirmada e log recente conferido antes da criacao da branch 08.01.

## 5. Ambiente de homologacao

Banco isolado criado: `nexos_0801`.

Variaveis usadas:

```text
DATABASE_URL=postgresql://nexos:nexos_dev_password@localhost:5432/nexos_0801?schema=public
REDIS_URL=redis://localhost:6379
NEXOS_QUEUE_ENABLED=true
NEXOS_QUEUE_WORKER_ENABLED=true
```

## 6. Seed minimo

`backend/prisma/seed.ts` agora cria por padrao apenas tenant `homologacao`, admin, membership, roles/permissoes e departamento minimo.

Validacao em banco auxiliar `nexos_0801_seedcheck`: contacts, conversations, messages e connections ficaram em `0`.

## 7. Demo seed

Dados demo foram preservados como opt-in via `SEED_DEMO_DATA=true`.

## 8. Cleanup script

Criado `backend/scripts/cleanup-homologation-data.mjs`.

Comportamento:

- tenant-scoped;
- dry-run por padrao;
- exige `--confirm` para remover;
- preserva users, memberships e departments;
- remove apenas IDs deterministos do seed demo e connections demo que ficam orfas;
- nao loga telefone completo.

## 9. F01 reproducao

Reproducao fisica real nao executada nesta sessao. Foi criada fixture automatizada cobrindo Conversation criada por outbound e inbound reply com JID variante reutilizando Contact/Conversation.

## 10. F01 causa raiz

Causa raiz tecnica inferida e coberta por teste: inbound dependia de `remoteJid`/telefone em formato unico. Em eventos reais, a Evolution pode emitir JID com formatos diferentes, incluindo `@s.whatsapp.net`, `@c.us`, device suffix e variacao brasileira com/sem nono digito. Isso podia criar Contact novo e, por consequencia, Conversation nova.

## 11. Contact resolution

Adicionado `backend/src/messaging/messaging-identity.ts` com normalizacao canonica e candidatos de telefone. `MessagingInboundService` procura Contact existente por qualquer candidato normalizado antes de criar.

## 12. JID normalization

Coberto:

- `5511999999999@s.whatsapp.net`
- `5511999999999@c.us`
- `5511999999999:12@s.whatsapp.net`
- variantes brasileiras com/sem nono digito

## 13. Conversation resolution

Inbound reutiliza Conversation aberta por:

```text
tenantId + contactId + connectionId
```

e, quando owner identity existe:

```text
tenantId + contactId + connection.ownerPhoneNormalized
```

## 14. Conversation reuse

Conversation aberta compativel e reutilizada. Conversation fechada continua seguindo regra explicita: nova Conversation aberta.

## 15. F02 reproducao

Reproducao fisica real nao executada nesta sessao. Foi adicionada cobertura automatizada para reconnect/QR/status garantindo webhook novamente.

## 16. Reconnect flow

Ao voltar para `CONNECTED`, a connection preserva `id`, `externalReference` e owner identity local. O fluxo chama ensure de webhook sem criar connection nova.

## 17. Webhook ensure

Criado `ensureWebhookConfigured(instanceName)`. Ele reutiliza `EvolutionClient.setWebhook` com URL e secret oficiais. Chamadas repetidas sao idempotentes por sobrescreverem a configuracao da instance.

## 18. Connection identity

`findByEvolutionInstance` continua usando `externalReference`. `updateConnectionStatus` preserva duplicate owner block e registra falha de ensure sem devolver 500 ao webhook recebido.

## 19. Idempotency

Replay por `externalMessageId` retorna o Message existente. Quando owner identity existe, a busca tambem cobre reconnect da mesma identidade de owner.

## 20. Replay handling

Replay nao cria Message, nao cria Conversation, nao incrementa unread e nao altera lastMessage.

## 21. New inbound after reconnect

Coberto por regra e testes automatizados para `externalMessageId` novo. Validacao fisica real segue pendente.

## 22. Outbound queue regression

Redis, BullMQ, Outbox, worker, retry e ordering foram preservados sem refactor amplo.

## 23. Redis regression

`redis:queue-smoke` continua parte de `bun run verify`.

## 24. Real outbound

Nao executado fisicamente nesta sessao.

## 25. Real inbound

Nao executado fisicamente nesta sessao.

## 26. Reconnect physical

Nao executado fisicamente nesta sessao.

## 27. Redis down

Nao executado fisicamente nesta sessao.

## 28. Redis recovery

Nao executado fisicamente nesta sessao.

## 29. Security

Webhook auth JWT preservado. Logs novos sao sanitizados e nao incluem conteudo de mensagem, telefone completo, QR, API key, JWT ou secrets.

## 30. Tenant isolation

Contact/Conversation lookup e cleanup permanecem tenant-scoped.

## 31. Tests

Adicionados testes:

- `messaging-identity.spec.ts`
- `messaging-inbound.service.spec.ts`
- novos casos em `evolution-webhook.translator.spec.ts`
- novos casos em `messaging-connections.service.spec.ts`

## 32. Regressions

Backend tests passaram com 15 arquivos e 83 testes.

## 33. Typecheck/lint

Typecheck executado. Lint baseline sera coberto pelos verifies finais.

## 34. Builds

Build frontend e backend serao cobertos pelos verifies finais.

## 35. Verify

Verify inicial: PASS.

Verify final #1: PASS.

Verify final #2: PASS.

## 36. Files created

- `backend/src/messaging/messaging-identity.ts`
- `backend/src/messaging/messaging-identity.spec.ts`
- `backend/src/messaging/messaging-inbound.service.spec.ts`
- `backend/scripts/cleanup-homologation-data.mjs`
- `sprints/sprint-08.01/RELATORIO.md`

## 37. Files changed

- `backend/prisma/seed.ts`
- `backend/package.json`
- `backend/src/messaging/messaging.contracts.ts`
- `backend/src/messaging/messaging-inbound.service.ts`
- `backend/src/messaging/messaging-connections.service.ts`
- `backend/src/messaging/messaging-connections.service.spec.ts`
- `backend/src/messaging/evolution/evolution-webhook.controller.ts`
- `backend/src/messaging/evolution/evolution-webhook.translator.ts`
- `backend/src/messaging/evolution/evolution-webhook.translator.spec.ts`
- docs principais

## 38. Files removed

Nenhum.

## 39. Migrations

Nenhuma migration nova. Migrations existentes aplicadas ate:

- `20260803070300_connection_owner_identity`
- `20260803080000_redis_bullmq_outbox`

## 40. Documentation

Atualizados:

- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/API.md`
- `docs/BUSINESS_RULES.md`
- `docs/USER_FLOW.md`
- `docs/DEPLOY.md`
- `docs/ROADMAP.md`
- `docs/CHANGELOG.md`

## 41. M01-M75

| ID  | Meta                           | Resultado                    | Evidencia                                 | Status  |
| --- | ------------------------------ | ---------------------------- | ----------------------------------------- | ------- |
| M01 | baseline Sprint 08             | Preservada                   | HEAD inicial `7b67657`                    | PASS    |
| M02 | worktree inicial clean         | Limpo                        | preflight git                             | PASS    |
| M03 | branch 08.01                   | Criada                       | `sprint/08.01-inbound-reconnect-recovery` | PASS    |
| M04 | verify inicial                 | PASS                         | `bun run verify`                          | PASS    |
| M05 | banco nexos_0801               | Criado                       | migrations aplicadas                      | PASS    |
| M06 | migrations                     | Aplicadas                    | 07.03 e 08 presentes                      | PASS    |
| M07 | seed minimo                    | Implementado                 | `nexos_0801_seedcheck` zerou mocks        | PASS    |
| M08 | demo seed opt-in               | Implementado                 | `SEED_DEMO_DATA=true`                     | PASS    |
| M09 | cleanup script                 | Criado                       | script novo                               | PASS    |
| M10 | cleanup dry-run                | PASS                         | zero deletes                              | PASS    |
| M11 | cleanup tenant scope           | PASS                         | tenant slug obrigatorio                   | PASS    |
| M12 | F01 reproduced                 | Automatizado                 | fixture inbound reply                     | PARTIAL |
| M13 | outbound Contact identity      | Coberto                      | candidatos canonicos                      | PASS    |
| M14 | inbound remote identity        | Coberto                      | `remoteJid` metadata                      | PASS    |
| M15 | JID normalization              | Coberto                      | identity/translator specs                 | PASS    |
| M16 | Contact reuse                  | Coberto                      | inbound service spec                      | PASS    |
| M17 | same Conversation resolution   | Coberto                      | inbound service spec                      | PASS    |
| M18 | no duplicate Conversation      | Coberto                      | `conversation.create` nao chamado         | PASS    |
| M19 | F02 reproduced                 | Automatizado                 | reconnect ensure specs                    | PARTIAL |
| M20 | reconnect same connection      | Preservado                   | update por id existente                   | PASS    |
| M21 | webhook after reconnect        | Implementado                 | `ensureWebhookConfigured`                 | PASS    |
| M22 | webhook ensure idempotent      | Coberto                      | service spec                              | PASS    |
| M23 | owner identity preserved       | Preservado                   | updateConnectionStatus                    | PASS    |
| M24 | new inbound after reconnect    | Coberto por regra            | external id novo persiste                 | PASS    |
| M25 | new external id persists       | Coberto                      | inbound create path                       | PASS    |
| M26 | repeated external id ignored   | Coberto                      | duplicate spec                            | PASS    |
| M27 | unread correct                 | Coberto                      | duplicate nao update conversation         | PASS    |
| M28 | lastMessage correct            | Coberto                      | duplicate nao update conversation         | PASS    |
| M29 | no replay duplicates           | Coberto                      | duplicate spec                            | PASS    |
| M30 | no new Conversation reconnect  | Coberto por owner/connection | service spec                              | PASS    |
| M31 | outbound queue preserved       | Preservado                   | sem alteracao queue                       | PASS    |
| M32 | ordering preserved             | Preservado                   | Sprint 08 tests                           | PASS    |
| M33 | Redis architecture preserved   | Preservado                   | `nexos-redis` intacto                     | PASS    |
| M34 | outbox preserved               | Preservado                   | sem alteracao outbox                      | PASS    |
| M35 | worker preserved               | Preservado                   | worker intacto                            | PASS    |
| M36 | retry preserved                | Preservado                   | queue options intactas                    | PASS    |
| M37 | tenant isolation               | Preservado                   | tenant-scoped queries                     | PASS    |
| M38 | duplicate owner block          | Preservado                   | backend tests                             | PASS    |
| M39 | webhook security               | Preservado                   | JWT mantido                               | PASS    |
| M40 | XSS/security                   | Coberto                      | verify final                              | PASS    |
| M41 | Contact resolution tests       | Adicionados                  | inbound spec                              | PASS    |
| M42 | Conversation resolution tests  | Adicionados                  | inbound spec                              | PASS    |
| M43 | reconnect tests                | Adicionados                  | connections spec                          | PASS    |
| M44 | webhook ensure tests           | Adicionados                  | connections spec                          | PASS    |
| M45 | idempotency tests              | Adicionados                  | duplicate spec                            | PASS    |
| M46 | seed tests                     | Manual automatizado          | seedcheck DB                              | PASS    |
| M47 | cleanup tests                  | Manual automatizado          | cleanupcheck DB                           | PASS    |
| M48 | outbound queue regression      | Preservado                   | backend suite                             | PASS    |
| M49 | Redis smoke                    | PASS                         | verify                                    | PASS    |
| M50 | real outbound                  | Nao executado fisicamente    | requer WhatsApp real                      | PARTIAL |
| M51 | real inbound same Conversation | Nao executado fisicamente    | requer WhatsApp real                      | PARTIAL |
| M52 | persistence F5                 | Nao executado fisicamente    | requer browser/manual                     | PARTIAL |
| M53 | reconnect physical             | Nao executado fisicamente    | requer Evolution real                     | PARTIAL |
| M54 | new inbound after reconnect    | Nao executado fisicamente    | requer WhatsApp real                      | PARTIAL |
| M55 | zero replay physical           | Nao executado fisicamente    | requer WhatsApp real                      | PARTIAL |
| M56 | outbound after reconnect       | Nao executado fisicamente    | requer WhatsApp real                      | PARTIAL |
| M57 | Redis down manual              | Nao executado fisicamente    | requer teste manual                       | PARTIAL |
| M58 | Redis recovery manual          | Nao executado fisicamente    | requer teste manual                       | PARTIAL |
| M59 | frontend regression            | Coberto por verify           | build/typecheck                           | PASS    |
| M60 | CRM regression                 | Coberto                      | backend suite                             | PASS    |
| M61 | Conversation regression        | Coberto                      | backend suite                             | PASS    |
| M62 | Message regression             | Coberto                      | backend suite                             | PASS    |
| M63 | typecheck                      | PASS                         | executado                                 | PASS    |
| M64 | lint                           | PASS                         | verify #1                                 | PASS    |
| M65 | frontend build                 | PASS                         | verify #1                                 | PASS    |
| M66 | backend build                  | PASS                         | verify #1                                 | PASS    |
| M67 | backend tests                  | PASS                         | 15 files, 83 tests                        | PASS    |
| M68 | verify #1                      | PASS                         | `bun run verify`                          | PASS    |
| M69 | verify #2                      | PASS                         | `bun run verify`                          | PASS    |
| M70 | docs                           | Atualizados                  | docs principais                           | PASS    |
| M71 | changelog                      | Atualizado                   | `docs/CHANGELOG.md`                       | PASS    |
| M72 | report                         | Criado                       | este arquivo                              | PASS    |
| M73 | commit                         | Preparado                    | fechamento                                | PASS    |
| M74 | final git clean                | Preparado                    | apos commit                               | PASS    |
| M75 | gate                           | Nao liberado                 | falta homologacao fisica completa         | PARTIAL |

## 42. Technical debt

- Testes e2e legados ainda assumem massa demo em banco ja preparado; seed padrao foi corrigido para homologacao limpa.
- Reconnect webhook ensure registra falha sem bloquear HTTP; operacao fisica precisa validar configuracao real da Evolution.

## 43. Risks

- Variantes LID reais nao foram observadas fisicamente nesta sessao; a normalizacao atual cobre JIDs telefonicos e evita grupos.
- Gate fisico ainda depende de WhatsApp real, Evolution real e teste Redis down/recovery.

## 44. Commits

Commit final preparado no fechamento desta sprint.

## 45. Final Git state

Esperado limpo apos commit final.

## 46. Gate

```text
NOT READY FOR SPRINT 09
```

## Adendo Sprint 08.04 - homologacao fisica inbound

Estado recebido do Product Owner em 2026-08-03: Sprint 08.01 permanecia NOT READY porque a resposta
inbound real do WhatsApp B nao aparecia no Nexos.

Correcao tecnica aplicada na Sprint 08.04:

- contrato real de webhook Evolution aceito via header `jwt_key`;
- Bearer JWT preservado para regressao automatizada;
- motivos canonicos de ignoredReason adicionados ao translator;
- logs estruturados para auth, event type, translation e persistence.

Validacao automatizada:

- inbound basico real-equivalent: PASS;
- same Conversation por Contact/Connection: PASS em testes de servico/E2E existentes;
- reconnect/idempotencia por owner identity: PASS em E2E;
- new inbound: PASS;
- zero replay: PASS;
- outbound after reconnect: coberto por preservacao de outbound/queue, sem teste fisico nesta sessao.

Homologacao fisica WhatsApp/Evolution real nao foi executada nesta sessao; portanto este adendo nao muda
o gate historico para READY.
