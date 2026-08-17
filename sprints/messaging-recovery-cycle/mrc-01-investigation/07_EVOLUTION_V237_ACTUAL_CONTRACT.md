# Evolution v2.3.7 Actual Contract

Version observed from running container:

- image: `evoapicloud/evolution-api:v2.3.7`
- API health version: `2.3.7`

## Endpoints Used By Nexos Current Adapter

- `POST /message/sendText/{instanceName}`
- `POST /message/sendMedia/{instanceName}`
- `POST /message/sendWhatsAppAudio/{instanceName}`
- `POST /message/sendReaction/{instanceName}`
- `GET /instance/fetchInstances`
- `GET /instance/connectionState/{instanceName}`
- `POST /webhook/set/{instanceName}`

## Payload Shapes Identified

Text:

```json
{
  "number": "5511999999999",
  "text": "message",
  "quoted": {
    "key": {
      "id": "provider-message-id",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false
    }
  }
}
```

Media multipart:

- form field `file`
- form field `number`
- form field `mediatype`
- optional `mimetype`
- optional `fileName`
- optional `caption`
- optional serialized `quoted`

Audio multipart:

- endpoint `sendWhatsAppAudio`
- form field `file`
- form field `number`
- optional serialized `quoted`

Reaction:

```json
{
  "key": {
    "id": "provider-message-id",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": false
  },
  "reaction": "👍"
}
```

## Constraint

Do not use generic Evolution documentation in MRC-02. Use the observed v2.3.7 contract and validate against the running image.
