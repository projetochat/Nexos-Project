# Root Cause

## Text

Evolution API v2.3.7 validates `/message/sendText/:instanceName` with root fields `number` and `text`. Nexos was sending `textMessage: { text }`, which produced:

```text
instance requires property "text"
```

## Reaction

Evolution API v2.3.7 validates `/message/sendReaction/:instanceName` with root fields `key` and `reaction`. Nexos was sending `reactionKey` and `reactionMessage`, which produced:

```text
instance requires property "key"
instance requires property "reaction"
```

## Reply

Reply payloads need a provider key, not only a Nexos internal message id. The key must include the quoted provider message id, remote chat JID and original direction. Group replies keep the group as destination and use participant only inside the quoted key when available.

## Recipient

Direct recipients must be sent as a number/JID accepted by Evolution. Group recipients must preserve the `@g.us` JID and must not pass through phone normalization.

## Media

Evolution API v2.3.7 accepts media upload on `/message/sendMedia/:instanceName` with multipart field `file`. Audio/voice/PTT uses `/message/sendWhatsAppAudio/:instanceName` with multipart field `file`; Evolution converts accepted audio to WhatsApp-compatible `audio/ogg; codecs=opus`.

## Inbound Media

The current rework corrected outbound media contract. Full inbound media download/storage/serving validation remains pending in the physical Nexos flow.
