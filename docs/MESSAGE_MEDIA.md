# Message Media

The database now has message media metadata fields for storage key, MIME, filename, size, dimensions, duration, checksum, SHA-256, and temporary provider URL.

Policy defaults are documented in `.env.example`:
- `NEXOS_MESSAGE_MAX_IMAGE_SIZE_MB`
- `NEXOS_MESSAGE_MAX_AUDIO_SIZE_MB`
- `NEXOS_MESSAGE_MAX_DOCUMENT_SIZE_MB`
- `NEXOS_MESSAGE_ALLOWED_*_MIME_TYPES`

Current implementation:
- outbound image, document, audio and voice messages are stored locally in private storage;
- files are validated by size policy, MIME allowlist, checksum and magic bytes where deterministic;
- media messages are created as `QUEUED` and dispatched by the existing messaging outbox worker;
- Evolution `sendMedia` uses multipart form data;
- Inbox uses Blob/File upload and authorized download/inline endpoints;
- inbound media is stored when the Evolution webhook provides an HTTP media URL.

Known remaining gaps:
- R2/S3 providers are not physically configured in this workspace;
- physical WhatsApp media homologation is still pending;
- dedicated BullMQ queues for media upload/download were not split from the existing outbound worker.
# Evolution v2.3.7 outbound media contract

Atualizacao RC Sprint 15.2:

- Imagem e documento usam `/message/sendMedia/:instanceName`.
- O upload e multipart e o binario deve ir no campo `file`.
- Campos do body: `number`, `mediatype`, `mimetype`, `fileName`, `caption`, `quoted`.
- Audio/voice/PTT usa `/message/sendWhatsAppAudio/:instanceName` com campo `file`.
- Blob URL do frontend e caminho local nunca sao enviados ao provider; o worker le o binario do storage privado.

Smokes diretos Evolution PASS:
- Imagem PNG: HTTP 201.
- Documento TXT: HTTP 201.
- Audio WAV: HTTP 201, convertido pelo provider para `audio/ogg; codecs=opus`, `ptt=true`.

Gate pendente:
- Validar ponta a ponta Nexos Outbox -> Evolution -> WhatsApp.
- Validar inbound media download/storage/inline/download/render.
