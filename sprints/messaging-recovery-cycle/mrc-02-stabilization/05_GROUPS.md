# Groups

## Implemented/Preserved

- Group conversations use `ConversationType.GROUP`.
- Group recipient requires `externalChatId` ending in `@g.us`.
- Inbound group messages resolve one conversation by tenant, connection and `externalChatId`.
- Group participants are upserted with:
  - external id
  - phone
  - LID
  - display name
  - last seen
- Group inbound does not create individual leads for each participant.
- Group outbound is routed through the same Evolution recipient normalizer.

## Not Physically Proven

- group text outbound
- group reply outbound/inbound
- group media
- group audio/voice
- group reaction add/change/remove
- group metadata refresh
