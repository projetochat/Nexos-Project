# Storage

Sprint 11 adiciona boundary privado de arquivos para Tickets.

## Providers

- `LocalPrivateStorageProvider`: desenvolvimento e homologacao local.
- `R2StorageProvider`: boundary S3-compatible para producao, sem credenciais reais exigidas no `verify`.

Configuracao:

- `NEXOS_STORAGE_PROVIDER=local|r2`
- `NEXOS_STORAGE_LOCAL_PATH`
- `NEXOS_STORAGE_MAX_FILE_SIZE_MB`
- `NEXOS_STORAGE_ALLOWED_MIME_TYPES`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`

Secrets nunca devem ser logados.

## Privacidade

Arquivos nao sao publicos. Download usa endpoint autenticado:

`GET /api/tickets/:id/attachments/:attachmentId/download`

A API valida JWT, tenant, visibilidade do Ticket e status `READY` antes de retornar bytes.

## Seguranca

- Object key tenant-scoped: `tenants/{tenantId}/tickets/{ticketId}/{attachmentId}/{safeName}`.
- Nome original e sanitizado antes de persistir.
- Allowlist inicial: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`.
- Limite padrao local: `10 MB`.
- `AttachmentSecurityScanner` existe como boundary; provider local marca `NOT_SCANNED`.
- Base64 pode trafegar somente no complete local, mas nao e persistido no banco.
