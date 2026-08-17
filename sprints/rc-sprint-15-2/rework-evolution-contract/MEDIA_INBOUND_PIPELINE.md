# Media Inbound Pipeline

Status: partial, pending physical Nexos validation.

This rework corrected outbound media payloads and direct Evolution media smokes. The inbound media pipeline still requires physical validation in the full Nexos path:

```text
Evolution webhook
-> Nexos normalizer
-> media metadata
-> provider download/decrypt
-> private storage
-> mediaStorageKey
-> authorized inline/download endpoint
-> frontend preview/player
```

Current known gate:
- Image inbound message persistence was previously observed as PASS.
- Image inbound rendering remains pending until `mediaStorageKey`, authorized endpoint and frontend render are verified on a real inbound media message.
