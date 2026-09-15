# Physical Tests

Direct Evolution v2.3.7 smokes using open instance `7c776a09-homologacao-whats-nata-a2250ad4`:
- Text to owner number ending `2679`: PASS, HTTP 201.
- Reaction add on the smoke text message: PASS, HTTP 201.
- Reaction remove with `reaction=""`: PASS, HTTP 201.
- Image upload with multipart `file`: PASS, HTTP 201.
- Document upload with multipart `file`: PASS, HTTP 201.
- Audio upload through `/message/sendWhatsAppAudio`: PASS, HTTP 201, converted to `audio/ogg; codecs=opus`, `ptt=true`.

Trixus physical end-to-end gate:
- Trixus text outbound: pending after code integration.
- Trixus reply outbound direct/group: pending.
- Trixus reaction direct/group: pending.
- Trixus image/document/audio outbound through Outbox: pending.
- Trixus inbound media download/storage/render: pending.
- Full group validation: pending.

Reason:
- `trixus_0801`, used for automated verify, has no physical Evolution connection.
- `trixus_0802` has connected Evolution connection `3092c9c0-cf32-48ef-8b9c-09817a1a3efe` with externalReference `7c776a09-homologacao-whats-nata-a2250ad4`; full browser/API Trixus physical validation was not executed in this turn.
