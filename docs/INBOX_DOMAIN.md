# Inbox Domain

## Sprint 10 Rework

A fronteira operacional da Inbox e:

```text
Inbox UI -> Nexos API -> PostgreSQL
```

Rotas cobertas pela guarda de legado:

- `/inbox`
- `/inbox/$conversationId`
- `/etiquetas`
- `/mensagens-rapidas`

Essas superficies nao devem importar `@/lib/mvp`, cliente Supabase, `.from("tags")`,
`.from("quick_replies")` ou aliases legados de runtime.

Tags possuem duas operacoes separadas:

- Catalogo tenant-scoped: criado/editado/arquivado em `/etiquetas` por `chat.tags.manage`.
- Associacao Contact x Tag: aplicada/removida no Contact panel por `chat.tags.use`.

Quick Replies sao API-only em `/api/quick-replies`. O uso no composer apenas insere texto; envio segue no
endpoint oficial de mensagens e continua preservando Outbox, BullMQ, Redis e provider adapter.

## Gate Fisico WhatsApp

O dominio Inbox nao pode ser considerado liberado se o webhook Evolution real apresentar:

- `ECONNREFUSED` para `http://host.docker.internal:3001/api/webhooks/evolution`;
- `HTTP 401` correlacionado ao teste inbound.

O gate fisico exige webhook 2xx autenticado por `jwt_key`, Message inbound persistida, mesma Conversation,
Inbox atualizada sem F5 e zero duplicacao.
