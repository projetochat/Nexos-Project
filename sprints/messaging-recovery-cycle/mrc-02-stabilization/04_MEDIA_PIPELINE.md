# Media Pipeline

## Implemented

- Upload storage remains private local provider.
- Magic byte checks are active for PDF, PNG, JPEG, WEBP, OGG, MP3 and MP4 audio.
- SHA-256 checksum is persisted.
- Path traversal is blocked through storage key validation.
- Download and inline endpoints require conversation read authorization.
- Media state added on messages:
  - `PENDING`
  - `DOWNLOADING`
  - `READY`
  - `FAILED`

## State Mapping

- outbound uploaded media: `READY`
- inbound media downloaded and stored: `READY`
- inbound media with failed download: `FAILED`
- inbound media without download URL: `PENDING`

## Remaining Physical Evidence

Physical WhatsApp media matrix was not completed in this cycle:

- image inbound/outbound
- document inbound/outbound
- audio inbound/outbound
- voice/PTT inbound/outbound
- authorized browser download proof
