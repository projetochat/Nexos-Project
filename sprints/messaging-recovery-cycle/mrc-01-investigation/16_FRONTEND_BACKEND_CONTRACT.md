# Frontend Backend Contract

## Frontend API Surface

`src/lib/nexos-api.ts` contains message API methods for:

- send text
- send media
- react
- media DTOs
- status/reaction/media serialization

## Inbox Route

`src/routes/inbox.$conversationId.tsx` contains UI paths for:

- messages
- reply preview
- media display
- audio preview/player
- reactions
- realtime updates

## Backend API Surface

`MessagesController` exposes:

- send text
- send media
- reaction endpoints
- media inline/download endpoints

## Risk

The UI and API look structurally aligned in the dirty tree, but MRC-01 did not execute frontend physical tests for:

- reply scroll/highlight
- image preview/retry
- document preview/download
- audio record/cancel/send/player
- reaction add/change/remove
- realtime without refresh
