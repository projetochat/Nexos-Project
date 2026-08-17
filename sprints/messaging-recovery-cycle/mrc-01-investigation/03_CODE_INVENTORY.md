# Code Inventory

## Backend Messaging Core

- `backend/src/messaging/messaging.module.ts`
- `backend/src/messaging/messaging.contracts.ts`
- `backend/src/messaging/messaging-outbound.service.ts`
- `backend/src/messaging/messaging-outbound.worker.ts`
- `backend/src/messaging/messaging-inbound.service.ts`
- `backend/src/messaging/messaging-status.service.ts`
- `backend/src/messaging/messaging-provider.registry.ts`
- `backend/src/messaging/media/messaging-media-storage.service.ts`

## Evolution Adapter

- `backend/src/messaging/evolution/evolution.client.ts`
- `backend/src/messaging/evolution/evolution-messaging.provider.ts`
- `backend/src/messaging/evolution/evolution-webhook.controller.ts`
- `backend/src/messaging/evolution/evolution-webhook.translator.ts`
- `backend/src/messaging/evolution/evolution-recipient.normalizer.ts`
- `backend/src/messaging/evolution/evolution-outbound-payload.factory.ts`
- `backend/src/messaging/evolution/evolution-provider-error.classifier.ts`
- `backend/src/messaging/evolution/evolution-startup.service.ts`
- `backend/src/messaging/evolution/evolution.config.ts`

## Conversations API

- `backend/src/conversations/messages.controller.ts`
- `backend/src/conversations/messages.service.ts`
- `backend/src/conversations/dto/send-message.dto.ts`

## Queue

- `backend/src/queue/messaging-outbound.queue.ts`
- `backend/src/queue/outbox-dispatcher.service.ts`
- `backend/src/queue/outbox-poller.service.ts`
- `backend/src/queue/redis-connection.factory.ts`

## Realtime

- `backend/src/realtime/realtime-events.ts`
- `backend/src/realtime/realtime.publisher.ts`
- `backend/src/realtime/realtime.gateway.ts`

## Frontend

- `src/routes/inbox.$conversationId.tsx`
- `src/routes/inbox.index.tsx`
- `src/routes/inbox.tsx`
- `src/lib/nexos-api.ts`
- `src/lib/realtime/**`

## Schema

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260806120000_messaging_core_completion/migration.sql`
