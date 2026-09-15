# Message Receipts

`MessagingStatusService` preserves monotonic outbound status progression.

Supported statuses:
- `PENDING`
- `QUEUED`
- `SENT`
- `DELIVERED`
- `READ`
- `FAILED`

Receipt processing now writes `sentAt`, `deliveredAt`, `readAt`, and `failedAt` when applicable. Inbound messages are no longer marked as WhatsApp-delivered/read using the outbound semantics.

