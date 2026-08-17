# Architecture Map

## Outbound Text And Media

1. Frontend inbox calls `messageApi.sendText` or `messageApi.sendMedia`.
2. `MessagesController` receives request under conversations/messages routes.
3. `MessagesService` validates conversation access and delegates to `MessagingOutboundService`.
4. `MessagingOutboundService` persists message and creates outbox event.
5. Outbox dispatcher enqueues BullMQ job in `messaging-outbound`.
6. `MessagingOutboundWorker` consumes the job.
7. Worker calls `MessagingOutboundService.dispatchOutboundMessage`.
8. Provider registry resolves Evolution provider.
9. Evolution provider builds recipient, quoted key and payload.
10. `EvolutionClient` sends to Evolution API.
11. Provider response updates message status/provider ids.
12. Realtime publisher emits message/status changes.

## Inbound

1. Evolution posts webhook to `/api/webhooks/evolution`.
2. Webhook controller authenticates header secret.
3. Evolution translator normalizes event payload.
4. `MessagingInboundService` resolves tenant/connection/contact/conversation.
5. Message is persisted idempotently through external ids.
6. Realtime publishes the inbound message.

## Receipts

1. Evolution sends message status update events.
2. Translator extracts status.
3. `MessagingStatusService` updates message lifecycle fields.
4. Realtime publishes status/timeline changes.

## Reactions

1. Frontend calls reaction endpoint.
2. Conversation service checks authorization.
3. Messaging outbound/provider builds Evolution reaction payload.
4. Inbound reaction events must normalize to `MessageReaction`.
5. Realtime updates conversation message reaction state.

## Storage

1. Frontend uploads multipart media to backend.
2. Backend stores bytes through message media storage provider.
3. Outbound media jobs read storage bytes and send multipart to Evolution.
4. Inbound media must download from Evolution, store privately and expose only authorized download/inline endpoints.
