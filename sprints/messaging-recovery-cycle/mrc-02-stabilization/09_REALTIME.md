# Realtime

## Implemented/Preserved

Realtime events include:

- `message.created`
- `message.status.updated`
- `message.reaction.updated`
- `conversation.updated`
- `conversation.unread.updated`
- `connection.status.updated`

MRC-02 added realtime emission for inbound reactions through `MessagingReactionService`.

Runtime health reports:

- realtime: up
- realtime adapter: redis

## Not Physically Proven

- browser no-refresh validation for text
- browser no-refresh validation for media
- browser no-refresh validation for reaction
- browser reconnect validation
