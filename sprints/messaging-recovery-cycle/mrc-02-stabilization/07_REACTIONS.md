# Reactions

## Implemented

- Outbound reactions use Evolution v2.3.7 root `key` and `reaction`.
- Reaction removal sends empty reaction string.
- Inbound reaction webhook translation added.
- Inbound reaction persistence added through `MessagingReactionService`.
- Realtime reaction event is emitted after persistence.
- Tests added for inbound reaction add/remove.

## Files

- `backend/src/messaging/messaging-reaction.service.ts`
- `backend/src/messaging/messaging-reaction.service.spec.ts`
- `backend/src/messaging/evolution/evolution-webhook.translator.ts`
- `backend/src/messaging/evolution/evolution-webhook.controller.ts`
- `backend/src/messaging/messaging.module.ts`

## Not Physically Proven

- direct physical reaction add/change/remove
- group physical reaction add/change/remove
