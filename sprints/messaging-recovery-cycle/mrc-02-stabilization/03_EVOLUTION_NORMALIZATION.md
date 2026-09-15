# Evolution Normalization

Evolution image remains pinned:

- `evoapicloud/evolution-api:v2.3.7`

Validated contract in code:

- text: root `number` and `text`
- reply: `quoted.key`
- media: multipart field `file`
- audio/voice: `/message/sendWhatsAppAudio` multipart field `file`
- reaction: root `key` and `reaction`
- group recipient: `@g.us`
- direct recipient: phone/JID/LID normalization

Added:

- inbound reaction translation from `reactionMessage.key.id` and `reactionMessage.text`
- reaction removal support when text is empty/null

Automated tests:

- Evolution client/provider/factory/translator targeted tests passed.
- Full verify passed.
