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
