# Ticketing Domain

Sprint 11 transforma Chamados em dominio oficial do Trixus API.

## Editor e validacao de anexos

O editor de descricao fica em `src/components/ticket-rich-text-editor.tsx`.
O HTML recebido e enviado passa pela sanitizacao de `ticket-editor-dom.ts`;
colagem insere texto puro e arrastar conteudo para o editor e bloqueado.
Imagens e documentos devem usar o fluxo de anexos. Os testes de seguranca
exercitam o componente e sua fronteira de manipulacao do DOM.

Uploads aceitam PDF, PNG, JPEG, WebP e texto puro. O backend rejeita MIME
fora dessa lista e arquivos binarios cuja assinatura nao corresponde ao tipo
declarado, alem de manter as verificacoes de tamanho, permissao e tenant.

## Modelo

- `Ticket`: protocolo tenant-scoped `TKT-000001`, titulo, descricao texto, HTML sanitizado, status, prioridade, categoria, departamento, responsavel, Contact, Customer e Conversation opcionais.
- `TicketComment`: comentario interno, texto puro e HTML sanitizado.
- `TicketHistory`: eventos imutaveis de operacao.
- `TicketAttachment`: metadata privada de storage, sem URL publica e sem base64 persistido.

## Status

Transicoes server-side:

- `ABERTO -> EM_ANDAMENTO | CANCELADO`
- `EM_ANDAMENTO -> AGUARDANDO | RESOLVIDO | CANCELADO`
- `AGUARDANDO -> EM_ANDAMENTO | RESOLVIDO | CANCELADO`
- `RESOLVIDO -> FECHADO | ABERTO`
- `FECHADO -> ABERTO`
- `CANCELADO -> ABERTO`

Transicao invalida retorna `TICKET_STATUS_TRANSITION_INVALID`.

## RBAC e Visibilidade

Permissoes oficiais:

- `tickets.read`
- `tickets.create`
- `tickets.update`
- `tickets.assign`
- `tickets.status.update`
- `tickets.comment`
- `tickets.attachments.upload`
- `tickets.attachments.delete`
- `tickets.manage`

Tenant admin enxerga todo o tenant. Supervisor/agente enxergam tickets do departamento permitido ou tickets atribuidos a sua membership.

## API

- `GET /api/tickets`
- `GET /api/tickets/:id`
- `POST /api/tickets`
- `PATCH /api/tickets/:id`
- `PATCH /api/tickets/:id/status`
- `PATCH /api/tickets/:id/assignee`
- `PATCH /api/tickets/:id/department`
- `DELETE /api/tickets/:id`
- `GET|POST /api/tickets/:id/comments`
- `POST /api/tickets/:id/attachments`
- `GET /api/tickets/:id/attachments`
- `GET /api/tickets/:id/attachments/:attachmentId/inline`
- `GET /api/tickets/:id/attachments/:attachmentId/download`
- `DELETE /api/tickets/:id/attachments/:attachmentId`

Upload de atrixus e feito por corpo binario autenticado, sem base64 e sem URL publica:

- `Content-Type`: MIME real permitido.
- `X-File-Name`: nome original codificado com `encodeURIComponent`.
- `X-File-Size`: tamanho declarado em bytes.

O backend valida tenant, visibilidade do ticket, permissao `tickets.attachments.upload`, allowlist de MIME,
tamanho maximo, assinatura basica do arquivo e existencia do objeto privado antes de marcar o atrixus como
`READY`.

## Realtime

Eventos adicionados:

- `ticket.created`
- `ticket.updated`
- `ticket.status.updated`
- `ticket.assignment.updated`
- `ticket.comment.created`
- `ticket.attachment.created`
- `ticket.attachment.removed`

PostgreSQL permanece fonte da verdade; realtime apenas sincroniza caches.
