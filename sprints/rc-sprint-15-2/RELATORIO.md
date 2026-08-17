# RC Sprint 15.2 - FINAL REWORK REPORT

## Status
MESSAGING CORE REWORK REQUIRED

## Root Cause
O rework anterior criou a estrutura de dados do core, mas deixou caminhos reais incompletos entre Inbox, Outbox, Evolution e WhatsApp para midia, reactions e homologacao fisica. O outbound aceitava apenas TEXT, o frontend bloqueava anexos/audio, o Evolution client usava payload textual legado, e nao havia endpoint privado de download de midia.

## Implementado Neste Rework
- Reply texto segue validando `quotedMessageId`, tenant, conversa e provider id.
- `EvolutionClient.sendText` usa o contrato v2.x documentado com `textMessage.text` e `quoted`.
- `EvolutionClient.sendMedia` usa `POST /message/sendMedia/{instanceName}` multipart com `number`, `mediatype`, `media`, `caption` e `fileName`.
- `EvolutionClient.sendReaction` usa `POST /message/sendReaction/{instanceName}` com `reactionKey` e `reactionMessage`.
- Outbox existente passou a despachar IMAGE, DOCUMENT, AUDIO e VOICE, alem de TEXT.
- Storage local privado para midia de mensagem com checksum SHA-256, limite de tamanho, MIME allowlist, magic bytes e protecao contra path traversal.
- Endpoints autorizados:
  - `POST /conversations/:conversationId/messages/media`
  - `GET /conversations/:conversationId/messages/:messageId/media/download`
  - `GET /conversations/:conversationId/messages/:messageId/media/inline`
  - `POST /conversations/:conversationId/messages/:messageId/reactions`
- Inbox envia imagem, documento e audio gravado via Blob/File, sem base64 permanente.
- Inbox renderiza imagem, player de audio/voice, documento com download privado, replies e reactions.
- Translator Evolution extrai envelope de midia inbound e quoted context para texto, imagem, documento, audio e voice.
- Inbound tenta baixar e armazenar midia quando o webhook fornece URL HTTP baixavel.
- Realtime ganhou `message.reaction.updated`; status e message.created continuam propagando mensagens com metadados.

## Arquivos Principais
- `backend/src/messaging/evolution/evolution.client.ts`
- `backend/src/messaging/evolution/evolution-messaging.provider.ts`
- `backend/src/messaging/evolution/evolution-webhook.translator.ts`
- `backend/src/messaging/messaging-outbound.service.ts`
- `backend/src/messaging/messaging-inbound.service.ts`
- `backend/src/messaging/media/messaging-media-storage.service.ts`
- `backend/src/conversations/messages.controller.ts`
- `backend/src/conversations/messages.service.ts`
- `src/lib/nexos-api.ts`
- `src/routes/inbox.$conversationId.tsx`

## Migrations
Criada anteriormente nesta sprint:
- `backend/prisma/migrations/20260806120000_messaging_core_completion/migration.sql`

Aplicada com sucesso em:
- `nexos_0801`
- `nexos_0802`
- `nexos_1200`

## Testes Automatizados
- `bun run --cwd backend build`: PASS
- `bun run typecheck`: PASS
- `bun run --cwd backend test`: PASS, 24 arquivos, 161 testes
- `bun run verify`: PASS
- Redis queue smoke dentro do verify: PASS
- Security XSS dentro do verify: PASS

## Auditoria Evolution v2.3.7
Container local confirmado:
- `evoapicloud/evolution-api:v2.3.7`

Contratos usados:
- `POST /message/sendText/{instanceName}`
- `POST /message/sendMedia/{instanceName}`
- `POST /message/sendReaction/{instanceName}`
- `GET /group/findGroupInfos/{instanceName}`
- `GET /group/participants/{instanceName}`
- `POST /chat/markMessageAsRead/{instanceName}`

Estado local em 2026-08-06:
- Evolution API local possui uma instancia `open`.
- Banco `nexos_0801` usado no verify nao possui connection Evolution.
- Banco `nexos` possui connections Nexos `CONNECTED`, mas os `externalReference` cadastrados nao correspondem a instancia Evolution `open` atual.

## Homologacao Fisica
Nao executada com evidencia completa.

Bloqueio concreto:
- Sem connection Nexos alinhada a instancia Evolution `open` no banco de homologacao automatizado.
- Sem numero/grupo de destino controlado informado para validar ida e volta WhatsApp real -> Evolution -> Nexos -> WhatsApp.
- Nao foram anexadas evidencias fisicas de texto, grupo, reply, imagem, documento, audio, receipts, reaction, realtime, reconexao, download e idempotencia.

## Regression
Nenhum modulo proibido foi alterado intencionalmente. A alteracao em `backend/src/operations/operations.service.ts` ja existia antes deste trabalho e permaneceu intocada.

## Pendencias
- Homologacao fisica completa com WhatsApp real.
- Storage externo R2/S3 real; local privado foi implementado, R2/S3 seguem como configuracao futura.
- Workers BullMQ separados por Media Upload, Media Download, Receipt Update, Reaction Sync e Group Metadata nao foram criados; o rework reutiliza o outbox/worker outbound existente.
- Sincronizacao automatica de metadata completa de grupos depende de job/provider dedicado.

## Gate
MESSAGING CORE REWORK REQUIRED

