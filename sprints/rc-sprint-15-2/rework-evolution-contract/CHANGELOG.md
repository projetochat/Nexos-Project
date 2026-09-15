# Changelog

## 2026-08-06

- Added `EvolutionRecipientNormalizer`.
- Added `EvolutionOutboundPayloadFactory`.
- Restored Evolution v2.3.7 text payload to root `text`.
- Restored Evolution v2.3.7 reaction payload to root `key` and `reaction`.
- Changed Evolution media upload to multipart field `file`.
- Routed audio/voice/PTT through `/message/sendWhatsAppAudio/:instanceName`.
- Added quoted provider key fields to outbound dispatch.
- Reclassified Evolution validation 400 responses as `INVALID_PROVIDER_PAYLOAD` with `providerCode=VALIDATION_ERROR`.
- Preserved outbound worker resilience hotfix.
