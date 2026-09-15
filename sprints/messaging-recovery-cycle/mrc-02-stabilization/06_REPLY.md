# Reply

## Implemented/Preserved

- Outbound text/media stores quoted message id and provider id.
- Evolution outbound payload uses `quoted.key`.
- Quoted key requires:
  - provider message id
  - remote JID
  - fromMe
  - participant when available
- Inbound translator extracts quoted provider id, preview and message type from context info.
- Frontend/API contract includes quoted metadata.

## Not Physically Proven

- direct reply outbound against WhatsApp
- direct reply inbound from WhatsApp
- group reply with participant
- quoted media/audio/document previews in real WhatsApp flow
- UI scroll/highlight physical validation
