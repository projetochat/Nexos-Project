# Messaging Core

RC Sprint 15.2 adds the schema-backed core for direct and group chat identity.

Implemented:
- `Conversation.conversationType` with `DIRECT` and `GROUP`.
- `externalChatId` as the provider chat identity.
- Group inbound messages reuse one conversation per tenant, connection, and `externalChatId`.
- Group participants are stored in `ConversationParticipant`.
- Message replies persist `quotedMessageId`, `quotedProviderMessageId`, preview, and quoted type.
- Inbound WhatsApp receipts update outbound status without state regression.

Still pending physical gate:
- WhatsApp real-device proof for groups and replies.
- WhatsApp real-device proof for image, document, audio and reactions.
- Dedicated media/reaction/group metadata workers.
- R2/S3 physical storage validation.

## RC Sprint 15.2 hotfix - outbound worker resilience

The outbound dispatcher now keeps the same tracked promise inside the per-conversation lock and returns it to BullMQ. This removes the orphan rejected promise that could surface as `unhandledRejection` after a provider outage or timeout.

Implemented:
- Evolution provider errors are normalized by HTTP status, network code, endpoint, method and unknown-outcome flag.
- Retryable provider failures keep BullMQ retries active; permanent provider failures are converted to `UnrecoverableError`.
- Worker lifecycle events log `active`, `completed`, `failed`, retry scheduling, final failure, stalled, closing and closed states.
- Final failures update the transactional outbox row to `FAILED` with sanitized diagnostics.
- Regression coverage asserts retryable dispatch failures do not emit process-level `unhandledRejection`.

Gate:
- Automated backend tests passed for the hotfix scope.
- Full physical outage/recovery validation with WhatsApp real, Evolution and Nexos remains pending.
- Current gate remains `OUTBOUND DISPATCHER HOTFIX REQUIRED` until physical evidence is attached.

## RC Sprint 15.2 rework - Evolution contract normalization

Evolution v2.3.7 outbound payloads are now built through a single provider adapter:
- `EvolutionRecipientNormalizer`
- `EvolutionOutboundPayloadFactory`

Implemented:
- Direct recipients are normalized to digits/JID while group recipients preserve `@g.us`.
- Text payload uses root `number` and root `text`.
- Reply payload includes quoted provider key data: `id`, `remoteJid`, `fromMe` and optional `participant`.
- Reaction payload uses root `key` and root `reaction`; empty reaction is supported for removal.
- Image/document media upload uses multipart field `file` on `/message/sendMedia/:instanceName`.
- Audio/voice upload uses multipart field `file` on `/message/sendWhatsAppAudio/:instanceName`.
- Evolution validation 400 responses with `requires property` are classified as `INVALID_PROVIDER_PAYLOAD`, not `INVALID_RECIPIENT`.

Direct Evolution physical smokes passed for text, reaction add/remove, image, document and audio. Full Nexos end-to-end physical validation remains pending, so the gate remains `EVOLUTION CONTRACT REWORK REQUIRED`.
