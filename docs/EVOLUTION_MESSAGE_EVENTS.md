# Evolution Message Events

`EvolutionWebhookTranslator` now normalizes:
- direct text
- group text
- quoted text/media context
- image/audio/document envelopes as typed inbound events
- status updates from `messages.update` and `send.message.update`

Known limitation:
- Media download and reaction webhook reconciliation are not fully implemented.
- Outbound reply payload includes the provider quote reference, but still needs validation against the exact deployed Evolution API behavior during physical homologation.

