# Media Trace

## Current Backend Capabilities

The current dirty tree includes:

- media upload endpoint through conversation messages API
- media storage service
- media inline/download endpoints
- metadata fields in Prisma schema
- Evolution multipart send for media
- Evolution WhatsApp audio endpoint usage

## Storage

Health reports:

- storage: up
- storage provider: local

## Risks

- Local provider is active; R2/S3/private provider behavior was not validated.
- No magic-bytes matrix was executed in MRC-01.
- No physical inbound media download from Evolution was executed.
- No authorized download/inline access matrix was executed.
- No audio codec compatibility test was executed through Nexos.

## MRC-02 Requirement

Media must be tested as bytes, not Base64 permanence:

- upload
- checksum
- storage key
- outbound multipart
- inbound download
- private authorized download
- inline authorized view
