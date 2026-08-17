# RC Sprint 15.2 Rework - Evolution Contract & Messaging Normalization

## 1. Status
EVOLUTION CONTRACT REWORK REQUIRED

## 2. Resumo executivo
Contrato outbound da Evolution API v2.3.7 corrigido em Nexos para texto, reply key, reacao, imagem, documento e audio/voice. O hotfix de resiliencia do worker foi preservado. Smokes diretos contra Evolution real passaram para texto, reacao, imagem, documento e audio.

O gate completo ainda nao pode ser aprovado porque a homologacao ponta a ponta Nexos -> Outbox -> Evolution -> WhatsApp -> Nexos, incluindo grupos e inbound media renderizada, nao foi executada.

## 3. Evidencias fisicas originais
- Texto falhava com `instance requires property "text"`.
- Reacao falhava com `instance requires property "key"` e `instance requires property "reaction"`.
- Imagem inbound persistia, mas nao renderizava.

## 4. Root cause
Ver `ROOT_CAUSE.md`.

## 5. Contrato Evolution v2.3.7
Ver `EVOLUTION_V237_CONTRACT.md`.

## 6. Normalizacao de destinatario
Implementado `EvolutionRecipientNormalizer`: direct number/JID/LID e group `@g.us` preservado.

## 7. Texto
Payload corrigido para `number` e `text` no root. Smoke direto Evolution PASS.

## 8. Reply
Outbound passa a enviar quoted provider key com `id`, `remoteJid`, `fromMe` e `participant` quando disponivel. Validacao fisica Nexos pendente.

## 9. Reacoes
Payload corrigido para `key` e `reaction` no root. Add/remove diretos Evolution PASS.

## 10. Imagem outbound
Payload corrigido para multipart `file` em `/message/sendMedia`. Smoke direto Evolution PASS.

## 11. Documento outbound
Payload corrigido para multipart `file` em `/message/sendMedia`. Smoke direto Evolution PASS com TXT.

## 12. Audio outbound
Audio/voice/PTT roteado para `/message/sendWhatsAppAudio` com multipart `file`. Smoke direto Evolution PASS; provider retornou `audio/ogg; codecs=opus` e `ptt=true`.

## 13. Midia inbound
Pendente validacao Nexos fisica de download/storage/render.

## 14. Storage
Storage outbound existente preservado; media file missing agora possui codigo canonico `MEDIA_FILE_MISSING`.

## 15. Endpoints de midia
Endpoints Nexos existentes nao foram alterados neste rework.

## 16. Error classification
400 de validacao Evolution com `requires property` agora vira `INVALID_PROVIDER_PAYLOAD`, `providerCode=VALIDATION_ERROR`, retryable=false.

## 17. Logs
Logs estruturados do hotfix foram preservados. Payload factory remove `undefined` antes da chamada.

## 18. Outbox
Toda midia outbound continua passando pelo Outbox.

## 19. Worker resilience
Hotfix anterior preservado. Teste de regressao de `unhandledRejection` segue PASS.

## 20. Testes unitarios
Novos testes cobrem normalizacao, payloads, reply key, reacao e classificacao de erro.

## 21. Testes backend
`bun run --cwd backend test`: PASS, 26 arquivos, 176 testes.

## 22. Testes frontend
`bun run verify`: frontend typecheck/build PASS.

## 23. Testes fisicos
Smokes diretos Evolution PASS para texto, reacao, imagem, documento e audio. Homologacao completa Nexos pendente.

## 24. Regressoes
Nao houve alteracao intencional em Dashboard, Relatorios, CRM, Tickets, Campanhas, Automacoes, Bot, Control Plane, Planos, Assinaturas, Financeiro ou Filas operacionais.

## 25. Metricas
N001 PASS. N002 PASS. N003 PASS. N004 PASS. N005 PASS. N006 PARTIAL. N007 PASS. N008 PASS direto Evolution. N009 PASS unitario. N010 PENDING Nexos fisico. N011 PENDING. N012 PASS. N013 PASS direto Evolution. N014 PASS direto Evolution. N015 PENDING. N016 PASS. N017 PASS direto Evolution. N018 PASS. N019 PASS direto Evolution. N020 PASS. N021 PASS direto Evolution. N022 PASS direto Evolution. N023-N030 PENDING inbound Nexos fisico. N031 PASS. N032 PASS. N033 PASS. N034 PASS. N035 PASS automatizado. N036 PASS. N037 PASS verify. N038 PASS automatizado. N039 PASS. N040 PASS build/typecheck. N041 PASS. N042 PASS. N043 PASS. N044 PENDING. N045 PENDING. N046 FAIL worktree sujo.

## 26. Arquivos alterados
Principais: `evolution.client.ts`, `evolution-messaging.provider.ts`, `evolution-provider-error.classifier.ts`, `messaging.contracts.ts`, `messaging-outbound.service.ts`, specs e novos normalizer/factory.

## 27. Commits
Nenhum commit criado.

## 28. Git status
Worktree permanece sujo por WIP da RC 15.2 + hotfix + este rework. `backend/src/operations/operations.service.ts` ja estava alterado antes e nao foi tocado por este rework.

## 29. Gate
EVOLUTION CONTRACT REWORK REQUIRED
