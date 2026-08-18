# Storage

Sprint 11 adiciona boundary privado de arquivos para Tickets.

## Providers

- `LocalPrivateStorageProvider`: desenvolvimento, homologacao local e deploy single-host controlado.
- `R2StorageProvider`: boundary S3-compatible reservado para ciclo de deploy; ainda nao e provider funcional de upload/download nesta base.

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

## Decisao PRC-04

O contrato aprovado para Tickets nesta PRC e storage privado local, com caminho fora do repositorio por
`NEXOS_STORAGE_LOCAL_PATH`. Para deixar o sistema online em ambiente multi-instancia ou efemero, o deploy deve
tratar R2/S3-compatible como item obrigatorio antes de aceitar anexos de tickets em producao.

## Privacidade

Arquivos nao sao publicos. Download usa endpoint autenticado:

- `POST /api/tickets/:id/attachments`
- `GET /api/tickets/:id/attachments/:attachmentId/inline`
- `GET /api/tickets/:id/attachments/:attachmentId/download`

A API valida JWT, tenant, visibilidade do Ticket e status `READY` antes de retornar bytes.

## Seguranca

- Object key tenant-scoped: `tenants/{tenantId}/tickets/{ticketId}/{attachmentId}/{safeName}`.
- Nome original e sanitizado antes de persistir.
- Allowlist inicial: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`.
- Limite padrao local: `10 MB`.
- `AttachmentSecurityScanner` existe como boundary; provider local marca `NOT_SCANNED`.
- Upload usa corpo binario autenticado; base64 nao faz parte do contrato publico de Tickets.
