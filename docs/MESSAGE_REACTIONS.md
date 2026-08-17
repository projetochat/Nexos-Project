# Message Reactions

The schema now includes `MessageReaction` and `MessageReactionActorType`.

Modeled actor types:
- `NEXOS_USER`
- `EXTERNAL_PARTICIPANT`
- `CONTACT`
- `SYSTEM`

Current implementation:
- REST endpoint for add/change/remove reaction on a message.
- Evolution outbound dispatch via `/message/sendReaction/{instanceName}`.
- Local upsert/deduplication by tenant, message and actor.
- Realtime event `message.reaction.updated`.
- Inbox reaction controls and rendering.

Remaining gap:
- inbound reaction reconciliation from Evolution webhook still needs physical payload evidence.
- direct/group reaction flow still requires WhatsApp real-device homologation.
# Evolution v2.3.7 reaction contract

Atualizacao RC Sprint 15.2:

```json
{
  "key": {
    "remoteJid": "chat-id",
    "fromMe": true,
    "id": "provider-message-id"
  },
  "reaction": ""
}
```

Regras:
- `key` e `reaction` ficam no root do payload.
- `reaction=""` remove a reacao.
- Em grupo, `key.remoteJid` deve ser o grupo `@g.us`; `participant` e enviado apenas quando disponivel/exigido pela mensagem citada.
- Missing `key`/`reaction` da Evolution e classificado como `INVALID_PROVIDER_PAYLOAD`.

Smokes diretos Evolution PASS para add e remove. Homologacao completa Nexos/grupo permanece pendente.
