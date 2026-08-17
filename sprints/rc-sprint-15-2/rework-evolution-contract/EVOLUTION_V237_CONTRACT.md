# Evolution v2.3.7 Contract

Source: local container `nexos-evolution-api`, image `evoapicloud/evolution-api:v2.3.7`.

Primary local files:
- `/evolution/dist/validate/message.schema.js`
- `/evolution/dist/api/controllers/sendMessage.controller.js`

| Operation | Endpoint | Content-Type | Required fields | Optional fields |
| --- | --- | --- | --- | --- |
| Text | `/message/sendText/:instanceName` | JSON | `number`, `text` | `quoted`, `linkPreview`, `delay`, `everyOne`, `mentioned` |
| Reply | `/message/sendText/:instanceName` or media endpoint | JSON/multipart | Message fields plus `quoted.key.id` | `quoted.key.remoteJid`, `quoted.key.fromMe`, `quoted.key.participant` |
| Reaction | `/message/sendReaction/:instanceName` | JSON | `key.id`, `key.remoteJid`, `key.fromMe`, `reaction` | empty `reaction` removes reaction |
| Image | `/message/sendMedia/:instanceName` | multipart | `number`, `mediatype=image`, `file` | `mimetype`, `fileName`, `caption`, `quoted` |
| Document | `/message/sendMedia/:instanceName` | multipart | `number`, `mediatype=document`, `file` | `mimetype`, `fileName`, `caption`, `quoted` |
| Audio/Voice | `/message/sendWhatsAppAudio/:instanceName` | multipart | `number`, `file` | `quoted` |

Controlled validation:
- Missing text returns 400 with `instance requires property "text"`.
- Missing reaction fields returns 400 with `instance requires property "key"` and `instance requires property "reaction"`.
- Missing media type returns 400 with `instance requires property "mediatype"`.

Direct Evolution smokes against open instance `7c776a09-homologacao-whats-nata-a2250ad4`:
- Text: PASS, HTTP 201, provider id `3EB0735B4DF6AB0C34CE95`.
- Reaction add: PASS, HTTP 201, provider id `3EB0867534BC10A5BBEDAB`.
- Reaction remove: PASS, HTTP 201, provider id `3EB0EC0E19A393079FA162`.
- Image: PASS, HTTP 201, provider id `3EB022CCD160865AF44F3D`.
- Document TXT: PASS, HTTP 201, provider id `3EB0236EA30F188332C9FB`.
- Audio WAV upload: PASS, HTTP 201, provider id `3EB0B057A6BDD11899F106`, provider returned `audio/ogg; codecs=opus` and `ptt=true`.
